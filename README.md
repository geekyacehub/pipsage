# PipSage Desk

A single-user trading desk with a local-first journal and a public static web app. Sample-only mode
runs in the browser; optional Exness MT5 quotes and demo orders use an owner-authenticated Render API
and a Windows desktop bridge. Journal data remains in this browser's `localStorage`; broker credentials
stay inside your already signed-in MT5 terminal. No subscription surface or telemetry.

Open `index.html` and you land on the dashboard.

---

## What's inside — 14 modules

| Module | What it actually does |
| --- | --- |
| **Dashboard** | Equity, P&L, win rate and profit factor from your local journal; watchlist marks use fresh MT5 quotes when connected, otherwise clearly labelled sample prices. |
| **Charts** | Live bid/ask and market quotes when connected; canvas candlesticks, overlays, indicators and backtests remain labelled sample OHLC. Demo-only Exness MT5 market-order ticket requires a protective stop. |
| **Positions** | Local journal positions with sample or fresh quote marks, per-position risk to stop, exposure by class, recently closed. This is not a synchronized list of broker positions. |
| **Journal** | Full trade log with filters, CSV import/export, add/edit modal that shows realised P&L and R before you save, daily reflections, and P&L grouped by setup. |
| **Strategies** | Strategy library with rules, checklists, live expectancy per strategy, and on/off state. |
| **Backtest lab** | Bar-by-bar EMA-crossover engine on seeded OHLC: net, profit factor, win rate, max drawdown, equity curve, drawdown curve, monthly returns, and the simulated trade list. |
| **Risk console** | Daily loss budget, worst case if every stop fills, open risk, per-position audit against your limits, risk-of-ruin estimate, exposure concentration, and your worst behaviour. |
| **Calendar** | Session clock in IST, grouped economic events with impact ratings, news blackout state, per-session edge from your own trades, pre-session checklist. |
| **Notes** | Tagged, searchable, pinnable notes with a modal editor. Trade ideas, mistakes, book notes. |
| **Routine** | Tasks grouped by phase, a weekly habits heat grid, a standing pre-market checklist, and a consistency score. |
| **Analytics** | Equity curve, P&L by setup / session / instrument / weekday / hour, R-multiple distribution, streaks, averages. |
| **Playbook** | Your snippets, strategies and rules in one searchable place — with live copy buttons. |
| **Assistant** | Answers questions about *your* data — worst setup, risk today, sizing, session edge, weekly summary. Rule-based and local; it tells you when it doesn't know. |
| **Settings** | Profile, risk defaults, broker accounts, appearance, access lock, export / import / demo data / wipe. |

---

## Money maths (the part that has to be right)

Every P&L figure on every page comes from one place:

```
contract size per symbol  ×  lots  ×  price move  ÷  quote-currency rate to USD
```

Contract sizes are stored per instrument — FX 100,000 · XAUUSD 100 · XAGUSD 5,000 ·
BTC/ETH 1 · NAS100/US30/SPX500/GER40 1 · USOIL 1,000. A USDJPY trade converts through its
exit rate. Risk-to-stop, position sizing, R and the risk console all use the same helpers
(`PS.pnlFor`, `PS.rFor`, `PS.riskCashFor`, `PS.contractOf`), so a number on the charts page
matches the same number in the console.

The seeded demo account is a plausible one: **$25,000** starting balance, **+$4,734.82**
realised over 15 closed trades, 73.3% win rate, profit factor 5.27.

---

## Your data

- Journal, notes, strategies and settings are stored under `pipsage.*` keys in `localStorage` and are not uploaded to the API.
- When the MT5 connector is enabled, quotes and demo-order requests pass through the protected Render API. The owner token is kept in this tab's `sessionStorage`; the MT5 account password is never entered into PipSage.
- **Settings → Your data → Export backup** writes a single JSON file. **Import backup** restores it.
- **Load demo data** reseeds the sample account. **Delete everything** clears your records and disables automatic demo reseeding; use Load demo data to restore the sample account.
- **Access lock** is a local convenience lock, not encryption. Anyone with the browser profile
  and devtools can read the store. It keeps a shoulder-surfer out, nothing more.

---

## Rebuilding

The pages are generated from source so nothing is duplicated 14 times by hand.

```bash
cd pipsage
node build.js
```

That inlines `src/desk.css` plus the app JavaScript into every shell in `PAGES`, writes the 14 HTML files, and refreshes `index.html`. The build uses Node built-ins only. If `PIPSAGE_API_URL` is set at build time, the public API origin is embedded; no secret is.

**Rename the product** in one place — the `BRAND` object at the top of `build.js`:

```js
const BRAND = { name: 'PipSage', product: 'Desk', tagline: '…' };
```

