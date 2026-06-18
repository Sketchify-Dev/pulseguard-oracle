# PulseGuard ⚡

**Real-time Risk Intelligence API for Crypto Trading**

PulseGuard is a risk scoring engine built for traders and AI trading agents. It turns live market data into a structured 0–100 risk score, an AI-generated trader insight, and a pre-trade recommendation — all available through a free public API with no authentication required.

Built for the **Bitget AI Base Camp Hackathon S1** — Trading Infrastructure track.

🔗 **Live demo:** https://pulseguard-two.vercel.app
📖 **API docs:** https://pulseguard-two.vercel.app/docs.html

---

## The Problem

Most traders size up a token's risk by gut feeling — glance at the chart, check the 24h change, decide whether to ape in. There is no quick, standardized way to ask "how risky is this token right now?"

AI trading agents have the same problem. They need a machine-readable risk signal they can act on directly — but most tools are built only for humans, not for other software to consume.

PulseGuard solves both.

---

## What PulseGuard Does

PulseGuard scores any token's risk in real-time using three weighted factors:

| Factor | Weight | What it measures |
|---|---|---|
| Volatility | 40% | Absolute 24h price change — bigger swings = higher risk |
| Liquidity | 30% | Volume / market cap ratio — thin liquidity = harder to exit |
| Momentum | 30% | Price position in 24h range — near extremes = reversal risk |

Each score comes with:
- An **AI-generated trader insight** from Qwen explaining what the score means right now
- A **Trade Confidence score** (0–100) with recommended max position size
- A **Risk History timeline** showing how the score has changed over time
- A **Pre-trade risk check** with position sizing analysis and risk flags

Available as both a **visual dashboard** and a **free public API**.

---

## API Reference

All endpoints are open — no API key, no signup, CORS enabled.

### Single Token
```
GET /api/risk-score?token=<id>
```

`<id>` accepts a CoinGecko ID, name, or symbol. Auto-searches if exact ID not found.

**Example:**
```
GET https://pulseguard-two.vercel.app/api/risk-score?token=solana
```

**Response:**
```json
{
  "token": { "name": "Solana", "symbol": "sol", "image": "https://..." },
  "price": 68.14,
  "change_24h": 2.18,
  "risk_score": 43,
  "risk_level": "Medium",
  "risk_color": "#f5c542",
  "breakdown": { "volatility": 4, "liquidity": 20, "momentum": 18 },
  "ai_insight": "Solana shows moderate risk driven by thin liquidity..."
}
```

---

### Batch (up to 10 tokens)
```
GET /api/risk-score?tokens=<id1>,<id2>,...
```

Score multiple tokens in one request. Batch mode uses rule-based insights for speed — use single token for full AI insight.

**Example:**
```
GET https://pulseguard-two.vercel.app/api/risk-score?tokens=solana,bitcoin,ethereum
```

**Response:**
```json
{ "results": [ { "token": {...}, "risk_score": 43, "risk_level": "Medium", ... }, ... ] }
```

---

### Pre-Trade Risk Check
```
POST /api/pretrade
Content-Type: application/json
```

**Body:**
```json
{ "token": "solana", "amount": 500, "portfolio_value": 5000 }
```

Returns risk flags, position sizing analysis, and an AI-powered recommendation before you enter a trade.

**Response:**
```json
{
  "token": { "name": "Solana", "symbol": "sol" },
  "risk_score": 43,
  "risk_level": "Medium",
  "risk_color": "#f5c542",
  "position_check": {
    "entered_pct": 10,
    "max_allocation_pct": 10,
    "over_exposed": false,
    "warning": null
  },
  "flags": [ { "severity": "medium", "message": "Below-average liquidity..." } ],
  "ai_verdict": "Position sizing looks acceptable for a Medium Risk token..."
}
```

---

### Risk History
```
GET /api/history?token=<id>
```

Returns the last 10 risk score snapshots for a token, stored every time it is checked. Powers the Risk History timeline on the dashboard.

**Example:**
```
GET https://pulseguard-two.vercel.app/api/history?token=solana
```

