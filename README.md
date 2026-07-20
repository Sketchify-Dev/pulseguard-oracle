# PulseGuard Oracle — A2MCP Listing (metadata only)

*"The second opinion your agent gets before it apes in."*

## What changed from the first version

The original plan built a brand-new `/api/risk-score.js`. That was a mistake —
PulseGuard already has a live `/api/risk-score` endpoint (GET, `?token=`) that
your dashboard depends on, and it got overwritten, returning 405 errors.

**Fix:** restore the original file, then add ONLY `api/metadata.js` (a new
route, zero collision risk). Your existing `/api/risk-score` and `/api/pretrade`
endpoints already satisfy what A2MCP needs — no new scoring logic required.

## 1. Restore the original endpoint (do this first)

```bash
cd your-pulseguard-repo
git log --oneline -- api/risk-score.js
git checkout <commit-before-my-change> -- api/risk-score.js
git commit -m "Restore original risk-score endpoint"
git push
```

Confirm it's back:
```bash
curl "https://pulseguard-two.vercel.app/api/risk-score?token=solana"
```
Should return `risk_score`, `risk_level`, `breakdown`, `ai_insight` — not a 405.

## 2. Add the metadata file (safe, new route)

Drop `api/metadata.js` from this folder into your repo at that exact path,
commit, push. It describes your EXISTING `/api/risk-score` and `/api/pretrade`
endpoints — it doesn't add or replace any scoring logic.

```bash
curl https://pulseguard-two.vercel.app/api/metadata
```
Should return the PulseGuard Oracle service description as JSON.

## 3. Register as an ASP

In Claude Code / Codex (Onchain OS installed, Agentic Wallet logged in):

```
Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS
```

Give it:
- **Name:** PulseGuard Oracle
- **Endpoint:** `https://pulseguard-two.vercel.app/api/risk-score`
- **Metadata:** `https://pulseguard-two.vercel.app/api/metadata`
- **Pricing:** free
- **Category:** Finance Copilot

Then:
```
Help me list my ASP on OKX.AI using Onchain OS
```

## 4. Positioning (reuse for the listing blurb and the X post)

**Name:** PulseGuard Oracle
**One-liner:** Ask before you ape. One call returns a risk score, a level,
and the three signals behind it — volatility, liquidity, momentum — plus a
plain-English read from Qwen.
**Why it's different:** No black box. Full transparent formula, live on a
public dashboard players can already screenshot and share as a "risk card."
