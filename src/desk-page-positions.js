/* ==========================================================================
   Pages: Positions · Journal
   ========================================================================== */
(function () {
  'use strict';
  const PS = window.PS;
  const { ui, icon, esc, fmt, money, signed, klass, Store, KEYS, settings } = PS;
  PS.pages = PS.pages || {};

  /* ======================================================================
     POSITIONS
     ====================================================================== */
  PS.pages.positions = function (root) {
    const s = settings();
    const ccy = s.currency;
    const all = Store.get(KEYS.trades, []);
    const open = all.filter((t) => t.status === 'open').map(ui.liveTrade);
    const closed = all.filter((t) => t.status !== 'open');
    const acc = ui.accountSummary();

    const totalPnl = open.reduce((a, t) => a + t.livePnl, 0);
    const grossRisk = open.reduce((a, t) => a + (t.riskCash || 0), 0);

    /* exposure by asset class */
    const byClass = {};
    open.forEach((t) => {
      const cls = PS.symMeta(t.sym).cls;
      byClass[cls] = byClass[cls] || { long: 0, short: 0 };
      const notion = t.entry * t.lots * PS.contractOf(t.sym);
      if (t.side === 'buy') byClass[cls].long += notion;
      else byClass[cls].short += notion;
    });
    const classRows = Object.entries(byClass).map(([k, v]) => ({ label: k, value: v.long - v.short, long: v.long, short: v.short }));
    const segs = classRows.map((r, i) => ({
      value: Math.abs(r.long) + Math.abs(r.short),
      colour: ['#f5a524', '#2dd4bf', '#5b9dff', '#9b7bff', '#3fd68b'][i % 5],
    }));

    const rows = open.map((t) => {
      const meta = PS.symMeta(t.sym);
      const riskCash = t.riskCash || 0;
      const pctToTp = t.tp ? ((t.markPrice - t.entry) / (t.tp - t.entry)) * 100 : null;
      return `<tr>
        <td>
          <strong>${esc(t.sym)}</strong>
          <div class="xs dim">${esc(t.setup || '—')}</div>
        </td>
        <td>${ui.chip(t.side.toUpperCase(), t.side === 'buy' ? 'green' : 'red')}<div class="xs dim" style="margin-top:2px">${fmt(t.lots, 2)} lots</div></td>
        <td class="num">${PS.fmtPrice(t.entry)}</td>
        <td class="num">${PS.fmtPrice(t.markPrice)}</td>
        <td class="num">${t.sl ? PS.fmtPrice(t.sl) : '—'}</td>
        <td class="num">${t.tp ? PS.fmtPrice(t.tp) : '—'}</td>
        <td class="num ${klass(t.livePnl)}">${money(t.livePnl, ccy)}</td>
        <td class="num ${klass(t.liveR)}">${signed(t.liveR, 2)}R</td>
        <td class="num dim">${money(riskCash, ccy, 0)}</td>
        <td style="text-align:right">
          <div class="row" style="gap:3px;justify-content:flex-end">
            <button class="icon-btn" data-modify="${t.id}" title="Modify">${icon('edit')}</button>
            <button class="icon-btn" data-close="${t.id}" title="Close position">${icon('x')}</button>
          </div>
        </td>
      </tr>`;
    });

    const closedRows = closed
      .slice()
      .sort((a, b) => b.closedAt - a.closedAt)
      .slice(0, 12)
      .map(
        (t) => `<tr>
        <td class="xs dim">${PS.dateShort(t.closedAt)}</td>
        <td>${esc(t.sym)}</td>
        <td>${ui.chip(t.side.toUpperCase(), t.side === 'buy' ? 'green' : 'red')}</td>
        <td class="num">${PS.fmtPrice(t.entry)}</td>
        <td class="num">${PS.fmtPrice(t.exit)}</td>
        <td class="num ${klass(t.pnl)}">${money(t.pnl, ccy)}</td>
        <td class="num ${klass(t.r)}">${signed(t.r, 2)}R</td>
      </tr>`
      );

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Positions</h1>
          <div class="sub">Open exposure, risk to stops and execution history</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" data-act="export">${icon('download')}Export</button>
          <button class="btn btn-sm btn-primary" data-act="new">${icon('plus')}New position</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid g4">
          ${ui.kpi({ k: 'Open P&L', v: `<span class="${klass(totalPnl)}">${money(totalPnl, ccy)}</span>`, d: `${open.length} position${open.length === 1 ? '' : 's'}`, accent: true, iconName: 'layers' })}
          ${ui.kpi({ k: 'Risk to stops', v: money(grossRisk, ccy, 0), d: `${fmt((grossRisk / acc.balance) * 100, 2)}% of balance`, iconName: 'shield' })}
          ${ui.kpi({ k: 'Free margin', v: money(acc.balance - grossRisk, ccy, 0), d: 'balance − open risk', iconName: 'scale' })}
          ${ui.kpi({ k: 'Closed today', v: String(closed.filter((t) => t.closedAt >= new Date().setHours(0, 0, 0, 0)).length), d: `${money(closed.filter((t) => t.closedAt >= new Date().setHours(0, 0, 0, 0)).reduce((a, t) => a + t.pnl, 0), ccy)} realised`, iconName: 'check' })}
        </div>

        ${ui.panel({
          title: 'Open positions',
          sub: 'Sample marks — not a broker feed',
          right: `<div class="seg" id="pos-filter">
            <button class="active" data-f="all">All</button>
            <button data-f="buy">Long</button>
            <button data-f="sell">Short</button>
          </div>`,
          flush: true,
          body: `<div id="pos-table">${ui.table({
            cols: [
              'Instrument', 'Side', { label: 'Entry', num: true }, { label: 'Mark', num: true },
              { label: 'Stop', num: true }, { label: 'Target', num: true },
              { label: 'P&L', num: true }, { label: 'R', num: true }, { label: 'Risk', num: true }, '',
            ],
            rows,
            empty: 'No open positions. Being flat is a valid position.',
          })}</div>`,
        })}

        <div class="grid g3">
          ${ui.panel({
            title: 'Exposure by class',
            body: `<div style="display:grid;gap:12px;align-items:center;grid-template-columns:auto 1fr">
              ${PS.donutSvg(segs, { size: 118, thickness: 12 })}
              <div>
                ${classRows
                  .map(
                    (r, i) => `<div class="row-between" style="padding:4px 0">
                      <span class="row" style="gap:6px"><i class="legend-dot" style="background:${['#f5a524', '#2dd4bf', '#5b9dff', '#9b7bff', '#3fd68b'][i % 5]}"></i><span class="xs">${esc(r.label)}</span></span>
                      <span class="mono xs ${klass(r.value)}">${money(r.value, ccy, 0)}</span>
                    </div>`
                  )
                  .join('') || '<span class="xs dim">No exposure</span>'}
              </div>
            </div>`,
          })}
          ${ui.panel({
            title: 'Margin & leverage',
            body: `<div class="col" style="gap:9px">
              ${ui.statRows([
                { k: 'Balance', v: money(acc.balance, ccy, 0) },
                { k: 'Open P&L', v: money(totalPnl, ccy), cls: klass(totalPnl) },
                { k: 'Equity', v: money(acc.equity + totalPnl, ccy, 0) },
                { k: 'Leverage', v: acc.leverage || '1:100' },
              ])}
              <div>
                <div class="row-between" style="margin-bottom:4px"><span class="label">Margin used</span><span class="mono xs">${fmt((grossRisk / acc.balance) * 100, 1)}%</span></div>
                <div class="bar ${(grossRisk / acc.balance) * 100 > 15 ? 'red' : 'green'}"><i style="width:${Math.min(100, (grossRisk / acc.balance) * 100)}%"></i></div>
              </div>
            </div>`,
          })}
          ${ui.panel({
            title: 'Recently closed',
            flush: true,
            body: ui.table({
              cols: [{ label: 'Date', cls: 'xs' }, 'Symbol', 'Side', { label: 'P&L', num: true }],
              rows: closedRows,
              empty: 'Nothing closed yet.',
              cls: 'tbl-compact',
            }),
          })}
        </div>
      </div>`;

    /* ---- actions ---- */
    const rerender = () => PS.pages.positions(root);

    root.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', async () => {
        const t = all.find((x) => x.id === b.dataset.close);
        if (!t) return;
        const live = ui.liveTrade(t);
        const ok = await PS.confirm(`Close ${t.sym} ${t.side} ${t.lots} lots at the current mark (${PS.fmtPrice(live.markPrice)})? This locks in ${money(live.livePnl, ccy)}.`, { confirmLabel: 'Close position' });
        if (!ok) return;
        t.status = 'closed';
        t.exit = live.markPrice;
        t.closedAt = Date.now();
        t.pnl = +live.livePnl.toFixed(2);
        t.r = +live.liveR.toFixed(2);
        Store.set(KEYS.trades, all);
        PS.toast(`${t.sym} closed · ${money(t.pnl, ccy)}`);
        rerender();
      })
    );

    root.querySelectorAll('[data-modify]').forEach((b) =>
      b.addEventListener('click', () => {
        const t = all.find((x) => x.id === b.dataset.modify);
        if (!t) return;
        const m = PS.modal({
          title: `Modify ${t.sym}`,
          body: `<div class="grid g2" style="gap:10px">
              ${ui.field({ label: 'Stop loss', id: 'md-sl', type: 'number', value: t.sl })}
              ${ui.field({ label: 'Take profit', id: 'md-tp', type: 'number', value: t.tp })}
            </div>
            <p class="xs dim">Moving a stop further away is how accounts die. Tighten or leave it.</p>`,
          footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="md-save">Save</button>`,
          onOpen(el, close) {
            el.querySelector('#md-save').addEventListener('click', () => {
              t.sl = Number(el.querySelector('#md-sl').value) || t.sl;
              t.tp = Number(el.querySelector('#md-tp').value) || t.tp;
              Store.set(KEYS.trades, all);
              close();
              PS.toast('Order modified');
              rerender();
            });
          },
        });
      })
    );

    root.querySelector('[data-act="new"]').addEventListener('click', () => {
      location.href = 'journal.html#new';
    });

    root.querySelector('[data-act="export"]').addEventListener('click', () => {
      const csv = ui.toCsv(open, [
        { label: 'Symbol', get: (t) => t.sym },
        { label: 'Side', get: (t) => t.side },
        { label: 'Lots', get: (t) => t.lots },
        { label: 'Entry', get: (t) => t.entry },
        { label: 'Mark', get: (t) => t.markPrice },
        { label: 'Stop', get: (t) => t.sl },
        { label: 'Target', get: (t) => t.tp },
        { label: 'PnL', get: (t) => t.livePnl.toFixed(2) },
      ]);
      ui.download('pipsage-positions.csv', csv, 'text/csv');
      PS.toast('Positions exported');
    });

    root.querySelectorAll('[data-f]').forEach((b) =>
      b.addEventListener('click', () => {
        const f = b.dataset.f;
        root.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b));
        const filtered = f === 'all' ? rows : rows.filter((_, i) => open[i].side === f);
        root.querySelector('#pos-table').innerHTML = ui.table({
          cols: ['Instrument', 'Side', { label: 'Entry', num: true }, { label: 'Mark', num: true }, { label: 'Stop', num: true }, { label: 'Target', num: true }, { label: 'P&L', num: true }, { label: 'R', num: true }, { label: 'Risk', num: true }, ''],
          rows: filtered,
          empty: 'Nothing matches this filter.',
        });
      })
    );
  };

  /* ======================================================================
     JOURNAL
     ====================================================================== */
  PS.pages.journal = function (root) {
    const s = settings();
    const ccy = s.currency;
    let trades = Store.get(KEYS.trades, []);
    const stats = PS.stats(trades);
    const reflections = Store.get(KEYS.reflections, []);

    const filters = { q: '', side: 'all', result: 'all', setup: 'all', status: 'all' };
    const setups = Array.from(new Set(trades.map((t) => t.setup).filter(Boolean)));

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Journal</h1>
          <div class="sub">${stats.count} closed · ${stats.open} open · every entry is yours</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" data-act="import">${icon('upload')}Import</button>
          <button class="btn btn-sm" data-act="export">${icon('download')}Export CSV</button>
          <button class="btn btn-sm btn-primary" data-act="new">${icon('plus')}Log trade</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid g6">
          ${ui.kpi({ k: 'Net', v: `<span class="${klass(stats.net)}">${money(stats.net, ccy)}</span>`, d: `${stats.count} trades`, accent: true, iconName: 'chart' })}
          ${ui.kpi({ k: 'Win rate', v: fmt(stats.winRate, 1) + '<small>%</small>', d: `${stats.wins}W · ${stats.losses}L`, iconName: 'target' })}
          ${ui.kpi({ k: 'Profit factor', v: stats.profitFactor === Infinity ? '∞' : fmt(stats.profitFactor, 2), d: 'gross win ÷ loss', iconName: 'scale' })}
          ${ui.kpi({ k: 'Expectancy', v: money(stats.expectancy, ccy), d: 'per trade', iconName: 'spark' })}
          ${ui.kpi({ k: 'Avg R', v: signed(stats.avgR, 2) + '<small>R</small>', d: `${signed(stats.totalR, 1)}R total`, iconName: 'zap' })}
          ${ui.kpi({ k: 'Max drawdown', v: money(-stats.maxDD, ccy, 0), d: `${fmt(stats.maxDDPct, 1)}% of peak`, iconName: 'warn' })}
        </div>

        ${ui.panel({
          title: 'Trade log',
          flush: true,
          right: `<div class="row" style="gap:6px;flex-wrap:wrap">
            <input class="in" id="f-q" placeholder="Search symbol, setup, note…" style="height:26px;width:190px;font-size:11.5px">
            <select class="sel" id="f-side" style="height:26px;width:auto;font-size:11.5px">
              <option value="all">All sides</option><option value="buy">Buys</option><option value="sell">Sells</option>
            </select>
            <select class="sel" id="f-result" style="height:26px;width:auto;font-size:11.5px">
              <option value="all">All results</option><option value="win">Wins</option><option value="loss">Losses</option>
            </select>
            <select class="sel" id="f-setup" style="height:26px;width:auto;font-size:11.5px">
              <option value="all">All setups</option>
              ${setups.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}
            </select>
          </div>`,
          body: `<div id="trade-table"></div>`,
          foot: `<div class="row-between"><span class="xs" id="trade-count"></span><button class="btn btn-sm btn-ghost" id="add-reflection">${icon('note')}Add daily reflection</button></div>`,
        })}

        <div class="grid g2-1">
          ${ui.panel({
            title: 'Daily reflections',
            sub: 'What the day taught you',
            flush: true,
            body: `<div id="reflection-list" style="display:grid;gap:8px;padding:10px"></div>`,
          })}
          ${ui.panel({
            title: 'By setup',
            body: `<div id="by-setup"></div>`,
          })}
        </div>
      </div>`;

    /* ---- render table ---- */
    const renderTable = () => {
      const q = filters.q.toLowerCase().trim();
      const list = trades
        .filter((t) => t.status !== 'open')
        .filter((t) => filters.side === 'all' || t.side === filters.side)
        .filter((t) => filters.result === 'all' || (filters.result === 'win' ? t.pnl > 0 : t.pnl < 0))
        .filter((t) => filters.setup === 'all' || t.setup === filters.setup)
        .filter((t) => !q || (t.sym + ' ' + (t.setup || '') + ' ' + (t.notes || '')).toLowerCase().includes(q))
        .sort((a, b) => b.closedAt - a.closedAt);

      const rows = list.map(
        (t) => `<tr>
          <td class="xs dim nowrap">${PS.dateShort(t.closedAt)}</td>
          <td><strong>${esc(t.sym)}</strong><div class="xs dim">${esc(PS.symMeta(t.sym).cls)}</div></td>
          <td>${ui.chip(t.side.toUpperCase(), t.side === 'buy' ? 'green' : 'red')}</td>
          <td class="num xs dim">${fmt(t.lots, 2)}</td>
          <td class="num">${PS.fmtPrice(t.entry)}</td>
          <td class="num">${PS.fmtPrice(t.exit)}</td>
          <td class="num ${klass(t.pnl)}">${money(t.pnl, ccy)}</td>
          <td class="num ${klass(t.r)}">${signed(t.r, 2)}R</td>
          <td class="xs dim" style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.setup || '')}">${esc(t.setup || '—')}</td>
          <td style="text-align:right">
            <div class="row" style="gap:2px;justify-content:flex-end">
              <button class="icon-btn" data-view="${t.id}" title="Details">${icon('eye')}</button>
              <button class="icon-btn" data-edit="${t.id}" title="Edit">${icon('edit')}</button>
            </div>
          </td>
        </tr>`
      );

      root.querySelector('#trade-table').innerHTML = ui.table({
        cols: [
          'Date', 'Symbol', 'Side', { label: 'Lots', num: true }, { label: 'Entry', num: true },
          { label: 'Exit', num: true }, { label: 'P&L', num: true }, { label: 'R', num: true }, 'Setup', '',
        ],
        rows,
        empty: q ? 'No trades match your search.' : 'No closed trades yet. Log one — especially the bad ones.',
      });
      root.querySelector('#trade-count').textContent = `${list.length} shown · ${money(list.reduce((a, t) => a + t.pnl, 0), ccy)} net`;

      root.querySelectorAll('[data-view]').forEach((b) =>
        b.addEventListener('click', () => showTrade(trades.find((t) => t.id === b.dataset.view)))
      );
      root.querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => openForm(trades.find((t) => t.id === b.dataset.edit)))
      );
    };

    /* ---- trade detail ---- */
    const showTrade = (t) => {
      if (!t) return;
      PS.modal({
        title: `${t.sym} · ${t.side.toUpperCase()} · ${money(t.pnl, ccy)}`,
        wide: true,
        body: `
          <div class="grid g2" style="gap:14px">
            <div>
              ${ui.statRows([
                { k: 'Opened', v: PS.dateFull(t.openedAt) + ' ' + PS.timeShort(t.openedAt) },
                { k: 'Closed', v: PS.dateFull(t.closedAt) + ' ' + PS.timeShort(t.closedAt) },
                { k: 'Duration', v: ((t.closedAt - t.openedAt) / 36e5).toFixed(1) + ' h' },
                { k: 'Lots', v: fmt(t.lots, 2) },
                { k: 'Entry → Exit', v: `${PS.fmtPrice(t.entry)} → ${PS.fmtPrice(t.exit)}` },
                { k: 'Stop / Target', v: `${PS.fmtPrice(t.sl)} / ${PS.fmtPrice(t.tp)}` },
              ])}
            </div>
            <div>
              ${ui.statRows([
                { k: 'P&L', v: money(t.pnl, ccy), cls: klass(t.pnl) },
                { k: 'R multiple', v: signed(t.r, 2) + 'R', cls: klass(t.r) },
                { k: 'Setup', v: esc(t.setup || '—') },
                { k: 'Session', v: esc(t.session || '—') },
                { k: 'Account', v: esc(t.account === 'acc_demo' ? 'Demo' : 'Live') },
              ])}
            </div>
          </div>
          <div>
            <div class="label" style="margin-bottom:5px">Notes</div>
            <div class="note-card"><div class="body">${esc(t.notes || 'No notes for this trade.')}</div></div>
          </div>`,
        footer: `<button class="btn btn-danger" data-del>Delete</button><button class="btn" data-close>Close</button><button class="btn btn-primary" data-edit2>Edit</button>`,
        onOpen(el, close) {
          el.querySelector('[data-del]').addEventListener('click', async () => {
            if (!(await PS.confirm('Delete this trade permanently?', { danger: true, confirmLabel: 'Delete' }))) return;
            trades = trades.filter((x) => x.id !== t.id);
            Store.set(KEYS.trades, trades);
            close();
            PS.pages.journal(root);
            PS.toast('Trade deleted');
          });
          el.querySelector('[data-edit2]').addEventListener('click', () => {
            close();
            openForm(t);
          });
        },
      });
    };

    /* ---- add/edit form ---- */
    const openForm = (existing = null) => {
      const pre = (() => {
        try {
          return JSON.parse(sessionStorage.getItem('ps.newTrade') || 'null');
        } catch (e) {
          return null;
        }
      })();
      sessionStorage.removeItem('ps.newTrade');

      const t = existing || {
        sym: (pre && pre.sym) || 'XAUUSD',
        side: 'buy',
        lots: (pre && pre.lots) || 0.5,
        entry: (pre && pre.entry) || PS.price((pre && pre.sym) || 'XAUUSD'),
        sl: (pre && pre.sl) || '',
        tp: '',
        exit: '',
        setup: '',
        notes: '',
        session: 'London',
      };

      const m = PS.modal({
        title: existing ? `Edit ${t.sym}` : 'Log a trade',
        wide: true,
        body: `
          <div class="grid g3" style="gap:10px">
            ${ui.field({ label: 'Symbol', id: 'j-sym', value: t.sym, options: PS.SYMBOLS.map((x) => ({ value: x.sym, label: x.sym + ' · ' + x.name })) })}
            ${ui.field({ label: 'Side', id: 'j-side', value: t.side, options: [{ value: 'buy', label: 'Buy / long' }, { value: 'sell', label: 'Sell / short' }] })}
            ${ui.field({ label: 'Lots', id: 'j-lots', type: 'number', value: t.lots, attrs: 'step="0.01"' })}
          </div>
          <div class="grid g4" style="gap:10px">
            ${ui.field({ label: 'Entry', id: 'j-entry', type: 'number', value: t.entry, attrs: 'step="0.00001"' })}
            ${ui.field({ label: 'Stop', id: 'j-sl', type: 'number', value: t.sl, attrs: 'step="0.00001"' })}
            ${ui.field({ label: 'Target', id: 'j-tp', type: 'number', value: t.tp, attrs: 'step="0.00001"' })}
            ${ui.field({ label: 'Exit', id: 'j-exit', type: 'number', value: t.exit || '', attrs: 'step="0.00001"', hint: 'Leave blank to keep open' })}
          </div>
          <div class="grid g2" style="gap:10px">
            ${ui.field({ label: 'Setup', id: 'j-setup', value: t.setup, placeholder: 'FVG pullback · 1H' })}
            ${ui.field({ label: 'Session', id: 'j-session', value: t.session || 'London', options: ['Asia', 'London', 'New York', 'Tokyo'] })}
          </div>
          ${ui.field({ label: 'Notes', id: 'j-notes', textarea: true, value: t.notes, placeholder: 'What did you see? What would you repeat? What would you change?' })}
          <div class="note-card" id="j-preview" style="background:var(--panel-2)"></div>`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="j-save">${existing ? 'Save changes' : 'Save trade'}</button>`,
        onOpen(el, close) {
          const read = () => ({
            sym: el.querySelector('#j-sym').value,
            side: el.querySelector('#j-side').value,
            lots: Number(el.querySelector('#j-lots').value) || 0,
            entry: Number(el.querySelector('#j-entry').value) || 0,
            sl: Number(el.querySelector('#j-sl').value) || 0,
            tp: Number(el.querySelector('#j-tp').value) || 0,
            exit: Number(el.querySelector('#j-exit').value) || 0,
            setup: el.querySelector('#j-setup').value,
            session: el.querySelector('#j-session').value,
            notes: el.querySelector('#j-notes').value,
          });

          const preview = () => {
            const v = read();
            const open = !v.exit;
            const px = open ? PS.price(v.sym) : v.exit;
            const pnl = PS.pnlFor(v.sym, v.side, v.lots, v.entry, px);
            const riskCash = PS.riskCashFor(v.sym, v.lots, v.entry, v.sl);
            const r = PS.rFor(v.sym, v.side, v.lots, v.entry, px, v.sl);
            const riskPct = (riskCash / s.startingBalance) * 100;
            el.querySelector('#j-preview').innerHTML = `
              <div class="row-between"><span class="xs muted">${open ? 'Unrealised at mark' : 'Realised P&L'}</span>
                <span class="mono sm ${klass(pnl)}">${money(pnl, ccy)}</span></div>
              <div class="row-between"><span class="xs muted">R multiple</span><span class="mono xs ${klass(r)}">${signed(r, 2)}R</span></div>
              <div class="row-between"><span class="xs muted">Risk at entry</span>
                <span class="mono xs ${riskPct > s.riskPerTrade ? 'dn' : ''}">${money(riskCash, ccy)} · ${fmt(riskPct, 2)}%</span></div>
              ${riskPct > s.riskPerTrade ? `<div class="chip chip-red" style="height:auto;padding:4px 7px">${icon('warn')} Above your ${s.riskPerTrade}% limit</div>` : ''}`;
          };
          el.querySelectorAll('input,select,textarea').forEach((i) => i.addEventListener('input', preview));
          el.querySelector('#j-sym').addEventListener('change', preview);
          preview();

          el.querySelector('#j-save').addEventListener('click', () => {
            const v = read();
            if (!v.sym || !v.entry) {
              PS.toast('Symbol and entry are required', 'err');
              return;
            }
            const isOpen = !v.exit;

            const rec = Object.assign({}, existing || {}, {
              id: existing ? existing.id : PS.uid('t'),
              sym: v.sym,
              side: v.side,
              lots: v.lots,
              entry: v.entry,
              sl: v.sl || null,
              tp: v.tp || null,
              setup: v.setup,
              session: v.session,
              notes: v.notes,
              account: 'acc_demo',
              status: isOpen ? 'open' : 'closed',
              openedAt: existing ? existing.openedAt : Date.now(),
              exit: isOpen ? null : v.exit,
              closedAt: isOpen ? null : Date.now(),
            });
            if (!isOpen) {
              rec.pnl = PS.pnlFor(v.sym, v.side, v.lots, v.entry, v.exit);
              rec.r = PS.rFor(v.sym, v.side, v.lots, v.entry, v.exit, v.sl);
            } else {
              rec.pnl = 0;
              rec.r = 0;
            }

            if (existing) {
              trades = trades.map((x) => (x.id === existing.id ? rec : x));
            } else {
              trades = trades.concat(rec);
            }
            Store.set(KEYS.trades, trades);
            close();
            PS.pages.journal(root);
            PS.toast(existing ? 'Trade updated' : 'Trade logged');
          });
        },
      });
    };

    /* ---- reflections ---- */
    const renderReflections = () => {
      const host = root.querySelector('#reflection-list');
      const list = Store.get(KEYS.reflections, []).slice().sort((a, b) => b.createdAt - a.createdAt);
      host.innerHTML = list.length
        ? list
            .map(
              (r) => `<div class="note-card">
                <div class="head">
                  <span class="chip chip-${r.grade === 'A' ? 'green' : r.grade === 'B' ? 'blue' : 'red'}">${esc(r.grade || '—')}</span>
                  <span class="xs">${PS.dateFull(r.createdAt)}</span>
                  <span class="xs dim" style="margin-left:auto">${esc(r.mood || '')}</span>
                  <button class="icon-btn" data-delref="${r.id}">${icon('trash')}</button>
                </div>
                <div class="body">${esc(r.body)}</div>
                ${r.lessons ? `<div class="xs" style="color:var(--amber)">Lesson: ${esc(r.lessons)}</div>` : ''}
              </div>`
            )
            .join('')
        : ui.empty('No reflections yet. Two honest lines a day beat a perfect spreadsheet.');
      host.querySelectorAll('[data-delref]').forEach((b) =>
        b.addEventListener('click', () => {
          Store.set(
            KEYS.reflections,
            Store.get(KEYS.reflections, []).filter((x) => x.id !== b.dataset.delref)
          );
          renderReflections();
          PS.toast('Reflection removed');
        })
      );
    };

    root.querySelector('#add-reflection').addEventListener('click', () => {
      PS.modal({
        title: 'Daily reflection',
        body: `
          <div class="grid g2" style="gap:10px">
            ${ui.field({ label: 'Grade', id: 'rf-grade', value: 'B', options: ['A', 'B', 'C', 'D'] })}
            ${ui.field({ label: 'Mood', id: 'rf-mood', value: 'calm', options: ['calm', 'confident', 'frustrated', 'tilted', 'bored', 'tired'] })}
          </div>
          ${ui.field({ label: 'What happened', id: 'rf-body', textarea: true, placeholder: 'What did the day actually look like?' })}
          ${ui.field({ label: 'Lesson', id: 'rf-lesson', placeholder: 'One line you want to remember tomorrow' })}`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="rf-save">Save</button>`,
        onOpen(el, close) {
          el.querySelector('#rf-save').addEventListener('click', () => {
            const body = el.querySelector('#rf-body').value.trim();
            if (!body) return PS.toast('Write something first', 'err');
            const list = Store.get(KEYS.reflections, []);
            list.push({
              id: PS.uid('r'),
              grade: el.querySelector('#rf-grade').value,
              mood: el.querySelector('#rf-mood').value,
              body,
              lessons: el.querySelector('#rf-lesson').value.trim(),
              date: PS.isoDate(Date.now()),
              createdAt: Date.now(),
            });
            Store.set(KEYS.reflections, list);
            close();
            renderReflections();
            PS.toast('Reflection saved');
          });
        },
      });
    });

    /* ---- by setup ---- */
    const bySetup = PS.groupBy(trades.filter((t) => t.status !== 'open'), (t) => t.setup || 'Untagged');
    root.querySelector('#by-setup').innerHTML =
      PS.barListHtml(
        bySetup.map((g) => ({ label: `${g.key} (${g.stats.count})`, value: g.stats.net })),
        { format: (v) => money(v, ccy, 0) }
      ) || ui.empty('Tag your setups to see this.');

    /* ---- wiring ---- */
    root.querySelector('[data-act="new"]').addEventListener('click', () => openForm());
    root.querySelector('#f-q').addEventListener('input', PS.debounce((e) => { filters.q = e.target.value; renderTable(); }, 180));
    root.querySelector('#f-side').addEventListener('change', (e) => { filters.side = e.target.value; renderTable(); });
    root.querySelector('#f-result').addEventListener('change', (e) => { filters.result = e.target.value; renderTable(); });
    root.querySelector('#f-setup').addEventListener('change', (e) => { filters.setup = e.target.value; renderTable(); });

    root.querySelector('[data-act="export"]').addEventListener('click', () => {
      const csv = ui.toCsv(trades, [
        { label: 'id', get: (t) => t.id },
        { label: 'symbol', get: (t) => t.sym },
        { label: 'side', get: (t) => t.side },
        { label: 'lots', get: (t) => t.lots },
        { label: 'entry', get: (t) => t.entry },
        { label: 'exit', get: (t) => t.exit },
        { label: 'sl', get: (t) => t.sl },
        { label: 'tp', get: (t) => t.tp },
        { label: 'pnl', get: (t) => t.pnl },
        { label: 'r', get: (t) => t.r },
        { label: 'setup', get: (t) => t.setup },
        { label: 'session', get: (t) => t.session },
        { label: 'status', get: (t) => t.status },
        { label: 'opened_at', get: (t) => t.openedAt },
        { label: 'closed_at', get: (t) => t.closedAt },
        { label: 'notes', get: (t) => t.notes },
      ]);
      ui.download('pipsage-journal-' + PS.isoDate(Date.now()) + '.csv', csv, 'text/csv');
      PS.toast('Journal exported');
    });

    root.querySelector('[data-act="import"]').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,.json';
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => {
          try {
            let imported = 0;
            if (f.name.endsWith('.json')) {
              const parsed = JSON.parse(fr.result);
              const list = Array.isArray(parsed) ? parsed : parsed.trades || [];
              list.forEach((t) => {
                if (t && t.sym) {
                  trades.push(Object.assign({ id: PS.uid('t') }, t));
                  imported++;
                }
              });
            } else {
              const lines = fr.result.split(/\r?\n/).filter(Boolean);
              const head = lines.shift().split(',').map((h) => h.trim().toLowerCase());
              lines.forEach((line) => {
                const cells = line.split(',');
                const row = {};
                head.forEach((h, i) => (row[h] = cells[i]));
                if (!row.symbol && !row.sym) return;
                const sym = (row.symbol || row.sym).toUpperCase();
                const side = (row.side || row.type || 'buy').toLowerCase();
                const entry = Number(row.entry || row.open_price || 0);
                const exit = Number(row.exit || row.close_price || 0);
                const lots = Number(row.lots || row.volume || 0.1);
                const pnl = row.pnl != null && row.pnl !== '' ? Number(row.pnl) : PS.pnlFor(sym, side, lots, entry, exit);
                trades.push({
                  id: PS.uid('t'), sym, side, lots, entry,
                  exit: exit || null, pnl: +pnl.toFixed(2),
                  r: 0, setup: row.setup || 'Imported', notes: row.notes || '',
                  session: row.session || '—', account: 'acc_demo',
                  status: exit ? 'closed' : 'open',
                  openedAt: row.opened_at ? Number(row.opened_at) : Date.now() - 864e5,
                  closedAt: exit ? (row.closed_at ? Number(row.closed_at) : Date.now()) : null,
                  sl: null, tp: null,
                });
                imported++;
              });
            }
            Store.set(KEYS.trades, trades);
            PS.pages.journal(root);
            PS.toast(`${imported} trades imported`);
          } catch (err) {
            PS.toast('Could not read that file', 'err');
          }
        };
        fr.readAsText(f);
      });
      input.click();
    });

    renderTable();
    renderReflections();

    if (location.hash === '#new') {
      history.replaceState(null, '', 'journal.html');
      setTimeout(() => openForm(), 120);
    }
  };
})();
