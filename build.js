#!/usr/bin/env node
/**
 * PipSage Desk — static builder.
 * Every page is the same shell + the shared runtime + one page module.
 *
 * Usage: node build.js
 * Rebrand: edit BRAND below and rebuild.
 */
const fs = require('fs');
const path = require('path');

const BRAND = {
  name: 'PipSage',
  product: 'Desk',
  tagline: 'A private trading workspace for one.',
};

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const read = (p) => fs.readFileSync(p, 'utf8');

const apiUrlSetting = String(process.env.PIPSAGE_API_URL || '').trim();
let PIPSAGE_API_URL = '';
if (apiUrlSetting) {
  let parsedApiUrl;
  try { parsedApiUrl = new URL(apiUrlSetting); }
  catch (_) { throw new Error('PIPSAGE_API_URL must be an HTTPS service origin.'); }
  if (parsedApiUrl.protocol !== 'https:' || parsedApiUrl.username || parsedApiUrl.password || parsedApiUrl.pathname !== '/' || parsedApiUrl.search || parsedApiUrl.hash) {
    throw new Error('PIPSAGE_API_URL must be an HTTPS origin with no credentials, path, query, or fragment.');
  }
  PIPSAGE_API_URL = parsedApiUrl.origin;
}
const API_URL_JSON = JSON.stringify(PIPSAGE_API_URL).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const PAGES = [
  { file: 'dashboard.html', page: 'dashboard', nav: 'dashboard.html', title: 'Dashboard', desc: 'Your desk at a glance: equity, risk, positions and the day ahead.' },
  { file: 'charts.html', page: 'charts', nav: 'charts.html', title: 'Charts', desc: 'Candlestick analysis with overlays, indicators and structure levels.' },
  { file: 'positions.html', page: 'positions', nav: 'positions.html', title: 'Positions', desc: 'Open exposure, risk to stops and execution history.' },
  { file: 'journal.html', page: 'journal', nav: 'journal.html', title: 'Journal', desc: 'Your private trade log, reflections and setup statistics.' },
  { file: 'strategies.html', page: 'strategies', nav: 'strategies.html', title: 'Strategies', desc: 'Draft, inspect and manage your strategies.' },
  { file: 'lab.html', page: 'lab', nav: 'lab.html', title: 'Backtest lab', desc: 'Bar-by-bar backtesting on sample market data.' },
  { file: 'risk.html', page: 'risk', nav: 'risk.html', title: 'Risk console', desc: 'Limits, exposure audit and the honest worst case.' },
  { file: 'calendar.html', page: 'calendar', nav: 'calendar.html', title: 'Calendar', desc: 'Scheduled releases and the session clock.' },
  { file: 'notes.html', page: 'notes', nav: 'notes.html', title: 'Notes', desc: 'Rules, playbook fragments and ideas worth keeping.' },
  { file: 'tasks.html', page: 'tasks', nav: 'tasks.html', title: 'Routine', desc: 'Tasks and weekly habits that hold the process together.' },
  { file: 'analytics.html', page: 'analytics', nav: 'analytics.html', title: 'Analytics', desc: 'Where the money actually comes from.' },
  { file: 'playbook.html', page: 'playbook', nav: 'playbook.html', title: 'Playbook', desc: 'Your setups and code snippets in one searchable place.' },
  { file: 'assistant.html', page: 'assistant', nav: 'assistant.html', title: 'Assistant', desc: 'Answers drawn from your own trading data.' },
  { file: 'settings.html', page: 'settings', nav: '', title: 'Settings', desc: 'Preferences, access and your data.' },
];

const CSS = read(path.join(SRC, 'desk.css'));
const JS = ['desk-core.js', 'desk-broker.js', 'desk-charts.js', 'desk-ui.js', 'desk-page-dashboard.js', 'desk-page-charts.js', 'desk-page-positions.js', 'desk-page-build.js', 'desk-page-risk.js', 'desk-page-rest.js']
  .map((f) => read(path.join(SRC, f)))
  .join('\n\n');

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230f1114'/%3E%3Cpath d='M6 23V11l7 6 5.5-9L26 19' stroke='%23f5a524' stroke-width='2.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='25.5' cy='21' r='2.3' fill='%233fd68b'/%3E%3C/svg%3E";

let built = 0;
PAGES.forEach((p) => {
  const html = `<!DOCTYPE html>
<html lang="en" class="no-js" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title} · ${BRAND.name} ${BRAND.product}</title>
<meta name="description" content="${p.desc}">
<meta name="theme-color" content="#0a0b0d">
<meta name="color-scheme" content="dark light">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="${p.title} · ${BRAND.name} ${BRAND.product}">
<meta property="og:description" content="${p.desc}">
<link rel="icon" href="${FAVICON}">
<script>document.documentElement.className="js"</script>
<style>${CSS}</style>
</head>
<body data-page="${p.page}" data-nav="${p.nav}">
<a class="skip" href="#app">Skip to content</a>
<main id="app" role="main"></main>
<script>window.PS_API_URL=${API_URL_JSON};</script>
<script>${JS}</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(ROOT, p.file), html);
  built++;
  console.log('  built', p.file.padEnd(20), (html.length / 1024).toFixed(0) + ' KB');
});

/* remove the old marketing site's leftovers */
['index.html', 'how-it-works.html', 'pricing.html', 'strategy.html', 'jessica.html'].forEach((f) => {
  const fp = path.join(ROOT, f);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
    console.log('  removed legacy', f);
  }
});

/* index → dashboard redirect so a bare folder open still works */
fs.writeFileSync(
  path.join(ROOT, 'index.html'),
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=dashboard.html">
<title>${BRAND.name} ${BRAND.product}</title>
<link rel="canonical" href="dashboard.html">
</head><body style="background:#0a0b0d;color:#e9ebee;font-family:ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0">
<p>Opening your desk… <a href="dashboard.html" style="color:#f5a524">continue</a></p>
</body></html>`
);
console.log('  built index.html (redirect)');

console.log(`\n${BRAND.name} ${BRAND.product}: ${built + 1} files built.\n`);
