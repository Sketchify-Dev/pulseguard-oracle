// /api/insight.js
//
// This runs on the SERVER (Vercel), never in the browser.
// The frontend sends it the calculated risk data, and this
// function asks Qwen (Alibaba Cloud) to write a short,
// trader-style explanation of what that data means.
//
// Why a separate backend function?
// If we called Qwen directly from the browser, our API key
// would be visible to anyone who views the page source
// and they could use up our credits. Keeping the call here
// keeps the key private.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, symbol, price, change24h, riskScore, riskLevel, breakdown, fallback } = req.body || {};

  const apiKey = process.env.QWEN_API_KEY;

  // If no API key is configured yet, gracefully fall back
  // to the rule-based summary instead of breaking the app.
  if (!apiKey) {
    return res.status(200).json({
      insight: fallback || `${riskLevel} — based on volatility, liquidity, and momentum analysis.`,
      source: 'fallback'
    });
  }

  const prompt = `You are a professional crypto market analyst writing a short note for a trader's dashboard.

Token: ${name} (${symbol})
Current price: $${price}
24h change: ${change24h}%
Risk score: ${riskScore}/100 (${riskLevel})
Breakdown - Volatility: ${breakdown.volatility}/40, Liquidity risk: ${breakdown.liquidity}/30, Momentum: ${breakdown.momentum}/30

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

    if (!response.ok) {
      throw new Error(`Qwen API returned ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();

    return res.status(200).json({
      insight: text || fallback || 'No insight generated.',
      source: text ? 'qwen' : 'fallback'
    });
  } catch (err) {
    // Never let an AI hiccup break the dashboard fall back gracefully
    return res.status(200).json({
      insight: fallback || `${riskLevel} - based on volatility, liquidity, and momentum analysis.`,
      source: 'fallback',
      error: err.message
    });
  }
}
