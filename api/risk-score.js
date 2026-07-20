// POST /api/risk-score
// Body: { "token_id": "bitcoin" }   (CoinGecko token id)
//
// A2MCP free-tier contract: no payment negotiation, just return the result.
// Scoring weights match PulseGuard: Volatility 40%, Liquidity 30%, Momentum 30%.

const COINGECKO_URL = (id) =>
  `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    id
  )}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

// --- Sub-scores: each returns 0 (safe) to 100 (risky) ---

function volatilityScore(md) {
  const change24h = Math.abs(md.price_change_percentage_24h ?? 0);
  const price = md.current_price?.usd ?? 0;
  const high = md.high_24h?.usd ?? price;
  const low = md.low_24h?.usd ?? price;
  const rangePct = price > 0 ? ((high - low) / price) * 100 : 0;

  // Blend daily swing % and intraday range %, scaled so ~20% swing = max risk
  const raw = change24h * 2.5 + rangePct * 1.5;
  return clamp(raw);
}

function liquidityRiskScore(md) {
  const volume = md.total_volume?.usd ?? 0;
  const mcap = md.market_cap?.usd ?? 0;
  if (mcap <= 0) return 100;

  const turnoverPct = (volume / mcap) * 100; // majors typically run 1-5%
  let raw;
  if (turnoverPct >= 3) {
    raw = 10;
  } else if (turnoverPct <= 0.05) {
    raw = 97;
  } else {
    // log-scale interpolation between 0.05% (worst) and 3% (best)
    const t =
      (Math.log(turnoverPct) - Math.log(0.05)) /
      (Math.log(3) - Math.log(0.05));
    raw = 97 - t * 87;
  }

  // A high ratio on tiny absolute volume is still a thin, exit-risky market —
  // floor the score so micro-cap pumps can't game the ratio.
  if (volume < 500_000) raw = Math.max(raw, 85);
  else if (volume < 2_000_000) raw = Math.max(raw, 60);

  return clamp(raw);
}

function momentumScore(md) {
  const change7d = md.price_change_percentage_7d_in_currency?.usd ?? 0;
  const change24h = md.price_change_percentage_24h ?? 0;

  // Sharp negative momentum is riskiest; sharp positive momentum (pump risk)
  // also carries real risk, just slightly less than a bleed.
  const bleedRisk = change7d < 0 ? Math.abs(change7d) * 3 : 0;
  const pumpRisk = change7d > 0 ? change7d * 2 : 0;
  const accelRisk = Math.abs(change24h) * 1.2;

  return clamp(bleedRisk + pumpRisk + accelRisk * 0.3);
}

function verdictFor(score, band) {
  const lines = {
    Low: "Stable footing — normal market behavior, no red flags in the data.",
    Medium: "Some turbulence — worth a second look before sizing up a position.",
    High: "Choppy and thin — treat this as a trade, not a hold, if you enter at all.",
    Extreme: "Sharp swings and weak liquidity — high odds of a rough exit."
  };
  return lines[band];
}

function bandFor(score) {
  if (score < 30) return "Low";
  if (score < 55) return "Medium";
  if (score < 80) return "High";
  return "Extreme";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST with a JSON body: { token_id }" });
    return;
  }

  const { token_id } = req.body || {};
  if (!token_id || typeof token_id !== "string") {
    res.status(400).json({ error: "Missing required field: token_id (string, e.g. 'bitcoin')" });
    return;
  }

  try {
    const cgRes = await fetch(COINGECKO_URL(token_id));
    if (!cgRes.ok) {
      res.status(404).json({ error: `Token '${token_id}' not found on CoinGecko` });
      return;
    }
    const data = await cgRes.json();
    const md = data.market_data;
    if (!md) {
      res.status(502).json({ error: "No market data available for this token" });
      return;
    }

    const volatility = Math.round(volatilityScore(md));
    const liquidity_risk = Math.round(liquidityRiskScore(md));
    const momentum = Math.round(momentumScore(md));

    const risk_score = Math.round(
      volatility * 0.4 + liquidity_risk * 0.3 + momentum * 0.3
    );
    const risk_band = bandFor(risk_score);

    res.status(200).json({
      token: data.symbol ? data.symbol.toUpperCase() : token_id,
      risk_score,
      risk_band,
      verdict: verdictFor(risk_score, risk_band),
      breakdown: { volatility, liquidity_risk, momentum },
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: "Risk scoring failed", detail: String(err) });
  }
}
