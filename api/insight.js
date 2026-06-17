export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, symbol, price, change24h, riskScore, riskLevel, breakdown, fallback } = req.body || {};

  // Save to Redis immediately before anything that can fail
  // Strip $ and commas from price string before saving (frontend sends "$68.14")
  const tokenId = (name || symbol || 'unknown').toLowerCase().replace(/\s+/g, '-');
  const numericPrice = parseFloat((price || '0').toString().replace(/[$,]/g, '')) || 0;
  await saveToRedis(tokenId, riskScore, riskLevel, numericPrice).catch(() => {});

  const apiKey = process.env.QWEN_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      insight: fallback || `${riskLevel} based on volatility, liquidity, and momentum analysis.`,
      source: 'fallback'
    });
  }

  const prompt = `You are a professional crypto market analyst writing a short note for a trader's dashboard.

Token: ${name} (${symbol})
Current price: $${price}
24h change: ${change24h}%
Risk score: ${riskScore}/100 (${riskLevel})
Breakdown — Volatility: ${breakdown.volatility}/40, Liquidity risk: ${breakdown.liquidity}/30, Momentum: ${breakdown.momentum}/30

Write 2-3 sentences explaining what this risk profile means for a trader right now. Be specific, confident, and avoid generic disclaimers. Do not repeat the raw numbers back verbatim, interpret them.`;

  try {
    const response = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 160,
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error(`Qwen API returned ${response.status}`);

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();

    return res.status(200).json({
      insight: text || fallback || 'No insight generated.',
      source: text ? 'qwen' : 'fallback'
    });
  } catch (err) {
    return res.status(200).json({
      insight: fallback || `${riskLevel} based on volatility, liquidity, and momentum analysis.`,
      source: 'fallback',
      error: err.message
    });
  }
}

// ─────────────────────────────────────────
// Redis helpers
// ─────────────────────────────────────────
function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token, ready: !!(url && token) };
}

async function saveToRedis(tokenId, score, level, price) {
  const { url, token, ready } = getRedis();
  if (!ready) return;

  const snapshot = JSON.stringify({ score, level, price, timestamp: Date.now() });
  const histKey = `pg:history:${tokenId}`;

  await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['incr', 'pg:total_checks'],
      ['lpush', histKey, snapshot],
      ['ltrim', histKey, 0, 9],
      ['expire', histKey, 604800]
    ])
  });
}
