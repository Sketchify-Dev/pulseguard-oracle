/**
 * PulseGuard Risk Score API
 * GET /api/risk-score?token=<id>  — single token
 * GET /api/risk-score?tokens=<id1>,<id2>,...  — batch up to 10
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { token, tokens } = req.query;

  if (tokens) {
    const ids = tokens.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);
    if (ids.length === 0) return res.status(400).json({ error: 'No valid tokens provided' });
    const results = await Promise.all(ids.map(async (id) => {
      try {
        const marketData = await fetchTokenData(id);
        const risk = calculateRisk(marketData.market_data);
        return formatResult(marketData, risk, ruleBasedSummary(marketData, risk));
      } catch (e) { return { token: { name: id }, error: e.message || 'Token not found' }; }
    }));
    await incrementUsageCounter();
    return res.status(200).json({ results });
  }

  if (!token || !token.trim()) return res.status(400).json({ error: 'Missing token parameter' });

  try {
    const marketData = await fetchTokenData(token.trim());
    const risk = calculateRisk(marketData.market_data);
    const insight = await getAIInsight(marketData, risk);
    await incrementUsageCounter();
    await saveRiskHistory(marketData.id, risk.total, risk.level, marketData.market_data.current_price.usd);
    return res.status(200).json(formatResult(marketData, risk, insight));
  } catch (err) {
    return res.status(404).json({ error: err.message || 'Token not found' });
  }
}

function formatResult(marketData, risk, insight) {
  const colorMap = { Low: '#22d87a', Medium: '#f5c542', High: '#ff4f6a' };
  return {
    token: { name: marketData.name, symbol: marketData.symbol, image: marketData.image?.small || null },
    price: marketData.market_data.current_price.usd,
    change_24h: marketData.market_data.price_change_percentage_24h,
    risk_score: risk.total,
    risk_level: risk.level,
    risk_color: colorMap[risk.level] || '#9aa0ab',
    breakdown: risk.breakdown,
    ai_insight: insight
  };
}

function getRedisConfig() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || null,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || null
  };
}

async function incrementUsageCounter() {
  const { url, token } = getRedisConfig();
  if (!url || !token) { console.error('[PulseGuard] Redis not configured'); return; }
  try {
    const r = await fetch(`${url}/incr/pg:total_checks`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    console.log('[PulseGuard] Counter:', JSON.stringify(d));
  } catch (e) { console.error('[PulseGuard] Counter error:', e.message); }
}

async function saveRiskHistory(tokenId, score, level, price) {
  const { url, token } = getRedisConfig();
  if (!url || !token) return;
  const snapshot = JSON.stringify({ score, level, price, timestamp: Date.now() });
  const key = `pg:history:${tokenId}`;
  try {
    const pipeline = [['lpush', key, snapshot], ['ltrim', key, 0, 9], ['expire', key, 604800]];
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline)
    });
    const d = await r.json();
    console.log('[PulseGuard] History saved for', tokenId, ':', JSON.stringify(d));
  } catch (e) { console.error('[PulseGuard] History error:', e.message); }
}

async function fetchTokenData(query) {
  const slug = query.toLowerCase().replace(/\s+/g, '-');
  let resp = await fetch(`https://api.coingecko.com/api/v3/coins/${slug}?localization=false&tickers=false&community_data=false&developer_data=false`);
  if (!resp.ok) {
    const s = await fetch(`https://api.coingecko.com/api/v3/search?query=${slug}`);
    const sd = await s.json();
    if (sd.coins?.length > 0) resp = await fetch(`https://api.coingecko.com/api/v3/coins/${sd.coins[0].id}?localization=false&tickers=false&community_data=false&developer_data=false`);
    else throw new Error('Token not found');
  }
  if (!resp.ok) throw new Error('Token not found');
  return resp.json();
}

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
  return { total, level, change, volRatio, position, breakdown: { volatility: Math.round(volatility), liquidity: Math.round(liquidity), momentum: Math.round(momentum) } };
}

async function getAIInsight(marketData, risk) {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) return ruleBasedSummary(marketData, risk);
  const prompt = `You're a crypto market analyst. Token: ${marketData.name} (${marketData.symbol.toUpperCase()})\nPrice: $${marketData.market_data.current_price.usd}\n24h change: ${risk.change.toFixed(2)}%\nRisk score: ${risk.total}/100 (${risk.level} Risk)\nBreakdown - Volatility: ${risk.breakdown.volatility}/40, Liquidity: ${risk.breakdown.liquidity}/30, Momentum: ${risk.breakdown.momentum}/30\n\nIn 2 short sentences, explain this token's risk profile to a trader. Be direct, no disclaimers.`;
  try {
    const response = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen-plus', messages: [{ role: 'user', content: prompt }], max_tokens: 150 })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || ruleBasedSummary(marketData, risk);
  } catch (e) { return ruleBasedSummary(marketData, risk); }
}

function ruleBasedSummary(marketData, risk) {
  const [topFactor] = Object.entries(risk.breakdown).sort((a, b) => b[1] - a[1]);
  const reasons = {
    volatility: `a sharp 24h move of ${risk.change.toFixed(2)}%`,
    liquidity: `thin volume (${(risk.volRatio * 100).toFixed(2)}% of market cap)`,
    momentum: `price near its 24h ${risk.position > 0.5 ? 'high' : 'low'}`
  };
  return `${risk.level} Risk — primarily driven by ${reasons[topFactor[0]]}.`;
}
