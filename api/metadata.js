// GET /api/metadata
// A2MCP discovery endpoint — OKX.AI reads this to list and describe the service.
// Keep this in sync with whatever you enter during ASP registration.

export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    name: "PulseGuard Oracle",
    tagline: "The second opinion your agent gets before it apes in.",
    description:
      "Real-time crypto risk intelligence. Feed it a token, get back a 0-100 " +
      "risk score built from volatility, liquidity depth, and momentum — plus " +
      "a plain-language verdict an agent (or a human) can act on in one read.",
    category: "Finance Copilot",
    version: "1.0.0",
    provider: {
      name: "Sketchify",
      contact: "sketchifydev@gmail.com"
    },
    pricing: {
      type: "free" // switch to "x402" later for a paid tier
    },
    endpoints: [
      {
        name: "risk-score",
        method: "POST",
        path: "/api/risk-score",
        description:
          "Returns a risk score (0-100), a risk band (Low/Medium/High/Extreme), " +
          "a one-line verdict, and the three sub-scores that built it.",
        input_schema: {
          type: "object",
          properties: {
            token_id: {
              type: "string",
              description:
                "CoinGecko token id, e.g. 'bitcoin', 'ethereum', 'solana'."
            }
          },
          required: ["token_id"]
        },
        output_schema: {
          type: "object",
          properties: {
            token: { type: "string" },
            risk_score: { type: "number", description: "0 (safest) - 100 (riskiest)" },
            risk_band: { type: "string", enum: ["Low", "Medium", "High", "Extreme"] },
            verdict: { type: "string" },
            breakdown: {
              type: "object",
              properties: {
                volatility: { type: "number" },
                liquidity_risk: { type: "number" },
                momentum: { type: "number" }
              }
            },
            generated_at: { type: "string" }
          }
        }
      }
    ]
  });
}
