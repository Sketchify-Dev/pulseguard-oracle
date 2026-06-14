/**
 * PulseGuard Risk History API
 * -----------------------------------------
 * GET /api/history?token=<id>
 *
 * Returns the last 10 risk score snapshots for a token,
 * stored in Upstash Redis every time /api/risk-score is called.
 * Powers the Risk Timeline chart on the dashboard.
 *
 * Response:
 * {
 *   token: string,
 *   history: [{ score, level, price, timestamp }],
 *   momentum: { delta, trend, label }
 * }
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = (req.query.token || '').trim().toLowerCase();
  if (!token) return res.status(400).json({ error: 'Missing token parameter' });

  try {
    const history = await getHistory(token);
    const momentum = calculateMomentum(history);
    return res.status(200).json({ token, history, momentum });
  } catch (e) {
    return res.status(200).json({ token, history: [], momentum: null });
  }
}

async function getHistory(tokenId) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return [];

  const res = await fetch(`${url}/lrange/pg:history:${tokenId}/0/9`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return (data.result || []).map(item => {
    try { return JSON.parse(item); } catch { return null; }
  }).filter(Boolean);
}

function calculateMomentum(history) {
  if (history.length < 2) return null;
  const current = history[0].score;
  const previous = history[1].score;
  const delta = current - previous;

  let trend, label;
  if (Math.abs(delta) <= 3) { trend = 'stable'; label = '● Stable Risk'; }
  else if (delta > 0) { trend = 'rising'; label = `▲ +${delta} Rising`; }
  else { trend = 'falling'; label = `▼ ${delta} Improving`; }

  // Check escalation: rising 3x in a row
  let escalating = false;
  if (history.length >= 4) {
    escalating = history[2].score < history[1].score &&
                 history[1].score < history[0].score;
  }

  return { delta, trend, label, escalating };
}