Then rebuild. The topbar, page titles, gate and assistant all follow.

## Render deployment and Exness MT5 demo connector

The public Render Static Site runs `node build.js` and publishes the generated HTML. Without the
optional API service and desktop bridge, it is sample-only.

### Create the protected API service

In Render, create a **Web Service** from this repository and the branch that contains these changes:

- Runtime: **Node**; root directory: blank
- Build command: `node --check api/server.js`
- Start command: `node api/server.js`
- Health check path: `/health`

Set these environment variables on the API service (use the actual static-site origin shown by Render):

| Variable | Value |
| --- | --- |
| `PIPSAGE_OWNER_TOKEN` | A fresh 64-character random hex token |
| `PIPSAGE_BRIDGE_TOKEN` | A different fresh 64-character random hex token |
| `PIPSAGE_APP_ORIGIN` | `https://pipsage-desk.onrender.com` |
| `PIPSAGE_MAX_RISK_PERCENT` | `1.25` (demo account equity risk cap per order) |

Generate the two tokens privately on your own machine (run this twice):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do not commit or paste these secrets into chat. Keep the owner token for Settings and the bridge token
for the Windows PC. The API keeps quotes/order state in memory only; after a service restart, wait for
the bridge to reconnect and verify any uncertain order in MT5 before submitting another.

### Point the static site at the API

After the API service is live, add `PIPSAGE_API_URL=https://<your-api-service>.onrender.com` to the
static site's build environment variables and redeploy. Use the service's actual HTTPS origin.

### Run the bridge on the Windows PC

Keep the Exness MT5 **demo** terminal open and signed in. From a local project checkout on that PC:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r bridge\requirements.txt
$env:PIPSAGE_API_URL = 'https://<your-api-service>.onrender.com'
$secureToken = Read-Host 'Bridge token from Render' -AsSecureString
$env:PIPSAGE_BRIDGE_TOKEN = [System.Net.NetworkCredential]::new('', $secureToken).Password
python bridge\mt5_bridge.py
```

The bridge attaches to the existing MT5 terminal and does not take its username or password. The PC
and terminal must stay online for quotes and demo orders. By default, the bridge tries exact symbol
names. If Exness uses suffixes or different names, copy `bridge/symbol-map.example.json` to
`bridge/symbol-map.local.json` and edit values to the exact names shown in MT5 Market Watch. The local
mapping file is git-ignored. Unmapped symbols are reported in Settings and cannot be traded.

Finally, open **Settings → Exness MT5 connection** on the public site and enter the owner token. The
Charts page shows live bid/ask for fresh mapped symbols and a demo-only market order ticket. Orders
require a stop loss; the bridge verifies the MT5 demo account, broker volume rules and broker-calculated
stop risk before its single send attempt. Partial fills are reported separately with the actual filled volume. If an execution result is uncertain, the desk keeps new orders locked until you check MT5 history and explicitly mark the order reviewed; never assume a timeout means the order failed. API state is in memory, so after a service restart verify MT5 history before retrying. Real accounts are blocked by this connector.

**Important limits:** chart candles, backtests, sample account records and calendar events remain
sample data. The connector streams quotes for symbols that exist and are mapped in the MT5 terminal;
it does not synchronize broker positions into the local journal. MT5 quotes are broker-specific and
may differ from other feeds.

### Layout of the source

```
build.js                 builder + BRAND + PAGES; embeds public API origin when configured
src/desk.css             design system (graphite + amber, light theme, responsive)
src/desk-core.js         store, utils, sample market, math, shell, palette, gate, mount
src/desk-broker.js       owner-authenticated quote polling and demo ticket client
src/desk-charts.js       canvas chart engine + SVG sparklines / equity / donut
src/desk-ui.js           panels, KPI tiles, tables, forms, money + risk helpers
src/desk-page-*.js       the pages themselves
api/server.js            dependency-free Node relay, scoped to demo-only API operations
bridge/mt5_bridge.py     Windows bridge to the already-signed-in MT5 desktop terminal
```

`index.html` is a redirect to `dashboard.html`, so any file works as an entry point.

---

## Notes and limits

- If the API/Windows bridge is not configured or a quote is stale, the UI falls back to clearly
  labelled sample prices. The demo connector is not considered live until Settings verifies the
  Exness MT5 terminal and fresh quotes arrive.
- Demo market orders only. The connector refuses live/contest accounts; there is no real-money
  execution mode in this implementation.
- Backtests and chart candles still use seeded OHLC. They demonstrate the engine, not an edge.
- The assistant is rule-based over local records. It does not call a model and does not give financial advice.
- This public site has no user-data account system. Each browser has its own local journal; the API
  token protects the broker relay, not the public pages or local-device data.
