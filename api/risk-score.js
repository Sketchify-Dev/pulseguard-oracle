/**
 * PulseGuard Risk Score API
 * -----------------------------------------
 * GET /api/risk-score?token=<coingecko-id-or-symbol>
 *
 * Returns a structured risk assessment for any token, combining
 * live market data with an AI-generated trader insight.
 *
 * Example: /api/risk-score?token=solana
 *
 * Response shape:
 * {
 *   token: { name, symbol },
 *   price: number,
 *   change_24h: number,
 *   risk_score: number,        // 0-100
 *   risk_level: "Low" | "Medium" | "High",
 *   breakdown: { volatility, liquidity, momentum },
 *   ai_insight: string
 * }
 */

export default async function handler(req, res) {
  const token = (req.query.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Missing required query parameter: token' });
  }

  try {
    const marketData = await fetchTokenData(token);
    const risk = calculateRisk(marketData.market_data);
    const insight = await getAIInsight(marketData, risk);

    return res.status(200).json({
      token: { name: marketData.name, symbol: marketData.symbol },
      price: marketData.market_data.current_price.usd,
      change_24h: marketData.market_data.price_change_percentage_24h,
      risk_score: risk.total,
      risk_level: risk.level,
      breakdown: risk.breakdown,
      ai_insight: insight
    });
  } catch (err) {
    return res.status(404).json({ error: err.message || 'Token not found' });
  }
}

// ---------------------------------------------------------
// 1. Market data — CoinGecko (no API key required)
// ---------------------------------------------------------
async function fetchTokenData(query) {
  const slug = query.toLowerCase().replace(/\s+/g, '-');
  let resp = await fetch(`https://api.coingecko.com/api/v3/coins/${slug}?localization=false&tickers=false&community_data=false&developer_data=false`);

  if (!resp.ok) {
    const searchResp = await fetch(`https://api.coingecko.com/api/v3/search?query=${slug}`);
    const searchData = await searchResp.json();
    if (searchData.coins && searchData.coins.length > 0) {
      const topId = searchData.coins[0].id;
      resp = await fetch(`https://api.coingecko.com/api/v3/coins/${topId}?localization=false&tickers=false&community_data=false&developer_data=false`);
    } else {
      throw new Error('Token not found');
    }
  }
  if (!resp.ok) throw new Error('Token not found');
  return resp.json();
}

// ---------------------------------------------------------
// 2. Risk Engine — turns raw market data into a 0-100 score
// ---------------------------------------------------------
function calculateRisk(m) {
  const change = m.price_change_percentage_24h ?? 0;
  const volume = m.total_volume?.usd ?? 0;
  const mcap = m.market_cap?.usd ?? 1;
  const high = m.high_24h?.usd ?? 0;
  const low = m.low_24h?.usd ?? 0;
  const price = m.current_price?.usd ?? 0;

  // Volatility (max 40): bigger 24h swings = higher risk
  const volatility = Math.min(Math.abs(change) * 2, 40);

  // Liquidity (max 30): low volume relative to market cap = harder to exit
  const volRatio = mcap > 0 ? volume / mcap : 0;
  let liquidity;
  if (volRatio < 0.02) liquidity = 30;
  else if (volRatio < 0.05) liquidity = 20;
  else if (volRatio < 0.10) liquidity = 10;
  else liquidity = 5;

  // Momentum (max 30): price near its 24h high/low = closer to reversal
  const range = high - low;
  const position = range > 0 ? (price - low) / range : 0.5;
  const momentum = Math.abs(position - 0.5) * 60;

  const total = Math.min(Math.round(volatility + liquidity + momentum), 100);

  let level;
  if (total <= 33) level = 'Low';
  else if (total <= 66) level = 'Medium';
  else level = 'High';

  return {
    total,
    level,
    change,
    volRatio,
    position,
    breakdown: {
      volatility: Math.round(volatility),
      liquidity: Math.round(liquidity),
      momentum: Math.round(momentum)
    }
  };
}

// ---------------------------------------------------------
// 3. AI Insight — Qwen (via Alibaba Cloud DashScope)
// Falls back to a rule-based summary if no API key is set,
// so the project still works during local development.
// ---------------------------------------------------------
async function getAIInsight(marketData, risk) {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) return ruleBasedSummary(marketData, risk);

  const prompt = `You're a crypto market analyst. Token: ${marketData.name} (${marketData.symbol.toUpperCase()})
Price: $${marketData.market_data.current_price.usd}
24h change: ${risk.change.toFixed(2)}%
Risk score: ${risk.total}/100 (${risk.level} Risk)
Breakdown - Volatility: ${risk.breakdown.volatility}/40, Liquidity risk: ${risk.breakdown.liquidity}/30, Momentum: ${risk.breakdown.momentum}/30

In 2 short sentences, explain this token's risk profile to a trader and what to watch out for. Be direct and specific, no disclaimers.`;

  try {
    const response = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150
      })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || ruleBasedSummary(marketData, risk);
  } catch (e) {
    return ruleBasedSummary(marketData, risk);
  }
}

function ruleBasedSummary(marketData, risk) {
  const sorted = Object.entries(risk.breakdown).sort((a, b) => b[1] - a[1]);
  const [topFactor] = sorted[0];
  const reasons = {
    volatility: `a sharp 24h price move of ${risk.change.toFixed(2)}%`,
    liquidity: `relatively thin trading volume (${(risk.volRatio * 100).toFixed(2)}% of market cap)`,
    momentum: `price sitting near its 24h ${risk.position > 0.5 ? 'high' : 'low'}`
  };
  return `${risk.level} Risk — primarily driven by ${reasons[topFactor]}.`;
}
