/* ==========================================================================
   PipSage Desk — shared UI helpers
   Small declarative builders so pages stay readable.
   ========================================================================== */
(function () {
  'use strict';
  const PS = window.PS;
  const { esc, fmt, money, signed, pctStr, klass, icon, settings, Store, KEYS } = PS;

  const ui = (PS.ui = {});

  /* panel wrapper */
  ui.panel = function ({ title, sub, right = '', body = '', flush = false, foot = '', id = '', cls = '', style = '' }) {
    return `<section class="panel ${cls}" ${id ? `id="${id}"` : ''} ${style ? `style="${style}"` : ''}>
      ${title || right ? `<div class="panel-head">
        <div style="min-width:0">
          <h2>${esc(title || '')}</h2>
          ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
        </div>
        ${right ? `<div class="right">${right}</div>` : ''}
      </div>` : ''}
      <div class="panel-body ${flush ? 'flush' : ''}">${body}</div>
      ${foot ? `<div class="panel-foot">${foot}</div>` : ''}
    </section>`;
  };

  /* KPI tile */
  ui.kpi = function ({ k, v, d = '', accent = false, iconName = '', spark = '' }) {
    return `<div class="kpi ${accent ? 'accent' : ''}">
      <div class="k">${iconName ? icon(iconName) : ''}${esc(k)}</div>
      <div class="v">${v}</div>
      ${d ? `<div class="d">${d}</div>` : ''}
      ${spark ? `<div class="spark">${spark}</div>` : ''}
    </div>`;
  };

  /* table */
  ui.table = function ({ cols, rows, cls = '', empty = 'Nothing here yet.', headCls = '' }) {
    if (!rows.length) return `<div class="empty">${icon('info')}${esc(empty)}</div>`;
    return `<div class="tbl-wrap"><table class="tbl ${cls}">
      <thead><tr class="${headCls}">${cols.map((c) => {
        const lbl = typeof c === 'string' ? c : (c.label == null ? '' : c.label);
        const num = typeof c === 'object' && c.num;
        const cls = typeof c === 'object' && c.cls ? c.cls : '';
        const w = typeof c === 'object' && c.w ? `style="width:${c.w}"` : '';
        return `<th class="${num ? 'num' : ''} ${cls}" ${w}>${esc(lbl)}</th>`;
      }).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>`;
  };

  /* stat row list */
  ui.statRows = function (rows) {
    return rows
      .map(
        (r) => `<div class="stat-row">
          <span class="k">${r.icon ? icon(r.icon) : ''}${esc(r.k)}</span>
          <span class="v ${r.cls || ''}">${r.v}</span>
        </div>`
      )
      .join('');
  };

  /* chip */
  ui.chip = function (label, kind = '', dot = false) {
    return `<span class="chip ${kind ? 'chip-' + kind : ''}">${dot ? '<span class="dot"></span>' : ''}${esc(label)}</span>`;
  };

  /* empty state */
  ui.empty = function (msg, iconName = 'info') {
    return `<div class="empty">${icon(iconName)}${esc(msg)}</div>`;
  };

  /* field */
  ui.field = function ({ label, id, type = 'text', value = '', placeholder = '', hint = '', attrs = '', options = null, textarea = false, cls = '' }) {
    const common = `id="${id}" name="${id}" class="${cls}" ${attrs} ${placeholder ? `placeholder="${esc(placeholder)}"` : ''}`;
    let control;
    if (options) {
      control = `<select class="sel" ${common}>${options
        .map((o) => {
          const val = typeof o === 'string' ? o : o.value;
          const lbl = typeof o === 'string' ? o : o.label;
          return `<option value="${esc(val)}" ${String(val) === String(value) ? 'selected' : ''}>${esc(lbl)}</option>`;
        })
        .join('')}</select>`;
    } else if (textarea) {
      control = `<textarea class="ta" ${common} ${placeholder ? '' : ''}>${esc(value)}</textarea>`;
    } else {
      /* number inputs reject thousands separators, so strip them */
      const safe = type === 'number' ? String(value == null ? '' : value).replace(/,/g, '') : value;
      control = `<input class="in ${type === 'number' ? 'num' : ''}" type="${type}" ${common} value="${esc(safe)}">`;
    }
    return `<div class="field">${label ? `<label for="${id}">${esc(label)}</label>` : ''}${control}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
  };

  /* toggle row */
  ui.toggle = function ({ label, id, checked = false, hint = '' }) {
    return `<label class="row-between" style="padding:6px 0;cursor:pointer;gap:12px">
      <span>
        <span class="sm" style="color:var(--ink-2)">${esc(label)}</span>
        ${hint ? `<span class="xs dim" style="display:block">${esc(hint)}</span>` : ''}
      </span>
      <span class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}></span>
    </label>`;
  };

  /* range control */
  ui.range = function ({ label, id, min, max, step = 1, value, unit = '', format = null }) {
    const shown = format ? format(value) : value + unit;
    return `<div class="range">
      <div class="row"><span>${esc(label)}</span><b id="${id}-val">${shown}</b></div>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"
        data-unit="${esc(unit)}" data-format="${format ? 'custom' : ''}">
    </div>`;
  };

  /* wire range display */
  ui.bindRange = function (id, formatter) {
    const el = document.getElementById(id);
    const out = document.getElementById(id + '-val');
    if (!el || !out) return;
    const paint = () => {
      out.textContent = formatter ? formatter(Number(el.value)) : el.value + (el.dataset.unit || '');
    };
    el.addEventListener('input', paint);
    paint();
  };

  /* confirmation-free action button helper */
  ui.act = function (label, attrs, { kind = '', size = 'sm', iconName = '' } = {}) {
    return `<button class="btn ${kind ? 'btn-' + kind : ''} btn-${size}" ${attrs}>${iconName ? icon(iconName) : ''}${esc(label)}</button>`;
  };

  /* derive live-ish trade numbers */
  ui.liveTrade = function (t) {
    const px = t.status === 'open' ? PS.price(t.sym, t.side) : t.exit;
    const pnl = t.status === 'open' ? PS.pnlFor(t.sym, t.side, t.lots, t.entry, px) : t.pnl;
    const r = PS.rFor(t.sym, t.side, t.lots, t.entry, px, t.sl);
    return Object.assign({}, t, {
      markPrice: px,
      livePnl: pnl,
      liveR: r,
      riskCash: PS.riskCashFor(t.sym, t.lots, t.entry, t.sl),
    });
  };

  /* current account summary */
  ui.accountSummary = function () {
    const s = settings();
    const accounts = Store.get(KEYS.accounts, []);
    const active = accounts.find((a) => a.status === 'connected') || accounts[0] || { balance: s.startingBalance, currency: s.currency };
    const trades = Store.get(KEYS.trades, []);
    const open = trades.filter((t) => t.status === 'open').map(ui.liveTrade);
    const closed = trades.filter((t) => t.status !== 'open');
    const openPnl = open.reduce((a, t) => a + t.livePnl, 0);
    const realised = closed.reduce((a, t) => a + t.pnl, 0);
    const equity = active.balance + openPnl;
    return { settings: s, account: active, open, closed, openPnl, realised, equity, balance: active.balance };
  };

  /* risk state for today */
  ui.riskToday = function () {
    const s = settings();
    const { closed, open } = ui.accountSummary();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayClosed = closed.filter((t) => t.closedAt >= startOfDay.getTime());
    const realisedToday = todayClosed.reduce((a, t) => a + t.pnl, 0);
    const openRisk = open.reduce((a, t) => a + (t.riskCash || 0), 0);
    const dailyLimit = (s.startingBalance * s.dailyLossLimit) / 100;
    const used = Math.max(0, -realisedToday);
    return {
      realisedToday,
      openRisk,
      dailyLimit,
      used,
      usedPct: (used / dailyLimit) * 100,
      remaining: Math.max(0, dailyLimit - used),
      tradeCount: todayClosed.length,
      openCount: open.length,
      breaches: {
        daily: used >= dailyLimit,
        positions: open.length > s.maxOpenPositions,
        riskPerTrade: open.some((t) => (t.riskCash || 0) > (s.startingBalance * s.riskPerTrade) / 100),
      },
    };
  };

  /* position sizing */
  ui.sizePosition = function ({ balance, riskPct, entry, stop, sym }) {
    const contract = PS.contractOf(sym);
    const riskCash = (balance * riskPct) / 100;
    const stopDist = Math.abs(entry - stop);
    /* cash risk for 1.00 lot over that stop distance */
    const perLot = PS.riskCashFor(sym, 1, entry, stop) || (stopDist * contract);
    const lots = perLot ? riskCash / perLot : 0;
    return { riskCash, stopDist, lots, contract, perLot };
  };

  /* format helpers bound to currency */
  ui.money = (n) => money(n, settings().currency, 2);
  ui.equitySpark = (values) => PS.sparkSvg(values, { w: 64, h: 18 });

  /* monthly returns from closed trades */
  ui.monthlyReturns = function (trades) {
    const byMonth = new Map();
    trades
      .filter((t) => t.status !== 'open' && t.closedAt)
      .forEach((t) => {
        const d = new Date(t.closedAt);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        byMonth.set(key, (byMonth.get(key) || 0) + t.pnl);
      });
    return Array.from(byMonth.entries())
      .map(([k, v]) => ({ key: k, value: v }))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
  };

  /* heatmap html for weekday performance */
  ui.weekdayHeat = function (trades) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const grid = days.map((d) => ({ day: d, pnl: 0, n: 0 }));
    trades
      .filter((t) => t.status !== 'open' && t.closedAt)
      .forEach((t) => {
        const idx = (new Date(t.closedAt).getDay() + 6) % 7;
        if (idx < 5) {
          grid[idx].pnl += t.pnl;
          grid[idx].n++;
        }
      });
    const max = Math.max(1, ...grid.map((g) => Math.abs(g.pnl)));
    return `<div class="heat" style="grid-template-columns:repeat(5,1fr)">
      ${grid
        .map(
          (g) => `<div class="heat-head">${g.day}</div>`
        )
        .join('')}
      ${grid
        .map((g) => {
          const pos = g.pnl >= 0;
          const alpha = Math.min(0.85, Math.abs(g.pnl) / max);
          const bg = pos ? `rgba(63,214,139,${0.08 + alpha * 0.5})` : `rgba(242,85,90,${0.08 + alpha * 0.5})`;
          return `<div class="heat-cell" style="background:${g.n ? bg : 'var(--panel-2)'}" title="${g.n} trades · ${money(g.pnl, settings().currency)}">
            <span style="font-size:9px;color:var(--ink)">${g.n ? money(g.pnl, settings().currency, 0) : '—'}</span>
          </div>`;
        })
        .join('')}
    </div>`;
  };

  /* session performance table rows */
  ui.sessionStats = function (trades) {
    const bySession = PS.groupBy(trades.filter((t) => t.status !== 'open'), (t) => t.session);
    return bySession
      .map(
        (g) => `<tr>
          <td>${esc(g.key || '—')}</td>
          <td class="num">${g.stats.count}</td>
          <td class="num">${fmt(g.stats.winRate, 1)}%</td>
          <td class="num ${klass(g.stats.net)}">${money(g.stats.net, settings().currency)}</td>
          <td class="num">${g.stats.profitFactor === Infinity ? '∞' : fmt(g.stats.profitFactor, 2)}</td>
        </tr>`
      )
      .join('');
  };

  /* download a file */
  ui.download = function (filename, content, type = 'application/json') {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  /* to CSV */
  ui.toCsv = function (rows, cols) {
    const head = cols.map((c) => c.label).join(',');
    const body = rows
      .map((r) =>
        cols
          .map((c) => {
            const v = c.get(r);
            const s = v == null ? '' : String(v);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(',')
      )
      .join('\n');
    return head + '\n' + body;
  };

  /* position pill */
  ui.statusPill = function (status) {
    const map = {
      live: ['green', 'live'],
      paused: ['amber', 'paused'],
      draft: ['', 'draft'],
      open: ['blue', 'open'],
      closed: ['', 'closed'],
      archived: ['', 'archived'],
      connected: ['green', 'connected'],
      disconnected: ['', 'offline'],
    };
    const [kind] = map[status] || ['', status];
    return `<span class="chip ${kind ? 'chip-' + kind : ''}"><span class="dot"></span>${esc(status)}</span>`;
  };
})();
