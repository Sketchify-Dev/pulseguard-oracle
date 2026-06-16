export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(200).json({ 
      error: 'No Redis config',
      found_vars: Object.keys(process.env).filter(k => k.includes('KV') || k.includes('REDIS') || k.includes('UPSTASH'))
    });
  }

  const snapshot = JSON.stringify({ score: 55, level: 'Medium', price: 68.14, timestamp: Date.now() });
  const key = 'pg:history:debug-test';

  try {
    // Write
    const writeRes = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['lpush', key, snapshot],
        ['ltrim', key, 0, 9],
        ['expire', key, 300],
        ['incr', 'pg:debug:counter']
      ])
    });
    const writeData = await writeRes.json();

    // Read back
    const readRes = await fetch(`${url}/pipeline`, {
      method: 'POST', 
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['lrange', key, 0, 9],
        ['get', 'pg:total_checks'],
        ['get', 'pg:debug:counter']
      ])
    });
    const readData = await readRes.json();

    return res.status(200).json({
      write: writeData,
      read: readData,
      snapshot_written: snapshot,
      redis_url_prefix: url.substring(0, 35) + '...'
    });
  } catch(e) {
    return res.status(200).json({ error: e.message });
  }
}
