# PipSage Desk

A private trading desk that runs entirely in your browser. No account, no subscription,
no server, no telemetry. Everything you type stays in this browser's `localStorage` until
you export it or wipe it.

Open `index.html` and you land on the dashboard.

---

## What's inside — 14 modules

| Module | What it actually does |
| --- | --- |
| **Dashboard** | Equity, open P&L, realised P&L, win rate and profit factor from your own trades. Equity curve, open positions, watchlist, next high-impact events, routine. |
| **Charts** | Canvas candlestick/line/area/bars with EMA/SMA/Bollinger/VWAP overlays, volume, RSI and MACD panes, drag-to-pan, scroll-to-zoom, crosshair OHLC, structure levels, and a position sizer wired to the same maths as the risk engine. |
| **Positions** | Live marks vs entry, per-position risk to stop, margin and leverage, exposure by class, recently closed. |
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

- Stored under `pipsage.*` keys in `localStorage`. Nothing leaves the browser.
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

That inlines `src/desk.css` plus the nine `src/desk-*.js` files into every shell in
`PAGES`, writes the 14 HTML files, and refreshes `index.html`. No dependencies, no network.

**Rename the product** in one place — the `BRAND` object at the top of `build.js`:

```js
const BRAND = { name: 'PipSage', product: 'Desk', tagline: '…' };
```

Then rebuild. The topbar, page titles, gate and assistant all follow.

## Deploying the static app on Render

The root `render.yaml` defines a public Render Static Site. Connect this repository in Render as a
Blueprint; Render will run `node build.js` and publish the generated HTML files. No app runtime
server or secrets are required for this sample-only deployment. The journal remains in each visitor's
browser `localStorage`, and market prices remain labelled sample data. This static deployment does
not provide broker connections or order execution.

### Layout of the source

```
build.js                 builder + BRAND + PAGES
src/desk.css             the design system (graphite + amber, light theme, responsive)
src/desk-core.js         store, utils, indicators, seed, shell, palette, gate, mount
src/desk-charts.js       canvas chart engine + SVG sparklines / equity / donut
src/desk-ui.js           panels, KPI tiles, tables, forms, money + risk helpers
src/desk-page-*.js       the pages themselves
```

`index.html` is a redirect to `dashboard.html`, so any file works as an entry point.

---

## Notes and limits

- Prices are a seeded sample feed, clearly labelled **sample feed**. Nothing is live and
  nothing connects to a broker. To go live you would need a price source and a broker API.
- Backtests run on seeded OHLC. They demonstrate the engine, not an edge.
- The assistant is rule-based over your own records. It does not call a model and does not
  give financial advice.
