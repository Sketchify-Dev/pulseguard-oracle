/**
 * PulseGuard Stats API
 * -----------------------------------------
 * GET /api/stats
 *
 * Returns the total number of risk checks performed across
 * all PulseGuard users powers the live counter on the dashboard
 * and serves as a verifiable usage metric.
 *
 * Response: { total_checks: number | null }
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const response = await fetch('https://api.countapi.xyz/get/sketchify-pulseguard/risk-checks');
    const data = await response.json();
    return res.status(200).json({ total_checks: data.value ?? 0 });
  } catch (e) {
    return res.status(200).json({ total_checks: null });
  }
}
