/* ==========================================================================
   Page: Dashboard
   ========================================================================== */
(function () {
  'use strict';
  const PS = window.PS;
  const { ui, icon, esc, fmt, money, signed, pctStr, klass, Store, KEYS, settings } = PS;
  PS.pages = PS.pages || {};

  PS.pages.dashboard = function (root) {
    const s = settings();
    const acc = ui.accountSummary();
    const risk = ui.riskToday();
    const trades = Store.get(KEYS.trades, []);
    const closed = trades.filter((t) => t.status !== 'open');
    const stats = PS.stats(trades);
    const strategies = Store.get(KEYS.strategies, []);
    const watch = Store.get(KEYS.watchlist, []);
    const tasks = Store.get(KEYS.tasks, []);
    const events = Store.get(KEYS.events, []).slice(0, 4);
    const ccy = s.currency;

    const equity = acc.balance + stats.net + acc.openPnl;
    const todayClosed = closed.filter((t) => t.closedAt >= new Date().setHours(0, 0, 0, 0));
    const todayPnl = todayClosed.reduce((a, t) => a + t.pnl, 0);

    const curve = [0].concat(stats.curve);

    /* KPI tiles */
    const kpis = `<div class="grid g6">
      ${ui.kpi({ k: 'Equity', v: money(equity, ccy, 0), d: `<span class="num">${money(acc.balance, ccy, 0)}</span> balance`, accent: true, iconName: 'gauge' })}
      ${ui.kpi({ k: 'Open P&L', v: `<span class="${klass(acc.openPnl)}">${money(acc.openPnl, ccy)}</span>`, d: `${acc.open.length} position${acc.open.length === 1 ? '' : 's'}`, iconName: 'layers' })}
      ${ui.kpi({ k: 'Today', v: `<span class="${klass(todayPnl)}">${money(todayPnl, ccy)}</span>`, d: `${todayClosed.length} closed`, iconName: 'clock' })}
      ${ui.kpi({ k: 'Realised', v: `<span class="${klass(stats.net)}">${money(stats.net, ccy)}</span>`, d: `${stats.count} trades all-time`, iconName: 'chart' })}
      ${ui.kpi({ k: 'Win rate', v: fmt(stats.winRate, 1) + '<small>%</small>', d: `${stats.wins}W · ${stats.losses}L`, iconName: 'target' })}
      ${ui.kpi({ k: 'Profit factor', v: stats.profitFactor === Infinity ? '∞' : fmt(stats.profitFactor, 2), d: `expectancy ${money(stats.expectancy, ccy)}`, iconName: 'scale' })}
    </div>`;

    /* risk panel */
    const riskPct = Math.min(100, risk.usedPct);
    const riskPanel = ui.panel({
      title: 'Risk today',
      right: `<a class="btn btn-sm btn-ghost" href="risk.html">Console ${icon('arrowRight')}</a>`,
      body: `
        <div class="row-between" style="margin-bottom:6px">
          <span class="label">Daily loss budget</span>
          <span class="mono xs">${money(risk.used, ccy)} / ${money(risk.dailyLimit, ccy)}</span>
        </div>
        <div class="bar ${riskPct > 75 ? 'red' : riskPct > 45 ? '' : 'green'}"><i style="width:${riskPct}%"></i></div>
        <div class="row-between" style="margin-top:5px">
          <span class="xs dim">${fmt(riskPct, 0)}% used</span>
          <span class="xs dim">${money(risk.remaining, ccy)} left</span>
        </div>
        <hr class="divider" style="margin:11px 0">
        ${ui.statRows([
          { k: 'Open risk (to stops)', v: money(risk.openRisk, ccy), icon: 'shield' },
          { k: 'Open positions', v: `${risk.openCount} / ${s.maxOpenPositions}`, icon: 'layers', cls: risk.openCount > s.maxOpenPositions ? 'dn' : '' },
          { k: 'Risk per trade', v: fmt(s.riskPerTrade, 2) + '%', icon: 'target' },
          { k: 'Weekly limit', v: fmt(s.weeklyLossLimit, 0) + '%', icon: 'calendar' },
        ])}
        ${risk.breaches.daily ? `<div class="chip chip-red" style="margin-top:9px;height:auto;padding:5px 8px">${icon('warn')} Daily limit reached — stand down</div>` : ''}
      `,
    });

    /* equity panel */
    const equityPanel = ui.panel({
      title: 'Equity curve',
      sub: `Closed trades, cumulative · ${ccy}`,
      right: `<a class="btn btn-sm btn-ghost" href="analytics.html">Analytics ${icon('arrowRight')}</a>`,
      body: `<div class="chart-box">${PS.equitySvg(curve, { w: 640, h: 168 })}</div>
        <div class="grid g4" style="margin-top:10px;gap:8px">
          ${[
            ['Net', `<span class="${klass(stats.net)}">${money(stats.net, ccy)}</span>`],
            ['Max DD', money(-stats.maxDD, ccy)],
            ['Avg win', money(stats.avgWin, ccy)],
            ['Avg loss', money(-stats.avgLoss, ccy)],
          ]
            .map(
              ([k, v]) => `<div><div class="label">${k}</div><div class="mono sm" style="margin-top:2px">${v}</div></div>`
            )
            .join('')}
        </div>`,
    });

    /* open positions */
    const openRows = acc.open.map((t) => {
      const meta = PS.symMeta(t.sym);
      return `<tr>
        <td><strong>${esc(t.sym)}</strong><div class="xs dim">${esc(t.setup || '')}</div></td>
        <td>${ui.chip(t.side.toUpperCase(), t.side === 'buy' ? 'green' : 'red')}</td>
        <td class="num">${PS.fmtPrice(t.entry)}</td>
        <td class="num">${PS.fmtPrice(t.markPrice)}</td>
        <td class="num ${klass(t.livePnl)}">${money(t.livePnl, ccy)}</td>
        <td class="num ${klass(t.liveR)}">${signed(t.liveR, 2)}R</td>
      </tr>`;
    });

    const positionsPanel = ui.panel({
      title: 'Open positions',
      sub: `${acc.open.length} live · marks are sample prices`,
      right: `<a class="btn btn-sm btn-ghost" href="positions.html">Manage ${icon('arrowRight')}</a>`,
      flush: true,
      body: ui.table({
        cols: ['Instrument', 'Side', { label: 'Entry', num: true }, { label: 'Mark', num: true }, { label: 'P&L', num: true }, { label: 'R', num: true }],
        rows: openRows,
        empty: 'No open positions. Flat is a position too.',
      }),
    });

    /* watchlist */
    const watchRows = watch.slice(0, 7).map((sym) => {
      const meta = PS.symMeta(sym);
      const chg = PS.dailyChange(sym);
      const px = PS.price(sym);
      const series = PS.candles(sym, 24).map((c) => c.c);
      return `<tr>
        <td><strong>${esc(sym)}</strong><div class="xs dim">${esc(meta.cls)}</div></td>
        <td class="num">${fmt(px, meta.dec)}</td>
        <td class="num ${klass(chg)}">${pctStr(chg)}</td>
        <td style="width:74px">${PS.sparkSvg(series, { w: 66, h: 18 })}</td>
      </tr>`;
    });

    const watchPanel = ui.panel({
      title: 'Watchlist',
      right: `<a class="btn btn-sm btn-ghost" href="charts.html">Charts ${icon('arrowRight')}</a>`,
      flush: true,
      body: ui.table({
        cols: ['Market', { label: 'Price', num: true }, { label: 'Day', num: true }, { label: '', num: false }],
        rows: watchRows,
        empty: 'Add instruments in Charts.',
        cls: 'tbl-compact',
      }),
    });

    /* upcoming events */
    const eventsPanel = ui.panel({
      title: 'Next on the calendar',
      right: `<a class="btn btn-sm btn-ghost" href="calendar.html">All ${icon('arrowRight')}</a>`,
      flush: true,
      body: `<div style="display:grid;gap:7px;padding:10px">
        ${events
          .map(
            (e) => `<div class="cal-event">
              <span class="time">${new Date(e.at).toLocaleDateString('en-GB', { weekday: 'short' })} ${new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
              <span class="name">${esc(e.name)}<div class="meta">${esc(e.ccy)} · prev ${esc(e.prev)}</div></span>
              <span class="impact ${e.impact}"><i></i><i></i><i></i></span>
            </div>`
          )
          .join('') || ui.empty('Nothing scheduled.')}
      </div>`,
    });

    /* checklist */
    const openTasks = tasks.filter((t) => !t.done);
    const tasksPanel = ui.panel({
      title: 'Routine',
      sub: `${openTasks.length} open`,
      right: `<a class="btn btn-sm btn-ghost" href="tasks.html">All ${icon('arrowRight')}</a>`,
      body: `<div class="check-list">
        ${tasks
          .slice(0, 5)
          .map(
            (t) => `<div class="check-item ${t.done ? 'done' : ''}" data-task="${t.id}">
              <span class="check-box">${t.done ? icon('check') : ''}</span>
              <span class="txt sm">${esc(t.text)}</span>
              <span class="chip chip-plain xs" style="margin-left:auto">${esc(t.cat)}</span>
            </div>`
          )
          .join('')}
      </div>`,
      foot: `<span class="xs">Click a row to tick it off.</span>`,
    });

    /* strategies mini */
    const stratPanel = ui.panel({
      title: 'Strategies',
      sub: `${strategies.filter((x) => x.status === 'live').length} live of ${strategies.length}`,
      right: `<a class="btn btn-sm btn-ghost" href="strategies.html">Build ${icon('arrowRight')}</a>`,
      flush: true,
      body: `<div>
        ${strategies
          .map(
            (st) => `<div class="row-between" style="padding:9px 12px;border-bottom:1px solid var(--line)">
              <div style="min-width:0">
                <div class="sm" style="font-weight:500">${esc(st.name)}</div>
                <div class="xs dim">${esc(st.markets.join(', '))} · ${esc(st.tf)} · PF ${st.pf ? fmt(st.pf, 2) : '—'}</div>
              </div>
              ${ui.statusPill(st.status)}
            </div>`
          )
          .join('')}
      </div>`,
    });

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Dashboard</h1>
          <div class="sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · ${esc(s.name)}'s desk</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" data-act="refresh">${icon('refresh')}Refresh</button>
          <a class="btn btn-sm btn-primary" href="journal.html#new">${icon('plus')}Log trade</a>
        </div>
      </div>
      <div class="page-body">
        ${kpis}
        <div class="grid g3-2">
          ${equityPanel}
          ${riskPanel}
        </div>
        ${positionsPanel}
        <div class="grid g3">
          ${watchPanel}
          ${eventsPanel}
          ${tasksPanel}
        </div>
        <div class="grid g2-1">
          ${stratPanel}
          ${ui.panel({
            title: 'Edge snapshot',
            body: `<div class="grid g2" style="gap:10px">
              ${[
                ['Expectancy', money(stats.expectancy, ccy), klass(stats.expectancy)],
                ['Avg R', signed(stats.avgR, 2) + 'R', klass(stats.avgR)],
                ['Best streak', stats.bestStreak + 'W', 'up'],
                ['Worst streak', Math.abs(stats.worstStreak) + 'L', 'dn'],
                ['Sharpe (trade)', fmt(stats.sharpe, 2), ''],
                ['Sortino', stats.sortino == null ? 'n/a' : fmt(stats.sortino, 2), ''],
              ]
                .map(
                  ([k, v, c]) => `<div><div class="label">${k}</div><div class="mono sm ${c}" style="margin-top:2px">${v}</div></div>`
                )
                .join('')}
            </div>
            <hr class="divider" style="margin:12px 0">
            <div class="label" style="margin-bottom:7px">Weekday P&L</div>
            ${ui.weekdayHeat(closed)}`,
          })}
        </div>
      </div>`;

    /* interactions */
    root.querySelector('[data-act="refresh"]').addEventListener('click', () => {
      PS.toast('Marks refreshed');
      PS.pages.dashboard(root);
    });
    PS.$$('[data-task]', root).forEach((el) =>
      el.addEventListener('click', () => {
        const all = Store.get(KEYS.tasks, []);
        const t = all.find((x) => x.id === el.dataset.task);
        if (!t) return;
        t.done = !t.done;
        Store.set(KEYS.tasks, all);
        el.classList.toggle('done', t.done);
        el.querySelector('.check-box').innerHTML = t.done ? icon('check') : '';
        if (t.done) PS.toast('Tick: ' + t.text);
      })
    );
  };
})();
