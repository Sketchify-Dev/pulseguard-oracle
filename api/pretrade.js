/**
 * PulseGuard Pre-Trade Risk Check API
 * -----------------------------------------
 * POST /api/pretrade
 * Body: { token: string, amount: number, portfolio_value: number }
 *
 * Returns a pre-trade risk assessment with actionable recommendations.
 * Helps traders size positions based on current risk signals.
 *
 * Response:
 * {
 *   token: { name, symbol, image },
 *   risk_score: number,
 *   risk_level: string,
 *   position_size: { recommended, max, warning },
 *   flags: [{ severity, message }],
 *   recommendation: string,
 *   ai_verdict: string
 * }
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { token, amount, portfolio_value } = req.body || {};

  if (!token) return res.status(400).json({ error: 'Missing required field: token' });

  try {
    // Fetch live market data
    const marketData = await fetchTokenData(token);
    const risk = calculateRisk(marketData.market_data);

    // Position sizing logic
    const positionCheck = analyzePosition(risk, amount, portfolio_value);

    // Risk flags
    const flags = generateFlags(marketData, risk, amount, portfolio_value);

    // AI verdict
    const aiVerdict = await getAIVerdict(marketData, risk, positionCheck, flags);

    return res.status(200).json({
      token: {
        name: marketData.name,
        symbol: marketData.symbol,
        image: marketData.image?.small || null
      },
      risk_score: risk.total,
      risk_level: risk.level,
      risk_color: risk.level === 'Low' ? '#22d87a' : risk.level === 'Medium' ? '#f5c542' : '#ff4f6a',
      position_check: positionCheck,
      flags,
      ai_verdict: aiVerdict
    });

  } catch (e) {
    return res.status(404).json({ error: e.message || 'Token not found' });
  }
}

// ---------------------------------------------------------
// Position sizing engine
// ---------------------------------------------------------
function analyzePosition(risk, amount, portfolioValue) {
  // Max recommended allocation based on risk score
  // Low risk (0-33): up to 20% of portfolio
  // Medium risk (34-66): up to 10% of portfolio
  // High risk (67-100): up to 5% of portfolio
  const maxPct = risk.total <= 33 ? 0.20 : risk.total <= 66 ? 0.10 : 0.05;
  const maxAmount = portfolioValue ? portfolioValue * maxPct : null;

  if (!amount || !portfolioValue) {
    return {
      max_allocation_pct: Math.round(maxPct * 100),
      warning: null
    };
  }

  const actualPct = amount / portfolioValue;
  const overExposed = actualPct > maxPct;
  const recommendedAmount = Math.round(portfolioValue * maxPct);

  return {
    entered_amount: amount,
    portfolio_value: portfolioValue,
    entered_pct: Math.round(actualPct * 100),
    max_allocation_pct: Math.round(maxPct * 100),
    recommended_amount: recommendedAmount,
    over_exposed: overExposed,
    warning: overExposed
      ? `Position size (${Math.round(actualPct * 100)}%) exceeds recommended max (${Math.round(maxPct * 100)}%) for ${risk.level} Risk tokens`
      : null
  };
}

// ---------------------------------------------------------
// Risk flags engine
// ---------------------------------------------------------
function generateFlags(marketData, risk, amount, portfolioValue) {
  const flags = [];
  const m = marketData.market_data;
  const change = m.price_change_percentage_24h ?? 0;
  const volRatio = (m.total_volume?.usd ?? 0) / (m.market_cap?.usd ?? 1);

  if (Math.abs(change) > 10) {
    flags.push({ severity: 'high', message: `Extreme 24h price movement (${change.toFixed(1)}%) elevated volatility risk` });
  } else if (Math.abs(change) > 5) {
    flags.push({ severity: 'medium', message: `Above-average 24h price movement (${change.toFixed(1)}%)` });
  }

  if (volRatio < 0.02) {
    flags.push({ severity: 'high', message: 'Very thin liquidity: large orders may cause significant slippage' });
  } else if (volRatio < 0.05) {
    flags.push({ severity: 'medium', message: 'Below-average liquidity: consider smaller position size' });
  }

  if (risk.total > 75) {
    flags.push({ severity: 'high', message: `High overall risk score (${risk.total}/100): position with extreme caution` });
  }

  const high = m.high_24h?.usd ?? 0, low = m.low_24h?.usd ?? 0, price = m.current_price?.usd ?? 0;
  const range = high - low;
  if (range > 0) {
    const position = (price - low) / range;
    if (position > 0.9) flags.push({ severity: 'medium', message: 'Price near 24h high, potential resistance zone' });
    if (position < 0.1) flags.push({ severity: 'medium', message: 'Price near 24h low, watch for further downside' });
  }

  if (amount && portfolioValue && (amount / portfolioValue) > 0.25) {
    flags.push({ severity: 'high', message: 'Position exceeds 25% of portfolio, dangerous concentration risk' });
  }

  if (flags.length === 0) {
    flags.push({ severity: 'low', message: 'No major risk flags detected, conditions look relatively stable' });
  }

  return flags;
}

// ---------------------------------------------------------
// Market data fetch
// ---------------------------------------------------------
async function fetchTokenData(query) {
  const slug = query.trim().toLowerCase().replace(/\s+/g, '-');
  let res = await fetch(`https://api.coingecko.com/api/v3/coins/${slug}?localization=false&tickers=false&community_data=false&developer_data=false`);
  if (!res.ok) {
    const s = await fetch(`https://api.coingecko.com/api/v3/search?query=${slug}`);
    const sd = await s.json();
    if (sd.coins?.length > 0) {
      res = await fetch(`https://api.coingecko.com/api/v3/coins/${sd.coins[0].id}?localization=false&tickers=false&community_data=false&developer_data=false`);
    } else throw new Error('Token not found');
  }
  if (!res.ok) throw new Error('Token not found');
  return res.json();
}

// ---------------------------------------------------------
// Risk engine
// ---------------------------------------------------------
function calculateRisk(m) {
  const change = m.price_change_percentage_24h ?? 0;
  const volume = m.total_volume?.usd ?? 0, mcap = m.market_cap?.usd ?? 1;
  const high = m.high_24h?.usd ?? 0, low = m.low_24h?.usd ?? 0, price = m.current_price?.usd ?? 0;
  const volatility = Math.min(Math.abs(change) * 2, 40);
  const volRatio = mcap > 0 ? volume / mcap : 0;
  const liquidity = volRatio < 0.02 ? 30 : volRatio < 0.05 ? 20 : volRatio < 0.10 ? 10 : 5;
  const range = high - low, position = range > 0 ? (price - low) / range : 0.5;
  const momentum = Math.abs(position - 0.5) * 60;
  const total = Math.min(Math.round(volatility + liquidity + momentum), 100);
  const level = total <= 33 ? 'Low' : total <= 66 ? 'Medium' : 'High';
  return { total, level, breakdown: { volatility: Math.round(volatility), liquidity: Math.round(liquidity), momentum: Math.round(momentum) } };
}

// ---------------------------------------------------------
// AI verdict via Qwen
// ---------------------------------------------------------
async function getAIVerdict(marketData, risk, positionCheck, flags) {
  const apiKey = process.env.QWEN_API_KEY;
  const highFlags = flags.filter(f => f.severity === 'high').map(f => f.message).join('; ');

  const fallback = positionCheck.over_exposed
    ? `Reduce position size to ${positionCheck.max_allocation_pct}% of portfolio. ${risk.level} Risk score of ${risk.total}/100 with ${highFlags || 'elevated risk signals'} suggests caution.`
    : `Position sizing looks acceptable for a ${risk.level} Risk token. Monitor ${highFlags || 'market conditions'} before entering.`;

  if (!apiKey) return fallback;

  try {
    const prompt = `You are a crypto risk advisor. A trader wants to ${positionCheck.entered_amount ? `trade $${positionCheck.entered_amount}` : 'trade'} in ${marketData.name} (${marketData.symbol.toUpperCase()}).
Risk score: ${risk.total}/100 (${risk.level} Risk)
${positionCheck.over_exposed ? `Position size ${positionCheck.entered_pct}% exceeds recommended max ${positionCheck.max_allocation_pct}%.` : ''}
Key flags: ${highFlags || 'None'}

Give a 2-sentence actionable trading recommendation. Be direct and specific. No disclaimers.`;

    const response = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen-plus', messages: [{ role: 'user', content: prompt }], max_tokens: 120 })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || fallback;
  } catch { return fallback; }
}
