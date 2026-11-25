/* ==========================================================================
   PipSage Desk — core runtime
   Store, market math, indicator library, shell chrome, UI primitives.
   No dependencies.
   ========================================================================== */
(function () {
  'use strict';

  const PS = (window.PS = window.PS || {});

  /* ------------------------------------------------------------------ utils */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  PS.$ = $; PS.$$ = $$;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  PS.clamp = clamp;

  const fmt = (n, d = 2) =>
    Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  PS.fmt = fmt;

  const fmtInt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  PS.fmtInt = fmtInt;

  const money = (n, ccy = 'USD', d = 2) => {
    const sym = { USD: '$', EUR: '€', GBP: '£', NGN: '₦', JPY: '¥' }[ccy] || '';
    return (n < 0 ? '−' : '') + sym + fmt(Math.abs(n), d);
  };
  PS.money = money;

  const signed = (n, d = 2) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), d);
  PS.signed = signed;

  const pctStr = (n, d = 2) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), d) + '%';
  PS.pctStr = pctStr;

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  PS.esc = esc;

  const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  PS.uid = uid;

  PS.klass = (n) => (n > 0 ? 'up' : n < 0 ? 'dn' : 'flat');
  PS.decimals = (price) => (price >= 1000 ? 2 : price >= 100 ? 3 : price >= 10 ? 4 : 5);
  PS.fmtPrice = (p) => fmt(p, PS.decimals(p));

  const dt = (ts) => new Date(ts);
  PS.dateShort = (ts) => dt(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  PS.dateFull = (ts) =>
    dt(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  PS.timeShort = (ts) => dt(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  PS.isoDate = (ts) => new Date(ts).toISOString().slice(0, 10);
  PS.ago = (ts) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };
  PS.dayName = (i) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i];

  PS.debounce = (fn, ms = 220) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  PS.range = (n, f = (i) => i) => Array.from({ length: n }, (_, i) => f(i));

  /* deterministic RNG so sample series are stable between reloads */
  PS.rng = (seed) => {
    let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  };

  /* ------------------------------------------------------------------ store */
  const NS = 'pipsage.';
  const KEYS = {
    gate: NS + 'gate',
    seedDisabled: NS + 'seed-disabled',
    settings: NS + 'settings',
    trades: NS + 'trades',
    accounts: NS + 'accounts',
    strategies: NS + 'strategies',
    watchlist: NS + 'watchlist',
    notes: NS + 'notes',
    tasks: NS + 'tasks',
    alerts: NS + 'alerts',
    chat: NS + 'chat',
    snippets: NS + 'snippets',
    journalEntries: NS + 'reflections',
    reflections: NS + 'reflections',
    riskstate: NS + 'riskstate',
    events: NS + 'events',
    habits: NS + 'habits',
  };
  PS.KEYS = KEYS;

  const Store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
        return true;
      } catch (e) {
        PS.toast('Storage is full or blocked', 'err');
        return false;
      }
    },
    del(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    },
    all() {
      const out = {};
      Object.entries(KEYS).forEach(([name, key]) => {
        const v = localStorage.getItem(key);
        if (v != null) out[name] = JSON.parse(v);
      });
      return out;
    },
    load(blob) {
      const data = blob && blob.data ? blob.data : blob;
      Object.entries(data || {}).forEach(([name, val]) => {
        if (KEYS[name] && val != null) Store.set(KEYS[name], val);
      });
    },
    wipe() {
      Object.values(KEYS).forEach((k) => Store.del(k));
    },
    size() {
      let b = 0;
      Object.values(KEYS).forEach((k) => {
        const v = localStorage.getItem(k);
        if (v) b += v.length * 2;
      });
      return b;
    },
  };
  PS.Store = Store;

  /* ------------------------------------------------------------------ defaults */
  PS.DEFAULT_SETTINGS = {
    name: 'Trader',
    currency: 'USD',
    startingBalance: 10000,
    riskPerTrade: 1.25,
    maxOpenPositions: 3,
    dailyLossLimit: 4,
    weeklyLossLimit: 8,
    maxSpread: 25,
    newsBlackout: true,
    sessionFilter: 'all',
    theme: 'dark',
    density: 'comfortable',
    railMini: false,
    timezone: 'Africa/Lagos',
    brokerServer: '',
    brokerLogin: '',
  };

  const settings = () => Object.assign({}, PS.DEFAULT_SETTINGS, Store.get(KEYS.settings, {}));
  PS.settings = settings;
  PS.saveSettings = (patch) => {
    const next = Object.assign(settings(), patch);
    Store.set(KEYS.settings, next);
    return next;
  };

  /* ------------------------------------------------------------------ markets */
  /* Sample instrument universe. Prices are illustrative and deterministic;
     connect a real feed by replacing PS.MARKET.base values. */
  PS.SYMBOLS = [
    { sym: 'XAUUSD', contract: 100, name: 'Gold', cls: 'Metals', base: 3563.54, vol: 0.9, dec: 2, unit: 'USD/oz' },
    { sym: 'EURUSD', contract: 100000, name: 'Euro / Dollar', cls: 'Forex', base: 1.09659, vol: 0.22, dec: 5, unit: 'rate' },
    { sym: 'GBPUSD', contract: 100000, name: 'Sterling / Dollar', cls: 'Forex', base: 1.31119, vol: 0.26, dec: 5, unit: 'rate' },
    { sym: 'USDJPY', contract: 100000, name: 'Dollar / Yen', cls: 'Forex', base: 159.219, vol: 0.3, dec: 3, unit: 'rate' },
    { sym: 'USDCAD', contract: 100000, name: 'Dollar / Loonie', cls: 'Forex', base: 1.43055, vol: 0.2, dec: 5, unit: 'rate' },
    { sym: 'AUDUSD', contract: 100000, name: 'Aussie / Dollar', cls: 'Forex', base: 0.66392, vol: 0.18, dec: 5, unit: 'rate' },
    { sym: 'NZDUSD', contract: 100000, name: 'Kiwi / Dollar', cls: 'Forex', base: 0.54837, vol: 0.17, dec: 5, unit: 'rate' },
    { sym: 'USDCHF', contract: 100000, name: 'Dollar / Franc', cls: 'Forex', base: 0.8821, vol: 0.19, dec: 5, unit: 'rate' },
    { sym: 'XAGUSD', contract: 5000, name: 'Silver', cls: 'Metals', base: 41.031, vol: 1.4, dec: 3, unit: 'USD/oz' },
    { sym: 'BTCUSD', contract: 1, name: 'Bitcoin', cls: 'Crypto', base: 60028, vol: 3.2, dec: 1, unit: 'USD' },
    { sym: 'ETHUSD', contract: 1, name: 'Ethereum', cls: 'Crypto', base: 1681.0, vol: 3.6, dec: 2, unit: 'USD' },
    { sym: 'NAS100', contract: 1, name: 'Nasdaq 100', cls: 'Indices', base: 19845.5, vol: 1.1, dec: 1, unit: 'pts' },
    { sym: 'US30', contract: 1, name: 'Dow 30', cls: 'Indices', base: 42130.0, vol: 0.9, dec: 1, unit: 'pts' },
    { sym: 'SPX500', contract: 1, name: 'S&P 500', cls: 'Indices', base: 5732.4, vol: 0.8, dec: 2, unit: 'pts' },
    { sym: 'USOIL', contract: 1000, name: 'Crude Oil', cls: 'Energy', base: 78.42, vol: 1.6, dec: 2, unit: 'USD/bbl' },
    { sym: 'GER40', contract: 1, name: 'DAX 40', cls: 'Indices', base: 18240.5, vol: 0.95, dec: 1, unit: 'pts' },
  ];
  PS.symMeta = (s) => PS.SYMBOLS.find((x) => x.sym === s) || { sym: s, name: s, cls: 'Other', base: 100, vol: 1, dec: 2, unit: '' };

  /* contract size per instrument */
  PS.contractOf = (sym) => PS.symMeta(sym).contract || 1;

  /* Instruments quoted in a non-USD currency: profit is denominated in the quote
     currency, so convert back to the account currency at the exit rate. */
  PS.quoteCcy = (sym) => {
    if (/^USD(JPY|CAD|CHF)$/.test(sym)) return sym.slice(3);
    if (/^(EUR|GBP|AUD|NZD)USD$/.test(sym)) return 'USD';
    return 'USD';
  };

  /* The one place trade P&L is calculated. */
  PS.pnlFor = function (sym, side, lots, entry, exit) {
    const contract = PS.contractOf(sym);
    const dir = side === 'buy' ? 1 : -1;
    const raw = (Number(exit) - Number(entry)) * dir * Number(lots) * contract;
    const q = PS.quoteCcy(sym);
    if (q !== 'USD' && exit) return +(raw / Number(exit)).toFixed(2);
    return +raw.toFixed(2);
  };

  /* R multiple in account currency: P&L at exit divided by cash risk at stop. */
  PS.rFor = function (sym, side, lots, entry, exit, stop) {
    if (!stop || !exit) return 0;
    const riskCash = PS.riskCashFor(sym, lots, entry, stop);
    if (!Number.isFinite(riskCash) || riskCash <= 0) return 0;
    const pnl = PS.pnlFor(sym, side, lots, entry, exit);
    if (!Number.isFinite(pnl)) return 0;
    return +((pnl / riskCash).toFixed(2));
  };

  /* cash at risk for a position */
  PS.riskCashFor = function (sym, lots, entry, stop) {
    if (!stop) return 0;
    return Math.abs(PS.pnlFor(sym, 'buy', lots, entry, stop));
  };

  /* daily change, deterministic per symbol per day */
  PS.dailyChange = (sym) => {
    const meta = PS.symMeta(sym);
    const seed = sym.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + Math.floor(Date.now() / 864e5);
    const r = PS.rng(seed);
    return (r() - 0.45) * meta.vol * 2.6;
  };
  PS.price = (sym) => {
    const meta = PS.symMeta(sym);
    return meta.base * (1 + PS.dailyChange(sym) / 100);
  };

  /* seeded OHLC series */
  PS.candles = (sym, count = 90, tfBias = 1) => {
    const meta = PS.symMeta(sym);
    const seed = sym.split('').reduce((a, c) => a + c.charCodeAt(0) * 13, 7) + Math.round(tfBias * 100);
    const r = PS.rng(seed);
    const step = meta.base * (meta.vol / 100) * 0.55;
    let p = meta.base * (1 - meta.vol / 220);
    const out = [];
    for (let i = 0; i < count; i++) {
      const drift = (r() - 0.47) * step * 1.6 + Math.sin(i / 9) * step * 0.5;
      const open = p;
      const close = open + drift;
      const hi = Math.max(open, close) + r() * step * 0.9;
      const lo = Math.min(open, close) - r() * step * 0.9;
      out.push({ t: Date.now() - (count - i) * 36e5 * tfBias, o: open, h: hi, l: lo, c: close, v: 900 + r() * 2600 });
      p = close;
    }
    return out;
  };

  /* ------------------------------------------------------------------ indicators */
  const Ind = {};
  PS.Ind = Ind;

  Ind.sma = (vals, n) =>
    vals.map((_, i) => (i < n - 1 ? null : vals.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n));

  Ind.ema = (vals, n) => {
    const k = 2 / (n + 1);
    let prev = null;
    return vals.map((v, i) => {
      if (i < n - 1) return null;
      if (prev == null) {
        prev = vals.slice(0, n).reduce((a, b) => a + b, 0) / n;
        return prev;
      }
      prev = v * k + prev * (1 - k);
      return prev;
    });
  };

  Ind.rsi = (vals, n = 14) => {
    const out = new Array(vals.length).fill(null);
    if (vals.length < n + 1) return out;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= n; i++) {
      const d = vals[i] - vals[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    gain /= n; loss /= n;
    out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    for (let i = n + 1; i < vals.length; i++) {
      const d = vals[i] - vals[i - 1];
      gain = (gain * (n - 1) + Math.max(d, 0)) / n;
      loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  };

  Ind.atr = (candles, n = 14) => {
    const tr = candles.map((c, i) => {
      if (i === 0) return c.h - c.l;
      const pc = candles[i - 1].c;
      return Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc));
    });
    return Ind.ema(tr, n);
  };

  Ind.macd = (vals, fast = 12, slow = 26, sig = 9) => {
    const ef = Ind.ema(vals, fast);
    const es = Ind.ema(vals, slow);
    const line = vals.map((_, i) => (ef[i] == null || es[i] == null ? null : ef[i] - es[i]));
    const clean = line.map((v) => v || 0);
    const signal = Ind.ema(clean, sig).map((v, i) => (line[i] == null ? null : v));
    const hist = line.map((v, i) => (v == null || signal[i] == null ? null : v - signal[i]));
    return { line, signal, hist };
  };

  Ind.bollinger = (vals, n = 20, mult = 2) => {
    const mid = Ind.sma(vals, n);
    const upper = [];
    const lower = [];
    vals.forEach((_, i) => {
      if (mid[i] == null) { upper.push(null); lower.push(null); return; }
      const slice = vals.slice(i - n + 1, i + 1);
      const m = mid[i];
      const sd = Math.sqrt(slice.reduce((a, v) => a + (v - m) ** 2, 0) / n);
      upper.push(m + mult * sd);
      lower.push(m - mult * sd);
    });
    return { mid, upper, lower };
  };

  Ind.stoch = (candles, n = 14, smooth = 3) => {
    const raw = candles.map((c, i) => {
      if (i < n - 1) return null;
      const slice = candles.slice(i - n + 1, i + 1);
      const hi = Math.max(...slice.map((x) => x.h));
      const lo = Math.min(...slice.map((x) => x.l));
      return hi === lo ? 50 : ((c.c - lo) / (hi - lo)) * 100;
    });
    return Ind.sma(raw.map((v) => v || 50), smooth).map((v, i) => (raw[i] == null ? null : v));
  };

  Ind.adx = (candles, n = 14) => {
    const plusDM = [];
    const minusDM = [];
    const tr = [];
    candles.forEach((c, i) => {
      if (i === 0) { plusDM.push(0); minusDM.push(0); tr.push(c.h - c.l); return; }
      const up = c.h - candles[i - 1].h;
      const dn = candles[i - 1].l - c.l;
      plusDM.push(up > dn && up > 0 ? up : 0);
      minusDM.push(dn > up && dn > 0 ? dn : 0);
      const pc = candles[i - 1].c;
      tr.push(Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc)));
    });
    const atr = Ind.ema(tr, n);
    const pdi = Ind.ema(plusDM, n).map((v, i) => (v == null || !atr[i] ? null : (100 * v) / atr[i]));
    const mdi = Ind.ema(minusDM, n).map((v, i) => (v == null || !atr[i] ? null : (100 * v) / atr[i]));
    const dx = pdi.map((p, i) => (p == null || mdi[i] == null ? null : (100 * Math.abs(p - mdi[i])) / (p + mdi[i] || 1)));
    return { adx: Ind.ema(dx.map((v) => v || 0), n), pdi, mdi };
  };

  Ind.donchian = (candles, n = 20) => ({
    upper: candles.map((c, i) => (i < n - 1 ? null : Math.max(...candles.slice(i - n + 1, i + 1).map((x) => x.h)))),
    lower: candles.map((c, i) => (i < n - 1 ? null : Math.min(...candles.slice(i - n + 1, i + 1).map((x) => x.l)))),
  });

  Ind.obv = (candles) => {
    let acc = 0;
    return candles.map((c, i) => {
      if (i > 0) acc += c.c > candles[i - 1].c ? c.v : c.c < candles[i - 1].c ? -c.v : 0;
      return acc;
    });
  };

  Ind.vwap = (candles) => {
    let pv = 0;
    let vv = 0;
    return candles.map((c) => {
      const tp = (c.h + c.l + c.c) / 3;
      pv += tp * c.v;
      vv += c.v;
      return pv / vv;
    });
  };

  Ind.williams = (candles, n = 14) =>
    candles.map((c, i) => {
      if (i < n - 1) return null;
      const slice = candles.slice(i - n + 1, i + 1);
      const hi = Math.max(...slice.map((x) => x.h));
      const lo = Math.min(...slice.map((x) => x.l));
      return hi === lo ? -50 : ((hi - c.c) / (hi - lo)) * -100;
    });

  Ind.supertrend = (candles, n = 10, mult = 3) => {
    const atr = Ind.atr(candles, n);
    const out = [];
    let trend = 1;
    let upper = null;
    let lower = null;
    candles.forEach((c, i) => {
      if (atr[i] == null) { out.push(null); return; }
      const hl2 = (c.h + c.l) / 2;
      const bu = hl2 + mult * atr[i];
      const bl = hl2 - mult * atr[i];
      if (upper == null) { upper = bu; lower = bl; }
      upper = c.c > upper ? bu : Math.min(bu, upper);
      lower = c.c < lower ? bl : Math.max(bl, lower);
      trend = c.c > upper ? 1 : c.c < lower ? -1 : trend;
      out.push(trend === 1 ? lower : upper);
    });
    return out;
  };

  /* ------------------------------------------------------------------ statistics */
  PS.stats = function (trades) {
    const closed = trades.filter((t) => t.status !== 'open');
    const wins = closed.filter((t) => t.pnl > 0);
    const losses = closed.filter((t) => t.pnl < 0);
    const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
    const net = grossWin - grossLoss;
    const rWins = wins.reduce((a, t) => a + (t.r || 0), 0);
    const rLoss = Math.abs(losses.reduce((a, t) => a + (t.r || 0), 0));

    /* equity curve over closed trades in chronological order */
    const ordered = closed.slice().sort((a, b) => a.closedAt - b.closedAt);
    let run = 0;
    const curve = ordered.map((t) => (run += t.pnl));

    /* max drawdown on the curve */
    let peak = 0;
    let maxDD = 0;
    curve.forEach((v) => {
      peak = Math.max(peak, v);
      maxDD = Math.max(maxDD, peak - v);
    });

    const mean = closed.length ? net / closed.length : 0;
    const sd = closed.length > 1
      ? Math.sqrt(closed.reduce((a, t) => a + (t.pnl - mean) ** 2, 0) / (closed.length - 1))
      : 0;
    const downside = closed.length > 1
      ? Math.sqrt(losses.reduce((a, t) => a + t.pnl ** 2, 0) / closed.length)
      : 0;

    /* streaks */
    let cur = 0;
    let best = 0;
    let worst = 0;
    ordered.forEach((t) => {
      if (t.pnl > 0) cur = cur > 0 ? cur + 1 : 1;
      else if (t.pnl < 0) cur = cur < 0 ? cur - 1 : -1;
      else cur = 0;
      best = Math.max(best, cur);
      worst = Math.min(worst, cur);
    });

    return {
      count: closed.length,
      open: trades.length - closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      net,
      grossWin,
      grossLoss,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      expectancy: closed.length ? net / closed.length : 0,
      avgR: closed.length ? (rWins - rLoss) / closed.length : 0,
      totalR: rWins - rLoss,
      maxDD,
      maxDDPct: peak > 0 ? (maxDD / peak) * 100 : 0,
      sharpe: sd ? mean / sd : 0,
      sortino: downside > Math.abs(mean) * 0.05 ? mean / downside : null,
      bestStreak: best,
      worstStreak: worst,
      curve,
      maxLoss: losses.length ? Math.min(...losses.map((t) => t.pnl)) : 0,
      maxWin: wins.length ? Math.max(...wins.map((t) => t.pnl)) : 0,
      avgHold: closed.length
        ? closed.reduce((a, t) => a + (t.closedAt - t.openedAt), 0) / closed.length
        : 0,
    };
  };

  /* group trades by a key and summarise */
  PS.groupBy = function (trades, keyFn) {
    const map = new Map();
    trades.forEach((t) => {
      const k = keyFn(t) || '—';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    });
    return Array.from(map.entries())
      .map(([k, list]) => ({ key: k, stats: PS.stats(list), trades: list }))
      .sort((a, b) => b.stats.net - a.stats.net);
  };

  /* ------------------------------------------------------------------ sessions */
  /* Market sessions in IST (Asia/Kolkata) because that's the usual desk clock for
     the region; the label says IST explicitly to avoid ambiguity. */
  PS.SESSIONS = [
    { name: 'Sydney', open: 4 * 60, close: 13 * 60, colour: 'var(--blue)' },
    { name: 'Tokyo', open: 5 * 60 + 30, close: 14 * 60 + 30, colour: 'var(--violet)' },
    { name: 'London', open: 13 * 60 + 30, close: 22 * 60 + 30, colour: 'var(--amber)' },
    { name: 'New York', open: 18 * 60 + 30, close: 27 * 60 + 30, colour: 'var(--teal)' },
  ];

  PS.istNow = () => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + 5.5 * 3600000);
  };

  PS.sessionState = () => {
    const ist = PS.istNow();
    const day = ist.getDay();
    const mins = ist.getHours() * 60 + ist.getMinutes();
    const weekday = day >= 1 && day <= 5;
    const out = PS.SESSIONS.map((s) => {
      let active = false;
      if (weekday || day === 0) {
        const spans = s.close > 1440 ? [[s.open, s.close - 1440]] : [];
        active = mins >= s.open && mins <= Math.min(s.close, 1439);
        spans.forEach(([a, b]) => { if (mins <= b) active = true; });
      }
      return Object.assign({}, s, { active });
    });
    const anyOpen = out.some((s) => s.active);
    return { sessions: out, anyOpen, ist, mins };
  };

  /* ------------------------------------------------------------------ toast */
  let toastHost;
  PS.toast = function (msg, kind = 'ok', ms = 2600) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toasts';
      document.body.appendChild(toastHost);
    }
    const icons = {
      ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5"/></svg>',
      err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>',
      warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3l9 17H3zM12 10v4M12 17v.5"/></svg>',
    };
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = (icons[kind] || icons.ok) + '<span>' + esc(msg) + '</span>';
    toastHost.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }, ms);
  };

  /* ------------------------------------------------------------------ modal */
  PS.modal = function ({ title, body, footer, wide, onOpen }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title || 'Dialog')}">
        <div class="modal-head">
          <h2>${esc(title || '')}</h2>
          <button class="icon-btn" data-close aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">${body || ''}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    document.body.appendChild(backdrop);
    const close = () => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-close]')) close();
    });
    if (onOpen) onOpen(backdrop, close);
    return { el: backdrop, close };
  };

  PS.confirm = function (question, { danger = false, confirmLabel = 'Confirm' } = {}) {
    return new Promise((resolve) => {
      const m = PS.modal({
        title: 'Are you sure?',
        body: `<p class="sm muted">${esc(question)}</p>`,
        footer: `<button class="btn" data-close>Cancel</button>
                 <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmLabel)}</button>`,
        onOpen(el, close) {
          el.querySelector('[data-yes]').addEventListener('click', () => { close(); resolve(true); });
          el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) resolve(false); });
        },
      });
    });
  };

  /* ------------------------------------------------------------------ drawer */
  PS.drawer = function ({ title, content }) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="drawer-backdrop"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="drawer-head">
          <h2 class="h2">${esc(title)}</h2>
          <button class="icon-btn" data-close aria-label="Close" style="margin-left:auto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="drawer-body">${content}</div>
      </aside>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener('click', (e) => {
      if (e.target.classList.contains('drawer-backdrop') || e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', function esc2(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc2); }
    });
    return close;
  };

  /* ------------------------------------------------------------------ icons */
  PS.icon = function (name, cls = '') {
    const p = {
      grid: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
      chart: '<path d="M4 19V5M4 19h16M7 15l3-4 3 2 4-6"/>',
      candles: '<path d="M7 4v3M7 17v3M17 3v4M17 18v3"/><rect x="4.5" y="7" width="5" height="10" rx="1"/><rect x="14.5" y="7" width="5" height="11" rx="1"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
      layers: '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/>',
      flask: '<path d="M9 3h6M10 3v6L5 19a2 2 0 002 2h10a2 2 0 002-2l-5-10V3"/><path d="M7.5 14h9"/>',
      shield: '<path d="M12 3l8 3.5v5.5c0 4.4-3.2 7.6-8 9-4.8-1.4-8-4.6-8-9V6.5z"/><path d="M9 12l2 2 4-4"/>',
      gauge: '<path d="M12 14l4-4"/><circle cx="12" cy="14" r="8"/><path d="M12 4v2M4 14h2M18 14h2"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
      check: '<path d="M20 6L9 17l-5-5"/>',
      checkSquare: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>',
      note: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>',
      bot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M8 12v1M16 12v1M9 16h6"/>',
      book: '<path d="M4 4h7a3 3 0 013 3v13a2.5 2.5 0 00-2.5-2.5H4z"/><path d="M20 4h-3a3 3 0 00-3 3v13a2.5 2.5 0 012.5-2.5H20z"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 006.6 19l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 002.6 13H2.5a2 2 0 110-4h.1A1.6 1.6 0 004.6 7.3l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0010 3.6V3a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/>',
      bell: '<path d="M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M13.7 20a2 2 0 01-3.4 0"/>',
      moon: '<path d="M21 12.8A8.5 8.5 0 1111.2 3a6.5 6.5 0 009.8 9.8z"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
      collapse: '<path d="M15 6l-6 6 6 6"/>',
      expand: '<path d="M9 6l6 6-6 6"/>',
      download: '<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>',
      upload: '<path d="M12 21V9M7 13l5-5 5 5M5 3h14"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
      play: '<path d="M7 4l13 8-13 8z"/>',
      pause: '<path d="M9 4v16M15 4v16"/>',
      copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
      arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
      arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
      arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
      x: '<path d="M18 6L6 18M6 6l12 12"/>',
      filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
      refresh: '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
      target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
      lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 118 0v3"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      fire: '<path d="M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3s1 2 2 2 1-4 2-8z"/>',
      trend: '<path d="M3 17l6-6 4 3 8-9"/><path d="M21 5h-5M21 5v5"/>',
      scale: '<path d="M12 3v18M5 7h14M7 7l-3 7h6zM17 7l-3 7h6z"/>',
      spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
      eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
      send: '<path d="M4 12l16-8-6 16-3-6z"/>',
      save: '<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v6h7V3M8 21v-6h8v6"/>',
      warn: '<path d="M12 3l9 17H3zM12 10v4M12 17v.5"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
      trophy: '<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 5H5v2a3 3 0 003 3M16 5h3v2a3 3 0 01-3 3M10 17h4M12 13v4M9 21h6"/>',
      repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
      clip: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
      zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    }[name];
    if (!p) return '';
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  };

  /* ------------------------------------------------------------------ seed data */
  PS.seed = function () {
    if (Store.get(KEYS.seedDisabled, false)) return;
    const now = Date.now();
    const D = 864e5;

    if (Store.get(KEYS.accounts, null) === null) {
      Store.set(KEYS.accounts, [
        { id: 'acc_demo', name: 'Demo · FundedNext', broker: 'FundedNext', login: '4471223', server: 'FundedNext-Demo', currency: 'USD', balance: 25000, equity: 25180.4, leverage: '1:100', status: 'connected', kind: 'demo' },
        { id: 'acc_live', name: 'Live · Exness', broker: 'Exness', login: '2199834', server: 'Exness-Real8', currency: 'USD', balance: 8420.55, equity: 8391.2, leverage: '1:200', status: 'disconnected', kind: 'live' },
      ]);
    }

    if (Store.get(KEYS.trades, null) === null) {
      const mk = (i, sym, side, entry, exit, lots, openedAt, closedAt, setup, notes, status) => {
        const meta = PS.symMeta(sym);
        const dir = side === 'buy' ? 1 : -1;
        const stop = +(entry - dir * (meta.base * meta.vol) / 100).toFixed(meta.dec);
        const pnl = status === 'open' ? 0 : PS.pnlFor(sym, side, lots, entry, exit);
        return {
          id: 't' + i, sym, side, entry, exit: status === 'open' ? null : exit, lots,
          sl: stop,
          tp: +(entry + dir * Math.abs(entry - stop) * 2).toFixed(meta.dec),
          openedAt, closedAt: status === 'open' ? null : closedAt,
          setup, notes, status, pnl,
          r: status === 'open' ? 0 : PS.rFor(sym, side, lots, entry, exit, stop),
          account: 'acc_demo',
          session: ['London', 'New York', 'Tokyo', 'Asia'][i % 4],
        };
      };

      const trades = [
        mk(1, 'XAUUSD', 'buy', 3561.4, 3584.2, 0.5, now - D * 1 - 7 * 36e5, now - D * 1, 'FVG pullback · 1H', 'Waited for the gap fill, entry on displacement. Held through London.', 'closed'),
        mk(2, 'EURUSD', 'sell', 1.0984, 1.0941, 1.0, now - D * 2 - 9 * 36e5, now - D * 2, 'OB rejection · 4H', 'Clean bearish engulfing at the block. Closed at target, no greed.', 'closed'),
        mk(3, 'GBPUSD', 'buy', 1.3064, 1.3021, 0.8, now - D * 3 - 5 * 36e5, now - D * 3, 'BOS continuation · 15m', 'Chased the retest instead of waiting for the close. 9 pips late.', 'closed'),
        mk(4, 'XAUUSD', 'buy', 3524.8, 3551.6, 0.4, now - D * 5 - 6 * 36e5, now - D * 5, 'FVG pullback · 1H', 'Same setup as the loser, but entry on the tap this time.', 'closed'),
        mk(5, 'USDJPY', 'sell', 159.84, 159.12, 0.6, now - D * 6 - 4 * 36e5, now - D * 6, 'Liquidity sweep · 1H', 'Swept the Asian high then reversed. Textbook.', 'closed'),
        mk(6, 'XAUUSD', 'sell', 3604.8, 3588.2, 0.3, now - D * 8 - 8 * 36e5, now - D * 8, 'OB rejection · 1H', 'Took the counter-trend short too early. Reduced size saved me.', 'closed'),
        mk(7, 'NAS100', 'buy', 19720.5, 19841.0, 1.0, now - D * 9 - 3 * 36e5, now - D * 9, 'Opening range · 5m', 'Opening drive, held the VWAP.', 'closed'),
        mk(8, 'EURUSD', 'buy', 1.0891, 1.0872, 0.9, now - D * 11 - 6 * 36e5, now - D * 11, 'FVG pullback · 1H', 'Traded against the higher timeframe. Deserved loss.', 'closed'),
        mk(9, 'BTCUSD', 'buy', 58420, 60180, 0.1, now - D * 12 - 10 * 36e5, now - D * 12, 'Breakout retest · 4H', 'Break and retest of the range high, clean continuation.', 'closed'),
        mk(10, 'USOIL', 'sell', 79.82, 78.44, 0.3, now - D * 14 - 5 * 36e5, now - D * 14, 'Liquidity sweep · 1H', 'Supply rejection after the sweep.', 'closed'),
        mk(11, 'XAUUSD', 'buy', 3545.2, 3562.9, 0.5, now - D * 15 - 7 * 36e5, now - D * 15, 'FVG pullback · 1H', 'A+ setup, full size, followed the plan.', 'closed'),
        mk(12, 'GBPUSD', 'sell', 1.3142, 1.3176, 0.7, now - D * 17 - 4 * 36e5, now - D * 17, 'BOS continuation · 15m', 'Faded a strong trend. Third loss in a row, stopped for the day.', 'closed'),
        mk(13, 'XAGUSD', 'buy', 40.82, 41.44, 0.2, now - D * 19 - 6 * 36e5, now - D * 19, 'Breakout retest · 4H', 'Silver finally followed gold.', 'closed'),
        mk(14, 'USDJPY', 'buy', 158.42, 159.11, 0.5, now - D * 21 - 5 * 36e5, now - D * 21, 'Trend pullback · 4H', 'Bought the EMA pullback in an uptrend.', 'closed'),
        mk(15, 'XAUUSD', 'buy', 3551.0, 3542.1, 0.4, now - D * 23 - 8 * 36e5, now - D * 23, 'FVG pullback · 1H', 'Entry was fine, stop was too tight for the volatility.', 'closed'),
        /* two open positions */
        mk(16, 'XAUUSD', 'buy', 3562.4, 0, 0.09, now - 6 * 36e5, null, 'FVG pullback · 1H', 'Open, managed by the FVG rule.', 'open'),
        mk(17, 'EURUSD', 'sell', 1.0978, 0, 0.4, now - 2 * 36e5, null, 'OB rejection · 4H', 'Open, waiting for London continuation.', 'open'),
      ];
      /* recompute pnl for open positions using live sample price */
      trades.forEach((t) => {
        if (t.status === 'open') {
          const px = PS.candles(t.sym, 2).slice(-1)[0].c;
          t.pnl = PS.pnlFor(t.sym, t.side, t.lots, t.entry, px);
          t.markPrice = px;
        }
      });
      Store.set(KEYS.trades, trades);
    }

    if (Store.get(KEYS.strategies, null) === null) {
      Store.set(KEYS.strategies, [
        { id: 's1', name: 'Gold FVG pullback', markets: ['XAUUSD'], tf: '1H', status: 'live', rules: { enter: 'Retest of unmitigated 1H FVG after Asian sweep', stop: 'Below sweep low − 0.3×ATR', target: 'Prior day high', filters: ['4H trend', 'Spread < 25', 'No high-impact news'] }, win: 61.2, pf: 1.94, trades: 214, dd: 6.8, since: '2026-06-02', account: 'acc_demo' },
        { id: 's2', name: 'EURUSD OB rejection', markets: ['EURUSD'], tf: '4H', status: 'live', rules: { enter: 'Order block rejection with engulfing close', stop: 'Opposite side of the block', target: '2R or prior swing', filters: ['London session', 'DXY correlation'] }, win: 54.4, pf: 1.61, trades: 168, dd: 9.2, since: '2026-07-19', account: 'acc_demo' },
        { id: 's3', name: 'GBPUSD BOS continuation', markets: ['GBPUSD'], tf: '15m', status: 'paused', rules: { enter: 'Break of structure + retest hold', stop: 'Below the retest low', target: 'Next HTF liquidity', filters: ['Spread < 15'] }, win: 47.8, pf: 1.22, trades: 302, dd: 12.4, since: '2026-08-11', account: 'acc_demo' },
        { id: 's4', name: 'NAS100 opening range', markets: ['NAS100'], tf: '5m', status: 'draft', rules: { enter: 'Break of 15-min opening range with VWAP hold', stop: 'Other side of the range', target: '1.5R', filters: ['First hour only'] }, win: 0, pf: 0, trades: 0, dd: 0, since: '2026-11-18', account: 'acc_demo' },
      ]);
    }

    if (Store.get(KEYS.watchlist, null) === null) {
      Store.set(KEYS.watchlist, ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'NAS100', 'BTCUSD', 'XAGUSD', 'USOIL']);
    }

    if (Store.get(KEYS.notes, null) === null) {
      Store.set(KEYS.notes, [
        { id: 'n1', title: 'Rule: no entry on the break', body: 'Only take the pullback when price arrives at the level. Every time I chase the break I pay for it. Check previous 6 losses — 5 were late entries.', tag: 'rules', pinned: true, createdAt: now - D * 3, updatedAt: now - D * 1 },
        { id: 'n2', title: 'XAUUSD behaviour in London', body: 'Gold sweeps the Asian high/low within the first 45 minutes of London roughly 6 days out of 10. The reversal usually gives 15–25 dollars before the real move. Watch the 1H FVG for the entry.', tag: 'playbook', pinned: true, createdAt: now - D * 9, updatedAt: now - D * 4 },
        { id: 'n3', title: 'Position sizing cheat sheet', body: 'Balance × risk% ÷ (stop pips × pip value) = lots.\n\nOn 25k at 1.25% with a 220-point gold stop: 312.50 ÷ (22 × 1) ≈ 0.14 lots... recheck pip value for XAUUSD at broker.', tag: 'risk', pinned: false, createdAt: now - D * 14, updatedAt: now - D * 14 },
        { id: 'n4', title: 'Books to finish', body: 'Trading in the Zone — re-read ch. 7\nMarket Wizards — the dialogue chapters\nReminiscences of a Stock Operator', tag: 'learning', pinned: false, createdAt: now - D * 20, updatedAt: now - D * 20 },
      ]);
    }

    if (Store.get(KEYS.tasks, null) === null) {
      Store.set(KEYS.tasks, [
        { id: 'k1', text: 'Review the two open positions before London', done: false, due: now, cat: 'pre-market' },
        { id: 'k2', text: 'Journal yesterday\'s XAUUSD close', done: true, due: now - D, cat: 'post-market' },
        { id: 'k3', text: 'Backtest the NAS100 opening range idea (50 samples)', done: false, due: now + D * 2, cat: 'research' },
        { id: 'k4', text: 'Update the FVG strategy rules with the news filter', done: false, due: now + D, cat: 'research' },
        { id: 'k5', text: 'Reconcile demo account statement', done: false, due: now + D * 3, cat: 'admin' },
        { id: 'k6', text: 'No trades after 3 straight losses — rule check', done: false, due: now, cat: 'risk' },
      ]);
    }

    if (Store.get(KEYS.alerts, null) === null) {
      Store.set(KEYS.alerts, [
        { id: 'a1', kind: 'risk', title: 'Daily loss at 62%', body: 'You are 2.48% down today against a 4% limit. Consider standing down.', at: now - 26 * 6e4, read: false },
        { id: 'a2', kind: 'price', title: 'XAUUSD tapped 3,560', body: 'Your alert level on gold has been reached.', at: now - 74 * 6e4, read: false },
        { id: 'a3', kind: 'system', title: 'Strategy paused', body: 'GBPUSD BOS continuation was paused after 3 consecutive losses.', at: now - 5 * 36e5, read: true },
        { id: 'a4', kind: 'news', title: 'US CPI in 90 minutes', body: 'High-impact release. Your news blackout will block new entries.', at: now - 6 * 36e5, read: true },
      ]);
    }

    if (Store.get(KEYS.chat, null) === null) {
      Store.set(KEYS.chat, [
        { who: 'ai', text: "Desk is up. I read your trades, strategies and notes — ask me about your edge, your leaks, or a chart. Try <strong>what is my worst setup</strong> or <strong>how risky is today</strong>." },
      ]);
    }

    if (Store.get(KEYS.snippets, null) === null) {
      Store.set(KEYS.snippets, PS.SNIPPETS);
    }

    if (Store.get(KEYS.events, null) === null) {
      Store.set(KEYS.events, PS.buildEvents());
    }

    if (Store.get(KEYS.habits, null) === null) {
      Store.set(KEYS.habits, [
        { id: 'h1', name: 'Pre-market plan written', days: [1, 1, 1, 0, 1, 1, 1] },
        { id: 'h2', name: 'No revenge trades', days: [1, 1, 1, 1, 0, 1, 1] },
        { id: 'h3', name: 'Journal every trade', days: [1, 1, 0, 1, 1, 1, 1] },
        { id: 'h4', name: 'Respected daily stop', days: [1, 1, 1, 1, 1, 1, 0] },
        { id: 'h5', name: 'Reviewed the week', days: [0, 0, 0, 0, 0, 0, 1] },
      ]);
    }

    if (Store.get(KEYS.journalEntries, null) === null) {
      Store.set(KEYS.journalEntries, [
        { id: 'r1', date: PS.isoDate(now - D), mood: 'calm', grade: 'B', body: 'Took the two A-setups, skipped the noise. The GBPUSD loss was a late entry again — same mistake as last week. Need to write the entry rule on a sticky note.', lessons: 'Late entry is the recurring leak.', createdAt: now - D },
        { id: 'r2', date: PS.isoDate(now - D * 2), mood: 'frustrated', grade: 'C', body: 'Gave back the morning gains in the afternoon. Was bored, not set up. Should have closed the terminal at 15:00 IST.', lessons: 'Boredom trading after 15:00 IST.', createdAt: now - D * 2 },
        { id: 'r3', date: PS.isoDate(now - D * 3), mood: 'confident', grade: 'A', body: 'Full plan executed: pre-market notes, two positions, both to target. Nothing clever, just the process.', lessons: 'Process works when I let it.', createdAt: now - D * 3 },
      ]);
    }
  };

  /* code snippets library */
  PS.SNIPPETS = [
    {
      id: 'fvg', name: 'Fair value gap detector', lang: 'pine', cat: 'Structure',
      desc: 'Flags unmitigated 1H fair value gaps with a box, and alerts when price returns.',
      code: `//@version=5
indicator("FVG detector", overlay=true)

gapUp   = low[0] > high[2]
gapDown = high[0] < low[2]

var box upBox = na
var box dnBox = na

if gapUp
    upBox := box.new(bar_index-2, low[0], bar_index+5, high[2], bgcolor=color.new(color.teal, 88), border_color=color.new(color.teal, 50))
if gapDown
    dnBox := box.new(bar_index-2, high[0], bar_index+5, low[2], bgcolor=color.new(color.red, 88), border_color=color.new(color.red, 50))`,
    },
    {
      id: 'sweep', name: 'Asian range sweep', lang: 'pine', cat: 'Structure',
      desc: 'Marks the Asian session high/low and alerts on the first sweep in London.',
      code: `//@version=5
indicator("Asian sweep", overlay=true)

asianHigh = request.security(syminfo.tickerid, "60", ta.highest(high, 8))
asianLow  = request.security(syminfo.tickerid, "60", ta.lowest(low, 8))

sweptHigh = high > asianHigh and close < asianHigh
sweptLow  = low  < asianLow  and close > asianLow

plotshape(sweptHigh, "Sweep high", shape.triangledown, color=color.red,  location=location.abovebar)
plotshape(sweptLow,  "Sweep low",  shape.triangleup,   color=color.teal, location=location.belowbar)`,
    },
    {
      id: 'risk', name: 'Position size calculator', lang: 'python', cat: 'Risk',
      desc: 'Contract-aware lot sizing for FX, metals and indices.',
      code: `def lot_size(balance, risk_pct, entry, stop, unit=100_000):
    risk_cash = balance * (risk_pct / 100)
    stop_dist = abs(entry - stop)
    if stop_dist == 0:
        return 0
    return round(risk_cash / (stop_dist * unit), 2)

# 25,000 account, 1.25% risk, 220-point gold stop
print(lot_size(25_000, 1.25, 3560.0, 3538.0, unit=100))  # -> 0.14`,
    },
    {
      id: 'atr', name: 'ATR stop placement', lang: 'pine', cat: 'Risk',
      desc: 'Volatility-adjusted stop that widens in fast markets instead of getting picked.',
      code: `//@version=5
strategy("ATR stop", overlay=true)

atr   = ta.atr(14)
long  = ta.crossover(ta.ema(close, 20), ta.ema(close, 50))
stop  = close - atr * 2.0
take  = close + atr * 4.0

if long
    strategy.entry("L", strategy.long)
    strategy.exit("X", "L", stop=stop, limit=take)`,
    },
    {
      id: 'retest', name: 'Break + retest state machine', lang: 'pine', cat: 'Strategy',
      desc: 'Waits for a break, then only enters if the level holds on the retest — no chasing.',
      code: `//@version=5
strategy("Break & retest", overlay=true)

var float level = na
var int   state = 0

if ta.highest(high, 20) == high
    level := high
    state := 1          // broke out, waiting for retest

if state == 1 and low <= level and close > level
    strategy.entry("Retest", strategy.long)
    state := 0

if state == 1 and bar_index - bar_index[1] > 30
    state := 0          // invalidated`,
    },
    {
      id: 'kelly', name: 'Expectancy & Kelly check', lang: 'python', cat: 'Analysis',
      desc: 'Turns a trade list into expectancy and a fractional-Kelly size ceiling.',
      code: `from statistics import mean

def edge(trades):
    wins   = [t for t in trades if t > 0]
    losses = [t for t in trades if t <= 0]
    wr     = len(wins) / len(trades)
    avg_w  = mean(wins) if wins else 0
    avg_l  = abs(mean(losses)) if losses else 1
    expectancy = wr * avg_w - (1 - wr) * avg_l
    kelly = wr - (1 - wr) / (avg_w / avg_l) if avg_w else 0
    return {"expectancy": round(expectancy, 2), "kelly_pct": round(kelly * 100, 1)}`,
    },
    {
      id: 'sql', name: 'Trade journal SQL', lang: 'sql', cat: 'Analysis',
      desc: 'Group your own log by setup and session to find the real edge.',
      code: `SELECT
  setup,
  session,
  COUNT(*)                                        AS trades,
  ROUND(100.0 * SUM(pnl > 0) / COUNT(*), 1)       AS win_rate,
  ROUND(SUM(pnl), 2)                              AS net,
  ROUND(SUM(CASE WHEN pnl > 0 THEN pnl END)
      / NULLIF(-SUM(CASE WHEN pnl < 0 THEN pnl END), 0), 2) AS profit_factor
FROM trades
WHERE status = 'closed'
GROUP BY setup, session
HAVING COUNT(*) >= 5
ORDER BY net DESC;`,
    },
    {
      id: 'csv', name: 'Normalise broker CSV', lang: 'python', cat: 'Data',
      desc: 'Standardises MT5 statement exports before importing them into the journal.',
      code: `import pandas as pd

def normalise(path):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    df = df.rename(columns={"symbol": "sym", "type": "side", "volume": "lots",
                            "open_time": "opened_at", "close_time": "closed_at",
                            "profit": "pnl"})
    df["side"] = df["side"].str.lower().map({"buy": "buy", "sell": "sell"})
    return df[["sym", "side", "lots", "opened_at", "closed_at", "pnl"]]`,
    },
  ];

  /* economic calendar (recurring weekly template, projected forward) */
  PS.CALENDAR_TEMPLATE = [
    { day: 1, hm: '11:00', name: 'Eurozone CPI (YoY)', ccy: 'EUR', impact: 'high', prev: '2.4%', fcast: '2.3%' },
    { day: 1, hm: '16:00', name: 'US ISM Manufacturing', ccy: 'USD', impact: 'med', prev: '47.8', fcast: '48.2' },
    { day: 2, hm: '15:30', name: 'US Non-Farm Payrolls', ccy: 'USD', impact: 'high', prev: '175K', fcast: '160K' },
    { day: 2, hm: '15:30', name: 'US Unemployment Rate', ccy: 'USD', impact: 'high', prev: '4.1%', fcast: '4.1%' },
    { day: 2, hm: '18:30', name: 'UK BoE Governor speech', ccy: 'GBP', impact: 'med', prev: '—', fcast: '—' },
    { day: 3, hm: '10:30', name: 'Germany Factory Orders', ccy: 'EUR', impact: 'low', prev: '1.2%', fcast: '0.6%' },
    { day: 3, hm: '19:30', name: 'FOMC Member Speech', ccy: 'USD', impact: 'med', prev: '—', fcast: '—' },
    { day: 4, hm: '14:00', name: 'US CPI (MoM)', ccy: 'USD', impact: 'high', prev: '0.3%', fcast: '0.2%' },
    { day: 4, hm: '14:00', name: 'US Core CPI (YoY)', ccy: 'USD', impact: 'high', prev: '3.2%', fcast: '3.1%' },
    { day: 4, hm: '17:00', name: 'Crude Oil Inventories', ccy: 'USD', impact: 'med', prev: '-1.2M', fcast: '0.4M' },
    { day: 5, hm: '11:30', name: 'UK GDP (QoQ)', ccy: 'GBP', impact: 'med', prev: '0.2%', fcast: '0.3%' },
    { day: 5, hm: '15:30', name: 'US Initial Jobless Claims', ccy: 'USD', impact: 'med', prev: '218K', fcast: '222K' },
    { day: 5, hm: '20:00', name: 'ECB Interest Rate Decision', ccy: 'EUR', impact: 'high', prev: '3.25%', fcast: '3.00%' },
  ];

  PS.buildEvents = function () {
    const out = [];
    const today = new Date();
    for (let w = 0; w < 3; w++) {
      PS.CALENDAR_TEMPLATE.forEach((e, i) => {
        const base = new Date(today);
        base.setDate(today.getDate() + ((e.day - today.getDay() + 7) % 7) + w * 7);
        const [h, m] = e.hm.split(':').map(Number);
        /* template times are IST */
        base.setHours(h, m, 0, 0);
        out.push(Object.assign({}, e, { id: 'e' + w + '_' + i, at: base.getTime() }));
      });
    }
    return out.filter((e) => e.at > Date.now() - 864e5).sort((a, b) => a.at - b.at).slice(0, 28);
  };

  /* ------------------------------------------------------------------ shell */
  const NAV = [
    { group: 'Trading', items: [
      { href: 'dashboard.html', label: 'Dashboard', icon: 'grid', key: 'D' },
      { href: 'charts.html', label: 'Charts', icon: 'candles', key: 'C' },
      { href: 'positions.html', label: 'Positions', icon: 'layers', key: 'P' },
      { href: 'journal.html', label: 'Journal', icon: 'list', key: 'J' },
    ] },
    { group: 'Build', items: [
      { href: 'strategies.html', label: 'Strategies', icon: 'flask', key: 'S' },
      { href: 'lab.html', label: 'Backtest lab', icon: 'trend' },
      { href: 'risk.html', label: 'Risk console', icon: 'shield', key: 'R' },
    ] },
    { group: 'Prepare', items: [
      { href: 'calendar.html', label: 'Calendar', icon: 'calendar' },
      { href: 'notes.html', label: 'Notes', icon: 'note' },
      { href: 'tasks.html', label: 'Routine', icon: 'checkSquare' },
    ] },
    { group: 'Review', items: [
      { href: 'analytics.html', label: 'Analytics', icon: 'gauge' },
      { href: 'playbook.html', label: 'Playbook', icon: 'book' },
      { href: 'assistant.html', label: 'Assistant', icon: 'bot', key: 'A' },
    ] },
  ];
  PS.NAV = NAV;
  PS.NAV_FLAT = NAV.flatMap((g) => g.items.map((i) => Object.assign({ group: g.group }, i)));

  PS.renderShell = function (activeHref) {
    const s = settings();
    document.documentElement.setAttribute('data-theme', s.theme || 'dark');
    document.body.classList.toggle('rail-mini', !!s.railMini);

    const topbar = document.createElement('header');
    topbar.className = 'topbar';
    topbar.innerHTML = `
      <a class="brand" href="dashboard.html" aria-label="PipSage Desk home">
        <span class="brand-glyph">${PS.icon('chart')}</span>
        <span class="brand-name">PipSage <em>Desk</em></span>
      </a>
      <button class="cmd-trigger" id="cmd-open" aria-label="Search and commands">
        ${PS.icon('search')}
        <span class="cmd-text">Search or jump to…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div class="topbar-right">
        <span class="session-chip" id="session-chip" title="Market session based on IST">
          <i></i><span>checking…</span>
        </span>
        <button class="icon-btn" id="theme-toggle" title="Toggle theme" aria-label="Toggle theme">
          ${PS.icon(s.theme === 'light' ? 'moon' : 'sun')}
        </button>
        <button class="icon-btn" id="alerts-btn" title="Alerts" aria-label="Alerts">
          ${PS.icon('bell')}<span class="badge" id="alert-badge" hidden>0</span>
        </button>
        <button class="icon-btn" id="rail-toggle" title="Collapse sidebar" aria-label="Collapse sidebar">
          ${PS.icon('collapse')}
        </button>
      </div>`;

    const rail = document.createElement('nav');
    rail.className = 'rail';
    rail.setAttribute('aria-label', 'Main');
    rail.innerHTML =
      NAV.map(
        (g) => `<div class="rail-section">
          <div class="rail-heading">${g.group}</div>
          ${g.items
            .map(
              (it) => `<a class="rail-link ${activeHref === it.href ? 'active' : ''}" href="${it.href}"
                 ${activeHref === it.href ? 'aria-current="page"' : ''}>
                 ${PS.icon(it.icon)}<span>${it.label}</span>
                 ${it.key ? `<span class="kbd-hint">${it.key}</span>` : ''}
               </a>`
            )
            .join('')}
        </div>`
      ).join('') +
      `<div class="rail-foot">
        <a class="rail-link" href="settings.html">${PS.icon('settings')}<span>Settings</span></a>
      </div>`;

    document.body.prepend(rail);
    document.body.prepend(topbar);

    /* on phones the rail becomes a bottom bar: keep Settings reachable there too */
    if (window.matchMedia('(max-width: 620px)').matches) {
      const foot = rail.querySelector('.rail-foot .rail-link');
      if (foot) {
        const clone = foot.cloneNode(true);
        clone.classList.add('mobile-settings');
        rail.appendChild(clone);
      }
    }

    /* #app is the scrolling content column */
    const app = document.getElementById('app');
    if (app) app.classList.add('main');

    /* session chip */
    const chip = $('#session-chip');
    const paintSession = () => {
      const st = PS.sessionState();
      const active = st.sessions.filter((x) => x.active).map((x) => x.name);
      chip.classList.toggle('closed', !st.anyOpen);
      chip.innerHTML = `<i></i><span>${st.anyOpen ? active.join(' + ') || 'Open' : 'Market closed'}</span>`;
      chip.title = `IST ${st.ist.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ${st.anyOpen ? active.join(', ') : 'closed'}`;
    };
    paintSession();
    setInterval(paintSession, 30000);

    /* alerts badge */
    const paintBadge = () => {
      const alerts = Store.get(KEYS.alerts, []);
      const unread = alerts.filter((a) => !a.read).length;
      const badge = $('#alert-badge');
      badge.hidden = unread === 0;
      badge.textContent = unread;
    };
    paintBadge();
    PS.paintAlertBadge = paintBadge;

    $('#alerts-btn').addEventListener('click', () => PS.openAlerts());
    $('#theme-toggle').addEventListener('click', () => {
      const cur = settings().theme === 'light' ? 'dark' : 'light';
      PS.saveSettings({ theme: cur });
      document.documentElement.setAttribute('data-theme', cur);
      $('#theme-toggle').innerHTML = PS.icon(cur === 'light' ? 'moon' : 'sun');
      PS.toast(cur === 'light' ? 'Light theme' : 'Dark theme');
    });
    $('#rail-toggle').addEventListener('click', () => {
      const mini = !document.body.classList.contains('rail-mini');
      document.body.classList.toggle('rail-mini', mini);
      PS.saveSettings({ railMini: mini });
    });

    const mq = window.matchMedia('(max-width: 620px)');
    const mobileAdjust = () => {
      $('#rail-toggle').style.display = mq.matches ? 'none' : '';
    };
    mobileAdjust();
    mq.addEventListener('change', mobileAdjust);

    PS.initPalette();
  };

  /* ------------------------------------------------------------------ alerts drawer */
  PS.openAlerts = function () {
    const alerts = Store.get(KEYS.alerts, []);
    const content = alerts.length
      ? alerts
          .map(
            (a) => `<div class="alert-item ${a.read ? '' : 'unread'}">
              <div class="t">
                <span class="chip ${{ risk: 'chip-red', price: 'chip-amber', news: 'chip-blue', system: 'chip-teal' }[a.kind] || ''}">${esc(a.kind)}</span>
                <strong style="font-size:12.5px">${esc(a.title)}</strong>
              </div>
              <div class="b">${esc(a.body)}</div>
              <time>${PS.ago(a.at)}</time>
            </div>`
          )
          .join('')
      : `<div class="empty">Nothing pending.</div>`;

    const close = PS.drawer({
      title: 'Alerts',
      content: `<div class="row-between" style="margin-bottom:8px">
          <span class="label">${alerts.filter((a) => !a.read).length} unread</span>
          <button class="btn btn-sm" id="mark-read">Mark all read</button>
        </div>${content}`,
    });
    setTimeout(() => {
      const b = $('#mark-read');
      if (b)
        b.addEventListener('click', () => {
          Store.set(KEYS.alerts, Store.get(KEYS.alerts, []).map((a) => Object.assign(a, { read: true })));
          PS.paintAlertBadge();
          close();
          PS.toast('All alerts marked read');
        });
    }, 0);
  };

  /* ------------------------------------------------------------------ palette */
  PS.initPalette = function () {
    const openBtn = $('#cmd-open');
    if (!openBtn) return;

    const pages = PS.NAV_FLAT.map((p) => ({
      label: p.label,
      sub: p.group,
      icon: p.icon,
      run: () => (location.href = p.href),
    }));

    const actions = [
      { label: 'Log a new trade', sub: 'Journal', icon: 'plus', run: () => location.href = 'journal.html#new' },
      { label: 'Open assistant', sub: 'Jessica', icon: 'bot', run: () => location.href = 'assistant.html' },
      { label: 'Toggle theme', sub: 'Appearance', icon: 'sun', run: () => $('#theme-toggle').click() },
      { label: 'Export a backup', sub: 'Data', icon: 'download', run: () => location.href = 'settings.html#data' },
      { label: 'Risk console', sub: 'Safety', icon: 'shield', run: () => location.href = 'risk.html' },
      { label: 'Backtest lab', sub: 'Build', icon: 'trend', run: () => location.href = 'lab.html' },
    ];

    let host = null;
    let items = [];
    let active = 0;

    const close = () => {
      if (host) { host.remove(); host = null; }
      document.removeEventListener('keydown', onKeyGlobal);
    };

    const paint = (q) => {
      const ql = q.toLowerCase().trim();
      const match = (x) => !ql || (x.label + ' ' + (x.sub || '')).toLowerCase().includes(ql);
      const pg = pages.filter(match);
      const ac = actions.filter(match);
      items = pg.concat(ac);
      active = 0;
      const list = host.querySelector('.palette-list');
      if (!items.length) {
        list.innerHTML = `<div class="empty">No matches for “${esc(q)}”</div>`;
        return;
      }
      list.innerHTML =
        (pg.length ? `<div class="palette-group">Go to</div>` : '') +
        pg.map((x, i) => itemHtml(x, i)).join('') +
        (ac.length ? `<div class="palette-group">Actions</div>` : '') +
        ac.map((x, i) => itemHtml(x, pg.length + i)).join('');
    };

    const itemHtml = (x, i) => `
      <div class="palette-item ${i === active ? 'active' : ''}" data-i="${i}">
        ${PS.icon(x.icon)}<span>${esc(x.label)}</span><span class="sub">${esc(x.sub || '')}</span>
      </div>`;

    const move = (dir) => {
      if (!items.length) return;
      active = (active + dir + items.length) % items.length;
      $$('.palette-item', host).forEach((el, i) => el.classList.toggle('active', i === active));
      const el = $$('.palette-item', host)[active];
      if (el) el.scrollIntoView({ block: 'nearest' });
    };

    const run = () => {
      const it = items[active];
      if (!it) return;
      close();
      it.run();
    };

    const onKeyGlobal = (e) => {
      if (!host) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); run(); }
    };

    const open = () => {
      if (host) return;
      host = document.createElement('div');
      host.className = 'palette-backdrop';
      host.innerHTML = `
        <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
          <div class="palette-input">
            ${PS.icon('search')}
            <input id="palette-q" placeholder="Search pages and actions…" autocomplete="off" aria-label="Search">
            <kbd style="font-family:var(--mono);font-size:10px;border:1px solid var(--line-2);border-radius:3px;padding:1px 5px;color:var(--ink-4)">ESC</kbd>
          </div>
          <div class="palette-list"></div>
          <div class="palette-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> open</span>
            <span>${PS.NAV_FLAT.length} pages</span>
          </div>
        </div>`;
      document.body.appendChild(host);
      const input = host.querySelector('#palette-q');
      paint('');
      input.focus();
      input.addEventListener('input', (e) => paint(e.target.value));
      host.addEventListener('click', (e) => {
        if (e.target === host) close();
        const it = e.target.closest('.palette-item');
        if (it) { active = Number(it.dataset.i); run(); }
      });
      document.addEventListener('keydown', onKeyGlobal);
    };

    openBtn.addEventListener('click', open);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    });
    PS.openPalette = open;
  };

  /* ------------------------------------------------------------------ gate */
  PS.gate = function () {
    const state = Store.get(KEYS.gate, { unlocked: false });
    if (state.unlocked) return true;

    const host = document.createElement('div');
    host.className = 'modal-backdrop';
    host.style.zIndex = 130;
    host.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-head">
          <span class="brand-glyph" style="color:var(--amber)">${PS.icon('chart')}</span>
          <h2 style="margin-left:2px">PipSage Desk</h2>
        </div>
        <div class="modal-body">
          <p class="sm muted">This desk is yours alone. Set a passphrase for this device — it is stored locally and never leaves the browser.</p>
          <form id="gate-form" style="display:grid;gap:10px">
            <div class="field">
              <label for="gate-pass">Passphrase</label>
              <input class="in" id="gate-pass" type="password" minlength="3" placeholder="Anything you'll remember" autocomplete="off" required>
            </div>
            <button class="btn btn-primary btn-block" type="submit">Open the desk</button>
            <button class="btn btn-ghost btn-block" type="button" id="gate-skip">Skip the lock</button>
          </form>
          <p class="xs dim">A local convenience lock, not encryption. See Settings → Access for the honest caveats.</p>
        </div>
      </div>`;
    document.body.appendChild(host);

    document.getElementById('gate-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = document.getElementById('gate-pass').value.trim();
      if (v.length < 3) return;
      Store.set(KEYS.gate, { unlocked: true, at: Date.now() });
      host.remove();
      PS.mount();
    });
    document.getElementById('gate-skip').addEventListener('click', () => {
      Store.set(KEYS.gate, { unlocked: true, at: Date.now(), skipped: true });
      host.remove();
      PS.mount();
    });
    return false;
  };

  /* ------------------------------------------------------------------ mount */
  PS.mount = function () {
    if (PS._mounted) return;
    PS._mounted = true;

    const page = document.body.dataset.page || '';
    const s = settings();
    document.documentElement.setAttribute('data-theme', s.theme || 'dark');
    PS.renderShell(document.body.dataset.nav || '');

    const app = document.getElementById('app');
    const render = PS.pages && PS.pages[page];
    if (!app) return;
    if (typeof render === 'function') {
      try {
        render(app);
      } catch (err) {
        console.error('[PipSage] page render failed:', err);
        app.innerHTML = `<div class="page-body"><div class="panel"><div class="panel-head"><h2>This view failed to render</h2></div>
          <div class="panel-body"><p class="sm muted">${esc(err && err.message)}</p>
          <p class="xs dim">Open the browser console for the stack trace.</p></div></div></div>`;
      }
    } else {
      app.innerHTML = `<div class="page-body"><div class="panel"><div class="panel-body">
        <p class="sm">No page module registered for <code>${esc(page)}</code>.</p></div></div></div>`;
    }
    document.dispatchEvent(new CustomEvent('ps:ready'));
  };

  /* ------------------------------------------------------------------ app start */
  const refreshStoredRValues = () => {
    const trades = Store.get(KEYS.trades, []);
    if (!Array.isArray(trades)) return;

    let changed = false;
    const refreshed = trades.map((t) => {
      if (!t || t.status === 'open' || !t.sym || !['buy', 'sell'].includes(t.side)) return t;
      const lots = Number(t.lots);
      const entry = Number(t.entry);
      const exit = Number(t.exit);
      const stop = Number(t.sl);
      if (![lots, entry, exit, stop].every(Number.isFinite) || !lots || !entry || !exit || !stop) return t;

      const r = PS.rFor(t.sym, t.side, lots, entry, exit, stop);
      if (Number(t.r) === r) return t;
      changed = true;
      return Object.assign({}, t, { r });
    });

    if (changed) Store.set(KEYS.trades, refreshed);
  };

  PS.start = function () {
    PS.seed();
    refreshStoredRValues();
    const state = Store.get(KEYS.gate, { unlocked: false });
    if (state.unlocked) {
      PS.mount();
    } else {
      PS.gate();
    }
  };

  document.addEventListener('DOMContentLoaded', PS.start);
})();
