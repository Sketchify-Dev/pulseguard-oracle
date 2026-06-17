/**
 * PulseGuard Stats API
 * GET /api/stats
 * Returns total risk checks performed, powered by Upstash Redis counter.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(200).json({ total_checks: 0, note: 'Storage not configured' });
  }

  try {
    const response = await fetch(`${url}/get/pg:total_checks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    const total = parseInt(data.result) || 0;
    return res.status(200).json({ total_checks: total });
  } catch (e) {
    return res.status(200).json({ total_checks: 0 });
  }
}
