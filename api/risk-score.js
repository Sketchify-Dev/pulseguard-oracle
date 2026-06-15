/**
 * PulseGuard Risk Score API
 * -----------------------------------------
 * GET /api/risk-score?token=<id>
 *   -> single token risk assessment, including an AI-generated insight
 *
 * GET /api/risk-score?tokens=<id1>,<id2>,...
 *   -> batch risk assessment for up to 10 tokens at once.
 *      Batch responses use a rule-based insight (no AI call per token)
 *      to keep response times fast and conserve AI credits. For a full
 *      AI-generated insight, query a single token instead.
 *
 * `<id>` can be a CoinGecko ID (e.g. "solana"), or a name/symbol —
 * PulseGuard searches for the closest match if an exact ID isn't found.
 *
 * Single response shape:
 * {
 *   token: { name, symbol, image },
 *   price: number,
 *   change_24h: number,
 *   risk_score: number,        // 0-100
 *   risk_level: "Low" | "Medium" | "High",
 *   breakdown: { volatility, liquidity, momentum },
 *   ai_insight: string
 * }
 *
 * Batch response shape:
 * { results: [ <single response shape>, ... ] }
 *
 * No API key required. CORS is open (Access-Control-Allow-Origin: *)
 * so any agent or app can call this directly.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { token, tokens } = req.query;

  // --- Batch mode ---
  if (tokens) {
    const ids = tokens.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid tokens provided' });
    }

    const results = await Promise.all(ids.map(async (id) => {
      try {
        const marketData = await fetchTokenData(id);
        const risk = calculateRisk(marketData.market_data);
        return formatResult(marketData, risk, ruleBasedSummary(marketData, risk));
      } catch (e) {
        return { token: { name: id }, error: e.message || 'Token not found' };
      }
    }));

    await incrementUsageCounter();
    return res.status(200).json({ results });
  }

  // --- Single token mode ---
  if (!token || !token.trim()) {
    return res.status(400).json({ error: 'Missing required query parameter: token (or use "tokens" for batch)' });
  }

  try {
    const marketData = await fetchTokenData(token.trim());
    const risk = calculateRisk(marketData.market_data);
    const insight = await getAIInsight(marketData, risk);
    await incrementUsageCounter();
    await saveRiskHistory(
      marketData.id,
      risk.total,
      risk.level,
      marketData.market_data.current_price.usd
    );
    return res.status(200).json(formatResult(marketData, risk, insight));
  } catch (err) {
    return res.status(404).json({ error: err.message || 'Token not found' });
  }
}

function formatResult(marketData, risk, insight) {
  const colorMap = { Low: '#22c55e', Medium: '#eab308', High: '#ef4444' };
  return {
    token: {
      name: marketData.name,
      symbol: marketData.symbol,
      image: marketData.image?.small || marketData.image?.thumb || null
    },
    price: marketData.market_data.current_price.usd,
    change_24h: marketData.market_data.price_change_percentage_24h,
    risk_score: risk.total,
    risk_level: risk.level,
    risk_color: colorMap[risk.level] || '#9aa0ab',
    breakdown: risk.breakdown,
    ai_insight: insight
  };
}

// ---------------------------------------------------------
// Usage tracking — free, no-auth counter via CountAPI.
// Powers the "X risk checks performed" stat on the dashboard
// (see /api/stats). Failures here never break the main response.
// ---------------------------------------------------------
// ---------------------------------------------------------
// Usage counter + Risk History — both stored in Upstash Redis
// Supports both KV_REST_API_* (Vercel native) and UPSTASH_* env var names
// ---------------------------------------------------------
function getRedisConfig() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || null,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || null
  };
}

async function incrementUsageCounter() {
  const { url, token } = getRedisConfig();
  if (!url || !token) return;
  try {
    await fetch(`${url}/incr/pg:total_checks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (e) {
    // non-critical
  }
}

async function saveRiskHistory(tokenId, score, level, price) {
  const { url, token } = getRedisConfig();
  if (!url || !token) return;

  const snapshot = JSON.stringify({ score, level, price, timestamp: Date.now() });
  const key = `pg:history:${tokenId}`;

  try {
    // Use pipeline to run 3 commands in one request
    const pipeline = [
      ['lpush', key, snapshot],
      ['ltrim', key, 0, 9],
      ['expire', key, 604800]
    ];
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pipeline)
    });
  } catch (e) {
    // non-critical — never break the main response
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
