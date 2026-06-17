export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(200).json({ error: 'No Redis config' });
  }

  // Simulate exactly what risk-score.js does
  const tokenId = 'solana';
  const snapshot = JSON.stringify({ score: 42, level: 'Medium', price: 68.14, timestamp: Date.now() });
  const key = `pg:history:${tokenId}`;

  try {
    // Step 1: incr counter (same as redisIncr)
    const incrRes = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['incr', 'pg:total_checks']])
    });
    const incrData = await incrRes.json();

    // Step 2: save history (same as redisSaveHistory)
    const histRes = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['lpush', key, snapshot],
        ['ltrim', key, 0, 9],
        ['expire', key, 604800]
      ])
    });
    const histData = await histRes.json();

    // Step 3: read back to verify
    const readRes = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['get', 'pg:total_checks'],
        ['lrange', key, 0, 2]
      ])
    });
    const readData = await readRes.json();

    return res.status(200).json({
      step1_incr: incrData,
      step2_history: histData,
      step3_verify: readData,
      conclusion: {
        counter: readData[0]?.result,
        history_count: readData[1]?.result?.length || 0
      }
    });
  } catch(e) {
    return res.status(200).json({ error: e.message });
  }
}
