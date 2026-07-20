# PulseGuard Oracle — A2MCP Service

*"The second opinion your agent gets before it apes in."*

A free-tier A2MCP service for OKX.AI Genesis. Any agent can call it with a
CoinGecko token id and get back a 0-100 risk score, a risk band, and a
one-line verdict — built from the same weighting as PulseGuard
(Volatility 40% / Liquidity 30% / Momentum 30%).

## 1. Deploy

```bash
npm i -g vercel
cd pulseguard-a2mcp
vercel --prod
```

Note the deployed URL, e.g. `https://pulseguard-oracle.vercel.app`.

## 2. Smoke test

```bash
curl https://pulseguard-oracle.vercel.app/api/metadata

curl -X POST https://pulseguard-oracle.vercel.app/api/risk-score \
  -H "Content-Type: application/json" \
  -d '{"token_id": "bitcoin"}'
```

## 3. Register as an ASP

In Claude Code / Codex (with the Onchain OS skill installed and Agentic
Wallet logged in), run:

```
Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS
```

When it asks for endpoint details, give it:
- **Name:** PulseGuard Oracle
- **Endpoint:** `https://pulseguard-oracle.vercel.app/api/risk-score`
- **Metadata:** `https://pulseguard-oracle.vercel.app/api/metadata`
- **Pricing:** free
- **Category:** Finance Copilot

Then:
```
Help me list my ASP on OKX.AI using Onchain OS
```

## 4. Positioning (reuse this for the listing blurb and the X post)

**Name:** PulseGuard Oracle
**One-liner:** Ask before you ape. One call returns a risk score, a verdict,
and the three signals behind it — volatility, liquidity depth, momentum.
**Why it's different:** Most risk tools dump raw numbers. PulseGuard Oracle
gives agents (and the humans reading their output) a verdict they can act on
without doing the math themselves — a "pulse check," not a spreadsheet.

## Next: paid tier (optional, if time allows)

Swap `pricing.type` in `api/metadata.js` from `"free"` to `"x402"` and wire
the OKX Payment SDK into `api/risk-score.js` before returning a result.
Not required to go live — free tier is enough to register, list, and demo.
