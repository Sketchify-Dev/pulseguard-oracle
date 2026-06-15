/**
 * PulseGuard Debug — temporary endpoint to test Upstash connection
 * GET /api/debug
 * Remove this file after confirming history works
 */

export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(200).json({ error: 'No Redis env vars found', vars: Object.keys(process.env).filter(k => k.includes('KV') || k.includes('REDIS') || k.includes('UPSTASH')) });
  }

  try {
    // 1. Write a test value
    const writeRes = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['set', 'pg:debug:test', JSON.stringify({ score: 42, level: 'Low', price: 99.9, timestamp: Date.now() })],
        ['lpush', 'pg:history:debug', JSON.stringify({ score: 42, level: 'Low', price: 99.9, timestamp: Date.now() })],
        ['lrange', 'pg:history:debug', 0, 9]
      ])
    });
    const writeData = await writeRes.json();

    // 2. Read it back
    const readRes = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['get', 'pg:debug:test'],
        ['lrange', 'pg:history:debug', 0, 9],
        ['get', 'pg:total_checks']
      ])
    });
    const readData = await readRes.json();

    return res.status(200).json({
      write_response: writeData,
      read_response: readData,
      url_prefix: url.substring(0, 30) + '...',
      token_prefix: token.substring(0, 10) + '...'
    });
  } catch (e) {
    return res.status(200).json({ error: e.message, stack: e.stack });
  }
}
