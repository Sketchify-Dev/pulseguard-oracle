// GET /api/metadata
// A2MCP discovery endpoint — describes PulseGuard's EXISTING /api/risk-score
// endpoint. This file only ADDS a new route; it does not touch risk-score.js.

export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    name: "PulseGuard Oracle",
    tagline: "The second opinion your agent gets before it apes in.",
    description:
      "Real-time crypto risk intelligence. Feed it a token, get back a 0-100 " +
      "risk score built from volatility, liquidity, and 24h momentum — plus " +
      "a Qwen-generated plain-language read an agent can act on immediately.",
    category: "Finance Copilot",
    version: "1.0.0",
    provider: {
      name: "Sketchify",
      contact: "sketchifydev@gmail.com"
    },
    pricing: {
      type: "free"
    },
    endpoints: [
      {
        name: "risk-score",
        method: "GET",
        path: "/api/risk-score",
        description:
          "Single-token risk check. Returns a 0-100 risk score, a risk level " +
          "(Low/Medium/High), a breakdown of the three weighted signals, and " +
          "an AI-generated plain-English verdict.",
        input_schema: {
          type: "object",
          properties: {
            token: {
              type: "string",
              description:
                "CoinGecko ID, name, or symbol — e.g. 'solana', 'btc', 'bonk'."
            }
          },
          required: ["token"]
        },
        output_schema: {
          type: "object",
          properties: {
            token: { type: "object" },
            price: { type: "number" },
            change_24h: { type: "number" },
            risk_score: { type: "number", description: "0 (safest) - 100 (riskiest)" },
            risk_level: { type: "string", enum: ["Low", "Medium", "High"] },
            breakdown: {
              type: "object",
              properties: {
                volatility: { type: "number" },
                liquidity: { type: "number" },
                momentum: { type: "number" }
              }
            },
            ai_insight: { type: "string" }
          }
        }
      },
      {
        name: "pretrade",
        method: "POST",
        path: "/api/pretrade",
        description:
          "Pre-trade risk check with position sizing. Pass a trade amount and " +
          "portfolio value; get back an over-exposure warning and AI verdict.",
        input_schema: {
          type: "object",
          properties: {
            token: { type: "string" },
            amount: { type: "number", description: "USD value of intended trade (optional)" },
            portfolio_value: { type: "number", description: "Total portfolio size in USD (optional)" }
          },
          required: ["token"]
        }
      }
    ]
  });
}
