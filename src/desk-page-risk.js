/* ==========================================================================
   Pages: Risk console · Analytics
   ========================================================================== */
(function () {
  'use strict';
  const PS = window.PS;
  const { ui, icon, esc, fmt, money, signed, klass, Store, KEYS, settings } = PS;
  PS.pages = PS.pages || {};

  /* ======================================================================
     RISK CONSOLE
     ====================================================================== */
  PS.pages.risk = function (root) {
    const s = settings();
    const ccy = s.currency;
    const acc = ui.accountSummary();
    const risk = ui.riskToday();
    const trades = Store.get(KEYS.trades, []);
    const closed = trades.filter((t) => t.status !== 'open');
    const stats = PS.stats(trades);

    /* per-trade risk audit for open positions */
    const audit = acc.open.map((t) => {
      const riskCash = t.riskCash || 0;
      const pct = (riskCash / acc.balance) * 100;
      return Object.assign({}, t, { riskCash, pct, breach: pct > s.riskPerTrade });
    });

    const breachCount = audit.filter((a) => a.breach).length;
    const usedPct = Math.min(100, risk.usedPct);

    /* worst-case scenario: every stop hit */
    const worstCase = acc.openPnl - risk.openRisk;
    const worstEquity = acc.balance + worstCase;

    /* risk of ruin estimate from win rate + avg R */
    const edge = stats.avgR;
    const ruin =
      stats.count > 4 && edge > 0
        ? Math.max(0.1, Math.min(99.9, 100 * Math.pow(1 / (1 + edge), 10)))
        : null;

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Risk console</h1>
          <div class="sub">Your limits, live exposure and the honest worst case</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" data-act="reset">${icon('refresh')}New day</button>
          <button class="btn btn-sm btn-primary" data-act="save">${icon('save')}Save limits</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid g4">
          ${ui.kpi({ k: 'Daily budget used', v: fmt(usedPct, 0) + '<small>%</small>', d: `${money(risk.used, ccy)} of ${money(risk.dailyLimit, ccy)}`, accent: usedPct > 60, iconName: 'shield' })}
          ${ui.kpi({ k: 'Worst case', v: `<span class="${klass(worstCase)}">${money(worstCase, ccy, 0)}</span>`, d: `if every stop hits · equity ${money(worstEquity, ccy, 0)}`, iconName: 'warn' })}
          ${ui.kpi({ k: 'Open risk', v: money(risk.openRisk, ccy, 0), d: `${fmt((risk.openRisk / acc.balance) * 100, 2)}% of balance`, iconName: 'layers' })}
          ${ui.kpi({ k: 'Audit flags', v: String(breachCount), d: breachCount ? 'positions over your limit' : 'all positions within limits', iconName: 'check' })}
        </div>

        ${risk.breaches.daily ? `<div class="panel" style="border-color:#f2555a4d;background:var(--red-dim)">
          <div class="panel-body row-between">
            <div class="row" style="gap:8px"><span class="dn">${icon('warn')}</span>
              <span class="sm"><strong>Daily loss limit reached.</strong> Your own rule says stand down. New entries are locked in spirit, if not in code.</span></div>
            <button class="btn btn-sm btn-danger" data-act="ack">Acknowledge</button>
          </div></div>` : ''}

        <div class="grid g2-1">
          ${ui.panel({
            title: 'Daily loss budget',
            sub: `Resets at midnight · ${fmt(s.dailyLossLimit, 1)}% of ${money(s.startingBalance, ccy, 0)}`,
            body: `
              <div class="row-between" style="margin-bottom:7px">
                <span class="label">Used today</span>
                <span class="mono sm">${money(risk.used, ccy)} <span class="dim">/ ${money(risk.dailyLimit, ccy)}</span></span>
              </div>
              <div class="bar ${usedPct > 75 ? 'red' : usedPct > 45 ? '' : 'green'}" style="height:9px"><i style="width:${usedPct}%"></i></div>
              <div class="grid g3" style="margin-top:14px;gap:10px">
                ${[
                  ['Closed today', String(risk.tradeCount)],
                  ['Realised today', money(risk.realisedToday, ccy)],
                  ['Remaining', money(risk.remaining, ccy)],
                ]
                  .map(([k, v], i) => `<div><div class="label">${k}</div><div class="mono sm ${i === 1 ? klass(risk.realisedToday) : ''}" style="margin-top:2px">${v}</div></div>`)
                  .join('')}
              </div>
              <hr class="divider" style="margin:14px 0">
              <div class="label" style="margin-bottom:8px">Consecutive-loss guard</div>
              <div class="row" style="gap:6px">
                ${PS.range(Math.max(3, Math.abs(stats.worstStreak)), (i) => i)
                  .map(
                    (i) => `<div style="flex:1;height:7px;border-radius:3px;background:${i < Math.abs(stats.worstStreak) ? 'var(--red)' : 'var(--panel-4)'}"></div>`
                  )
                  .join('')}
              </div>
              <p class="xs dim" style="margin-top:7px">Longest losing run in your journal: ${Math.abs(stats.worstStreak)} trades. Size down after 3.</p>
            `,
          })}
          ${ui.panel({
            title: 'Limits',
            sub: 'Saved to this device',
            body: `<div class="col" style="gap:14px">
              ${ui.range({ label: 'Risk per trade', id: 'r-risk', min: 0.1, max: 5, step: 0.05, value: s.riskPerTrade, unit: '%' })}
              ${ui.range({ label: 'Max open positions', id: 'r-pos', min: 1, max: 10, step: 1, value: s.maxOpenPositions })}
              ${ui.range({ label: 'Daily loss limit', id: 'r-daily', min: 0.5, max: 15, step: 0.5, value: s.dailyLossLimit, unit: '%' })}
              ${ui.range({ label: 'Weekly loss limit', id: 'r-week', min: 1, max: 30, step: 1, value: s.weeklyLossLimit, unit: '%' })}
              ${ui.field({ label: 'Max spread (pts)', id: 'r-spread', type: 'number', value: s.maxSpread })}
              ${ui.toggle({ label: 'Block entries around high-impact news', id: 'r-news', checked: s.newsBlackout })}
            </div>`,
          })}
        </div>

        ${ui.panel({
          title: 'Position audit',
          sub: 'Every open position measured against your per-trade limit',
          flush: true,
          body: ui.table({
            cols: ['Instrument', 'Side', { label: 'Lots', num: true }, { label: 'Risk', num: true }, { label: '% balance', num: true }, { label: 'Limit', num: true }, 'Verdict'],
            rows: audit.map(
              (a) => `<tr>
                <td><strong>${esc(a.sym)}</strong><div class="xs dim">${esc(a.setup || '')}</div></td>
                <td>${ui.chip(a.side.toUpperCase(), a.side === 'buy' ? 'green' : 'red')}</td>
                <td class="num">${fmt(a.lots, 2)}</td>
                <td class="num">${money(a.riskCash, ccy, 0)}</td>
                <td class="num ${a.breach ? 'dn' : ''}">${fmt(a.pct, 2)}%</td>
                <td class="num dim">${fmt(s.riskPerTrade, 2)}%</td>
                <td>${a.breach ? ui.chip('Over limit', 'red', true) : ui.chip('Within limit', 'green', true)}</td>
              </tr>`
            ),
            empty: 'No open positions to audit.',
          }),
        })}

        <div class="grid g3">
          ${ui.panel({
            title: 'Risk of ruin (estimate)',
            body: ruin != null
              ? `<div class="gauge">
                  ${PS.donutSvg([{ value: 100 - ruin, colour: 'var(--green)' }, { value: ruin, colour: 'var(--red)' }], { size: 130, thickness: 12 })}
                  <div class="val"><b>${fmt(ruin, 1)}%</b><span>10-loss run</span></div>
                </div>
                <p class="xs dim" style="margin-top:10px;text-align:center">
                  Rough model from your ${signed(edge, 2)}R average. Not a forecast — a prompt to size smaller.
                </p>`
              : ui.empty('Log at least 5 closed trades for an estimate.'),
          })}
          ${ui.panel({
            title: 'Exposure concentration',
            body: (() => {
              const bySym = PS.groupBy(acc.open, (t) => t.sym);
              const max = Math.max(1, ...bySym.map((g) => g.trades.length));
              return bySym.length
                ? bySym
                    .map(
                      (g) => `<div style="margin-bottom:9px">
                        <div class="row-between" style="margin-bottom:3px">
                          <span class="xs">${esc(g.key)}</span>
                          <span class="mono xs">${g.trades.length} pos</span>
                        </div>
                        <div class="bar ${g.trades.length > 2 ? 'red' : ''}"><i style="width:${(g.trades.length / max) * 100}%"></i></div>
                      </div>`
                    )
                    .join('')
                : ui.empty('Flat right now.');
            })(),
          })}
          ${ui.panel({
            title: 'Your worst behaviour',
            body: (() => {
              const losses = closed.filter((t) => t.pnl < 0);
              const bySetup = PS.groupBy(losses, (t) => t.setup || 'Untagged');
              const worst = bySetup[0];
              const bySess = PS.groupBy(losses, (t) => t.session || '—');
              return `<div class="col" style="gap:9px">
                ${worst ? `<div class="note-card"><div class="xs muted">Most expensive setup</div>
                  <div class="sm">${esc(worst.key)}</div>
                  <div class="mono xs dn">${money(worst.stats.net, ccy)} over ${worst.stats.count} trades</div></div>` : ''}
                ${bySess[0] ? `<div class="note-card"><div class="xs muted">Worst session</div>
                  <div class="sm">${esc(bySess[0].key)}</div>
                  <div class="mono xs dn">${money(bySess[0].stats.net, ccy)} over ${bySess[0].stats.count} trades</div></div>` : ''}
                <div class="note-card"><div class="xs muted">Longest losing streak</div>
                  <div class="mono sm dn">${Math.abs(stats.worstStreak)} trades in a row</div></div>
              </div>`;
            })(),
          })}
        </div>
      </div>`;

    /* wire ranges */
    ['r-risk', 'r-pos', 'r-daily', 'r-week'].forEach((id) =>
      ui.bindRange(id, (v) => (id === 'r-pos' ? String(v) : fmt(v, 2) + '%'))
    );

    root.querySelector('[data-act="save"]').addEventListener('click', () => {
      PS.saveSettings({
        riskPerTrade: Number(root.querySelector('#r-risk').value),
        maxOpenPositions: Number(root.querySelector('#r-pos').value),
        dailyLossLimit: Number(root.querySelector('#r-daily').value),
        weeklyLossLimit: Number(root.querySelector('#r-week').value),
        maxSpread: Number(root.querySelector('#r-spread').value),
        newsBlackout: root.querySelector('#r-news').checked,
      });
      PS.toast('Risk limits saved');
      PS.pages.risk(root);
    });

    root.querySelector('[data-act="reset"]').addEventListener('click', () => {
      PS.toast('Day counters are derived from trade dates — logging a new day resets them');
    });

    const ack = root.querySelector('[data-act="ack"]');
    if (ack)
      ack.addEventListener('click', () => {
        Store.set(KEYS.alerts, Store.get(KEYS.alerts, []).map((a) => Object.assign(a, { read: true })));
        PS.paintAlertBadge();
        PS.toast('Acknowledged. Close the laptop.');
      });
  };

  /* ======================================================================
     ANALYTICS
     ====================================================================== */
  PS.pages.analytics = function (root) {
    const s = settings();
    const ccy = s.currency;
    const trades = Store.get(KEYS.trades, []);
    const closed = trades.filter((t) => t.status !== 'open');
    const stats = PS.stats(trades);

    const bySetup = PS.groupBy(closed, (t) => t.setup || 'Untagged');
    const bySym = PS.groupBy(closed, (t) => t.sym);
    const bySession = PS.groupBy(closed, (t) => t.session || '—');
    const byDay = PS.groupBy(closed, (t) => PS.dayName(new Date(t.closedAt).getDay()));

    const monthly = ui.monthlyReturns(closed);
    const curve = [0].concat(stats.curve);

    const rDist = (() => {
      const buckets = [
        { label: '≤ −2R', min: -99, max: -2 },
        { label: '−2 to −1R', min: -2, max: -1 },
        { label: '−1 to 0R', min: -1, max: 0 },
        { label: '0 to 1R', min: 0, max: 1 },
        { label: '1 to 2R', min: 1, max: 2 },
        { label: '2 to 3R', min: 2, max: 3 },
        { label: '> 3R', min: 3, max: 99 },
      ];
      return buckets.map((b) => ({
        label: b.label,
        n: closed.filter((t) => t.r > b.min && t.r <= b.max).length,
      }));
    })();

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Analytics</h1>
          <div class="sub">Where the money actually comes from · ${stats.count} closed trades</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" data-act="csv">${icon('download')}Export summary</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid g6">
          ${ui.kpi({ k: 'Net', v: `<span class="${klass(stats.net)}">${money(stats.net, ccy, 0)}</span>`, d: `${stats.count} trades`, accent: true })}
          ${ui.kpi({ k: 'Expectancy', v: money(stats.expectancy, ccy), d: 'per trade' })}
          ${ui.kpi({ k: 'Avg win', v: money(stats.avgWin, ccy, 0), d: `best ${money(stats.maxWin, ccy, 0)}` })}
          ${ui.kpi({ k: 'Avg loss', v: money(-stats.avgLoss, ccy, 0), d: `worst ${money(stats.maxLoss, ccy, 0)}` })}
          ${ui.kpi({ k: 'Win rate', v: fmt(stats.winRate, 1) + '<small>%</small>', d: `${stats.wins}W / ${stats.losses}L` })}
          ${ui.kpi({ k: 'Profit factor', v: stats.profitFactor === Infinity ? '∞' : fmt(stats.profitFactor, 2), d: `Sharpe ${fmt(stats.sharpe, 2)}` })}
        </div>

        ${ui.panel({
          title: 'Equity curve',
          sub: 'Cumulative realised P&L',
          body: `<div class="chart-box">${PS.equitySvg(curve, { w: 900, h: 190 })}</div>`,
        })}

        <div class="grid g2">
          ${ui.panel({ title: 'P&L by setup', body: PS.barListHtml(bySetup.map((g) => ({ label: `${g.key}`, value: g.stats.net })), { format: (v) => money(v, ccy, 0) }) || ui.empty('No data') })}
          ${ui.panel({ title: 'P&L by session', body: PS.barListHtml(bySession.map((g) => ({ label: g.key, value: g.stats.net })), { format: (v) => money(v, ccy, 0) }) || ui.empty('No data') })}
        </div>

        <div class="grid g3">
          ${ui.panel({ title: 'P&L by instrument', body: PS.barListHtml(bySym.map((g) => ({ label: g.key, value: g.stats.net })), { format: (v) => money(v, ccy, 0) }) || ui.empty('No data') })}
          ${ui.panel({ title: 'P&L by weekday', body: PS.barListHtml(byDay.map((g) => ({ label: g.key, value: g.stats.net })), { format: (v) => money(v, ccy, 0) }) || ui.empty('No data') })}
          ${ui.panel({ title: 'R-multiple distribution', body: PS.barListHtml(rDist.map((b) => ({ label: b.label, value: b.n })), { format: (v) => v + ' trades' }) })}
        </div>

        <div class="grid g3-2">
          ${ui.panel({
            title: 'Monthly returns',
            flush: true,
            body: ui.table({
              cols: ['Month', { label: 'Trades', num: true }, { label: 'Net', num: true }, { label: 'Win rate', num: true }, { label: 'PF', num: true }],
              rows: monthly.map((m) => {
                const inMonth = closed.filter((t) => {
                  const d = new Date(t.closedAt);
                  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') === m.key;
                });
                const ms = PS.stats(inMonth);
                return `<tr>
                  <td class="xs">${new Date(m.key + '-02').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</td>
                  <td class="num">${ms.count}</td>
                  <td class="num ${klass(ms.net)}">${money(ms.net, ccy)}</td>
                  <td class="num">${fmt(ms.winRate, 1)}%</td>
                  <td class="num">${ms.profitFactor === Infinity ? '∞' : fmt(ms.profitFactor, 2)}</td>
                </tr>`;
              }),
              empty: 'No closed trades yet.',
            }),
          })}
          ${ui.panel({
            title: 'Full statistics',
            body: ui.statRows([
              { k: 'Total R', v: signed(stats.totalR, 1) + 'R', cls: klass(stats.totalR) },
              { k: 'Average R', v: signed(stats.avgR, 2) + 'R', cls: klass(stats.avgR) },
              { k: 'Max drawdown', v: money(-stats.maxDD, ccy, 0) + ` (${fmt(stats.maxDDPct, 1)}%)` },
              { k: 'Sharpe (per trade)', v: fmt(stats.sharpe, 2) },
              { k: 'Sortino (per trade)', v: stats.sortino == null ? 'n/a' : fmt(stats.sortino, 2) },
              { k: 'Best streak', v: stats.bestStreak + ' wins', cls: 'up' },
              { k: 'Worst streak', v: Math.abs(stats.worstStreak) + ' losses', cls: 'dn' },
              { k: 'Avg hold time', v: (stats.avgHold / 36e5).toFixed(1) + ' h' },
              { k: 'Gross profit', v: money(stats.grossWin, ccy, 0), cls: 'up' },
              { k: 'Gross loss', v: money(-stats.grossLoss, ccy, 0), cls: 'dn' },
            ]),
          })}
        </div>
      </div>`;

    root.querySelector('[data-act="csv"]').addEventListener('click', () => {
      const csv = ui.toCsv(
        bySetup.map((g) => ({
          setup: g.key,
          trades: g.stats.count,
          win_rate: g.stats.winRate.toFixed(1),
          net: g.stats.net.toFixed(2),
          pf: g.stats.profitFactor === Infinity ? 'inf' : g.stats.profitFactor.toFixed(2),
          expectancy: g.stats.expectancy.toFixed(2),
        })),
        [
          { label: 'setup', get: (r) => r.setup },
          { label: 'trades', get: (r) => r.trades },
          { label: 'win_rate', get: (r) => r.win_rate },
          { label: 'net', get: (r) => r.net },
          { label: 'profit_factor', get: (r) => r.pf },
          { label: 'expectancy', get: (r) => r.expectancy },
        ]
      );
      ui.download('pipsage-analytics.csv', csv, 'text/csv');
      PS.toast('Summary exported');
    });
  };
})();
