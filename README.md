# PulseGuard ⚡

**AI-powered risk scoring for any crypto token — as a dashboard and a free public API.**

Built for the [Bitget AI Hackathon](https://www.bitget.com/campaigns/d8a2a61fd63c4bc2a3c8198ec923da9a) — Trading Infrastructure track.

🔗 **Live demo:** https://pulseguard-two.vercel.app

---

## The Problem

Most traders size up a token's risk by gut feeling — glance at the chart, check the 24h change, decide whether to ape in. There's no quick, standardized way to ask *"how risky is this token right now?"*

Meanwhile, AI trading agents need machine-readable risk signals they can act on directly — but most tools are built only for humans, not for other software to consume.

## What PulseGuard Does

PulseGuard turns live market data into a **0-100 risk score** using three weighted factors:

| Factor | Weight | What it measures |
|---|---|---|
| Volatility | 40% | How sharply the price moved in the last 24h |
| Liquidity | 30% | Trading volume relative to market cap — thin volume means harder to exit |
| Momentum | 30% | How close the price is to its 24h high/low — extremes signal reversal risk |

Each score comes with an AI-generated trader insight from **Qwen**, with a graceful rule-based fallback so the tool never breaks without an API key.

Available as:
- 🖥️ **Dashboard** — visual risk reading with Compare mode, Watchlist, and Share cards
- 🔌 **Free public API** — structured JSON, no auth required, plug-and-play for any agent

---

## API Reference

### Single Token
```
GET /api/risk-score?token=<id>
```

`<id>` accepts a CoinGecko ID, name, or symbol. PulseGuard finds the closest match automatically.

**Example:**
```
GET https://pulseguard-two.vercel.app/api/risk-score?token=solana
```

**Response:**
```json
{
  "token": {
    "name": "Solana",
    "symbol": "sol",
    "image": "https://coin-images.coingecko.com/..."
  },
  "price": 68.14,
  "change_24h": 2.18,
  "risk_score": 43,
  "risk_level": "Medium",
  "risk_color": "#eab308",
  "breakdown": {
    "volatility": 4,
    "liquidity": 20,
    "momentum": 18
  },
  "ai_insight": "Solana is showing moderate risk..."
}
```

---

### Batch (up to 10 tokens)
```
GET /api/risk-score?tokens=<id1>,<id2>,...
```

Score multiple tokens in a single request. Batch responses use rule-based insights (no AI call per token) to keep response times fast and conserve credits. For full AI insight, use the single token endpoint.

**Example:**
```
GET https://pulseguard-two.vercel.app/api/risk-score?tokens=solana,bitcoin,ethereum
```

**Response:**
```json
{
  "results": [
    { "token": { "name": "Solana", ... }, "risk_score": 43, "risk_level": "Medium", ... },
    { "token": { "name": "Bitcoin", ... }, "risk_score": 31, "risk_level": "Low", ... },
    { "token": { "name": "Ethereum", ... }, "risk_score": 26, "risk_level": "Low", ... }
  ]
}
```

---

### Stats
```
GET /api/stats
```

Returns the total number of risk checks performed across all PulseGuard users.

**Response:**
```json
{ "total_checks": 142 }
```

---

All endpoints have **CORS open** (`Access-Control-Allow-Origin: *`) — any frontend, agent, or app can call them directly with no setup.

---

## Dashboard Features

- **Single Token** — live risk score, breakdown bars, AI insight, price + 24h change
- **Compare** — side-by-side risk comparison of any two tokens with a plain-English verdict
- **Watchlist** — save up to 5 tokens, persists across visits via localStorage
- **Share Card** — generates a screenshot-ready risk card + copies a formatted Twitter/X post
- **API Showcase** — clickable live API endpoints at the bottom of the dashboard

---

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS — no framework, zero build step, instant load
- **Backend:** Vercel Serverless Functions (Node.js ES modules)
- **Market data:** [CoinGecko API](https://www.coingecko.com/en/api) — free, no key required
- **AI insights:** [Qwen](https://qwenlm.github.io/) via Alibaba Cloud DashScope
- **Usage tracking:** CountAPI (free, no auth)
- **Hosting:** Vercel

## Project Structure

```
pulseguard/
├── index.html           # Dashboard UI (Single, Compare, Watchlist, Share)
├── api/
│   ├── risk-score.js    # Public risk API — single + batch (GET)
│   ├── insight.js       # AI insight endpoint used by dashboard (POST)
│   └── stats.js         # Usage counter endpoint (GET)
├── package.json
├── .env.example
└── README.md
```

## Running Locally / Deploying Your Own

1. Clone this repo
2. Copy `.env.example` to `.env` and add your `QWEN_API_KEY` from [Alibaba Cloud DashScope](https://dashscope.console.aliyun.com/)
3. Deploy to Vercel — zero config needed. `/api` functions are auto-detected, `index.html` serves as the homepage
4. Add `QWEN_API_KEY` as an environment variable in Vercel project settings → Redeploy

If no `QWEN_API_KEY` is set, PulseGuard falls back to rule-based summaries — the dashboard and API still work fully.

## Why This Fits Trading Infrastructure

- **For traders:** instant, visual risk reading on any token before entering a position
- **For AI agents:** one API call returns a structured risk signal — no auth, no setup, no parsing required
- **Extensible:** risk formula, AI prompt, and data source are each isolated — easy to extend with on-chain metrics, sentiment data, or Bitget Agent Hub skills

## Roadmap

- [ ] Historical risk tracking (score over time)
- [ ] Integration with Bitget Agent Hub on-chain + sentiment skills
- [ ] Response caching for high-traffic usage
- [ ] WebSocket stream for real-time risk updates

## Team

Built solo by **Sketchify Labs** ([@0xSketchify](https://x.com/0xSketchify)) for the Bitget AI × Crypto Trading Hackathon — Season 1, June 2026.

## License

MIT