**Response:**
```json
{
  "token": "solana",
  "history": [
    { "score": 43, "level": "Medium", "price": 68.14, "timestamp": 1718870400000 },
    { "score": 38, "level": "Medium", "price": 65.20, "timestamp": 1718784000000 }
  ],
  "momentum": { "delta": 5, "trend": "rising", "label": "▲ +5 Rising" }
}
```

---

### Stats
```
GET /api/stats
```

Returns total number of risk checks performed across all users.

**Response:**
```json
{ "total_checks": 142 }
```

---

## Dashboard Features

| Feature | Description |
|---|---|
| Single Token | Live risk score, breakdown bars, AI insight, price + 24h change |
| Risk Contributors | Explainable breakdown showing what's driving each score |
| Risk History | Timeline of last 10 scores for the checked token with trend arrows |
| Trade Confidence | 0–100 confidence score with recommended max position size — labeled "Bitget Ready" |
| Compare | Side-by-side risk comparison of any two tokens with plain-English verdict |
| Watchlist | Save up to 5 tokens, persists across visits |
| Share Card | Screenshot-ready risk card + formatted Twitter/X post copy |
| Pre-Trade Check | Enter token + trade size + portfolio — get flags, position analysis, AI verdict |
| API Playground | Live endpoint tester built into the docs page — no Postman needed |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — no framework, zero build step |
| Backend | Vercel Serverless Functions (Node.js ES modules) |
| Market data | CoinGecko API (free tier, no key required) |
| AI insights | Qwen (qwen-turbo) via Alibaba Cloud DashScope |
| Risk history | Upstash Redis (via Vercel KV integration) |
| Hosting | Vercel |

---

## Project Structure

```
pulseguard/
├── index.html           # Dashboard UI
├── docs.html            # Developer API reference + playground
├── api/
│   ├── risk-score.js    # Public risk API — single + batch (GET)
│   ├── insight.js       # AI insight + Redis tracking (POST)
│   ├── pretrade.js      # Pre-trade risk check (POST)
│   ├── history.js       # Risk score timeline (GET)
│   └── stats.js         # Usage counter (GET)
├── package.json
├── .env.example
└── README.md
```

---

## Running Locally / Deploying Your Own

1. Clone this repo
2. Copy `.env.example` to `.env` and fill in your keys:
```bash
QWEN_API_KEY=your_dashscope_api_key   # Qwen AI insights
KV_REST_API_URL=your_upstash_url      # Redis history + stats
KV_REST_API_TOKEN=your_upstash_token  # Redis auth token
```
3. Deploy to Vercel — zero config needed. `/api` functions are auto-detected
4. Add the same environment variables in Vercel project settings
5. Redeploy to pick up the env vars

Without `QWEN_API_KEY`, PulseGuard falls back to rule-based summaries — dashboard and API still work fully.
Without `KV_REST_API_URL`, history and stats are disabled gracefully — all other features still work.

---

## Why This Fits Trading Infrastructure

**For traders:** instant visual risk reading on any token before entering a position, with Trade Confidence score and position size recommendation.

**For AI agents:** one API call returns a structured risk signal — `risk_score`, `risk_level`, `risk_color`, `breakdown`, `ai_insight` — no auth, no setup, plug-and-play into any trading workflow.

**For developers:** full API docs at `/docs.html` with a live playground to test every endpoint without leaving the browser.

**Extensible:** the risk formula, AI prompt, data source, and storage layer are each isolated. Adding on-chain metrics, sentiment data, or Bitget Agent Hub Skill Hub signals is a straightforward extension.

---

## Roadmap

- [ ] Bitget Agent Hub Skill Hub integration (sentiment + technical analysis signals)
- [ ] WebSocket stream for real-time risk updates
- [ ] Multi-timeframe risk scoring (1h, 4h, 1d)
- [ ] Portfolio-level risk aggregation across multiple tokens

---

## Verifiable Usage

- Live API call counter: `GET /api/stats`
- Risk history per token: `GET /api/history?token=<id>`
- Both powered by Upstash Redis, updated on every token check

---

## Team

Built solo by **Sketchify Labs** ([@0xSketchify](https://x.com/0xSketchify)) for the Bitget AI Base Camp Hackathon S1 — Trading Infrastructure track, June 2026.

## License

MIT
