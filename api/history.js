/**
 * PulseGuard Risk History API
 * GET /api/history?token=<id>
 * Returns last 10 risk score snapshots for a token from Upstash Redis.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = (req.query.token || '').trim().toLowerCase();
  if (!token) return res.status(400).json({ error: 'Missing token parameter' });

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const authToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !authToken) {
    return res.status(200).json({ token, history: [], momentum: null, note: 'Storage not configured' });
  }

  try {
    const response = await fetch(`${url}/lrange/pg:history:${token}/0/9`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await response.json();
    const history = (data.result || []).map(item => {
      try { return JSON.parse(item); } catch { return null; }
    }).filter(Boolean);

    const momentum = calculateMomentum(history);
    return res.status(200).json({ token, history, momentum });
  } catch (e) {
    return res.status(200).json({ token, history: [], momentum: null, error: e.message });
  }
}

function calculateMomentum(history) {
  if (history.length < 2) return null;
  const delta = history[0].score - history[1].score;
  let trend, label;
  if (Math.abs(delta) <= 3) { trend = 'stable'; label = '● Stable Risk'; }
  else if (delta > 0) { trend = 'rising'; label = `▲ +${delta} Rising`; }
  else { trend = 'falling'; label = `▼ ${delta} Improving`; }
  const escalating = history.length >= 4 &&
    history[0].score > history[1].score &&
    history[1].score > history[2].score &&
    history[2].score > history[3].score;
  return { delta, trend, label, escalating };
}
