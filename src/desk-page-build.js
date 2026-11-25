/* ==========================================================================
   Pages: Strategies · Backtest lab
   ========================================================================== */
(function () {
  'use strict';
  const PS = window.PS;
  const { ui, icon, esc, fmt, money, signed, klass, Store, KEYS, settings } = PS;
  PS.pages = PS.pages || {};

  /* ======================================================================
     STRATEGIES
     ====================================================================== */
  PS.pages.strategies = function (root) {
    const s = settings();
    const ccy = s.currency;
    const strats = Store.get(KEYS.strategies, []);
    const trades = Store.get(KEYS.trades, []);

    const live = strats.filter((x) => x.status === 'live');
    const paused = strats.filter((x) => x.status === 'paused');

    const rows = strats.map((st) => {
      const linkedTrades = trades.filter((t) => (t.setup || '').toLowerCase().includes((st.name || '').split(' ')[0].toLowerCase()));
      const lst = PS.stats(linkedTrades);
      return `<tr>
        <td>
          <strong>${esc(st.name)}</strong>
          <div class="xs dim">${esc((st.markets || []).join(', '))} · ${esc(st.tf || '')}</div>
        </td>
        <td>${ui.statusPill(st.status)}</td>
        <td class="num">${st.trades || 0}</td>
        <td class="num">${st.win ? fmt(st.win, 1) + '%' : '—'}</td>
        <td class="num">${st.pf ? fmt(st.pf, 2) : '—'}</td>
        <td class="num">${st.dd ? fmt(st.dd, 1) + '%' : '—'}</td>
        <td class="num ${klass(lst.net)}">${lst.count ? money(lst.net, ccy, 0) : '—'}</td>
        <td class="xs dim nowrap">${st.since ? PS.dateShort(new Date(st.since).getTime()) : '—'}</td>
        <td style="text-align:right">
          <div class="row" style="gap:2px;justify-content:flex-end">
            <button class="icon-btn" data-toggle="${st.id}" title="${st.status === 'live' ? 'Pause' : 'Activate'}">
              ${icon(st.status === 'live' ? 'pause' : 'play')}
            </button>
            <button class="icon-btn" data-lab="${st.id}" title="Backtest">${icon('trend')}</button>
            <button class="icon-btn" data-edit="${st.id}" title="Edit rules">${icon('edit')}</button>
            <button class="icon-btn" data-clone="${st.id}" title="Duplicate">${icon('copy')}</button>
          </div>
        </td>
      </tr>`;
    });

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Strategies</h1>
          <div class="sub">${live.length} live · ${paused.length} paused · ${strats.length} total</div>
        </div>
        <div class="actions">
          <a class="btn btn-sm" href="lab.html">${icon('trend')}Backtest lab</a>
          <button class="btn btn-sm btn-primary" data-act="new">${icon('plus')}New strategy</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid g4">
          ${ui.kpi({ k: 'Live', v: String(live.length), d: 'running rules', accent: true, iconName: 'play' })}
          ${ui.kpi({ k: 'Avg profit factor', v: live.length ? fmt(live.reduce((a, x) => a + (x.pf || 0), 0) / live.length, 2) : '—', d: 'across live', iconName: 'scale' })}
          ${ui.kpi({ k: 'Avg win rate', v: live.length ? fmt(live.reduce((a, x) => a + (x.win || 0), 0) / live.length, 1) + '<small>%</small>' : '—', d: 'across live', iconName: 'target' })}
          ${ui.kpi({ k: 'Total backtest trades', v: PS.fmtInt(strats.reduce((a, x) => a + (x.trades || 0), 0)), d: 'sample data', iconName: 'flask' })}
        </div>

        ${ui.panel({
          title: 'All strategies',
          flush: true,
          body: ui.table({
            cols: [
              'Strategy', 'Status', { label: 'Trades', num: true }, { label: 'Win', num: true },
              { label: 'PF', num: true }, { label: 'Max DD', num: true }, { label: 'Your P&L', num: true }, 'Since', '',
            ],
            rows,
            empty: 'No strategies yet. Draft one — a rule you can write down is a rule you can test.',
          }),
        })}

        ${ui.panel({
          title: 'Rule graph',
          sub: 'Click a live strategy to inspect its logic',
          body: `<div id="graph-host">${ui.empty('Select a strategy above.')}</div>`,
        })}

        ${ui.panel({
          title: 'Risk defaults applied to every strategy',
          right: `<a class="btn btn-sm btn-ghost" href="risk.html">Edit ${icon('arrowRight')}</a>`,
          body: `<div class="grid g4" style="gap:10px">
            ${[
              ['Risk per trade', fmt(s.riskPerTrade, 2) + '%'],
              ['Max open positions', String(s.maxOpenPositions)],
              ['Daily loss limit', fmt(s.dailyLossLimit, 1) + '%'],
              ['Max spread', s.maxSpread + ' pts'],
            ]
              .map(([k, v]) => `<div><div class="label">${k}</div><div class="mono sm" style="margin-top:2px">${v}</div></div>`)
              .join('')}
          </div>`,
        })}
      </div>`;

    /* ---- rule graph renderer ---- */
    const renderGraph = (st) => {
      const host = root.querySelector('#graph-host');
      if (!st) {
        host.innerHTML = ui.empty('Select a strategy above.');
        return;
      }
      const r = st.rules || {};
      const nodes = [
        { t: 'Filter', v: (r.filters || []).join(' · ') || '—', c: 'var(--blue)' },
        { t: 'Entry', v: r.enter || '—', c: 'var(--amber)' },
        { t: 'Stop', v: r.stop || '—', c: 'var(--red)' },
        { t: 'Target', v: r.target || '—', c: 'var(--green)' },
        { t: 'Size', v: `${s.riskPerTrade}% risk · max ${s.maxOpenPositions} open`, c: 'var(--violet)' },
      ];
      host.innerHTML = `
        <div class="row-between" style="margin-bottom:10px">
          <div><strong class="sm">${esc(st.name)}</strong>
            <span class="xs dim"> · ${esc((st.markets || []).join(', '))} ${esc(st.tf || '')}</span></div>
          <div class="row" style="gap:6px">
            ${ui.statusPill(st.status)}
            <a class="btn btn-sm" href="lab.html?strategy=${st.id}">${icon('trend')}Backtest</a>
          </div>
        </div>
        <div style="display:grid;gap:6px">
          ${nodes
            .map(
              (n, i) => `<div style="display:grid;grid-template-columns:20px 74px 1fr;gap:10px;align-items:center">
                <div style="display:grid;place-items:center">
                  <span style="width:18px;height:18px;border-radius:50%;border:1px solid ${n.c};background:var(--panel-2);display:grid;place-items:center;font-family:var(--mono);font-size:9px;color:${n.c}">${i + 1}</span>
                </div>
                <span class="label" style="color:${n.c}">${n.t}</span>
                <div style="border:1px solid var(--line);border-left:2px solid ${n.c};border-radius:var(--r-sm);padding:7px 10px;background:var(--panel-2);font-size:12.5px;color:var(--ink-2)">
                  ${esc(n.v)}
                </div>
              </div>`
            )
            .join('')}
        </div>`;
    };

    root.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openEditor(strats.find((x) => x.id === b.dataset.edit)))
    );
    root.querySelectorAll('[data-lab]').forEach((b) =>
      b.addEventListener('click', () => {
        renderGraph(strats.find((x) => x.id === b.dataset.lab));
        location.hash = '';
      })
    );
    root.querySelectorAll('[data-clone]').forEach((b) =>
      b.addEventListener('click', () => {
        const src = strats.find((x) => x.id === b.dataset.clone);
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = PS.uid('s');
        copy.name = src.name + ' (copy)';
        copy.status = 'draft';
        Store.set(KEYS.strategies, strats.concat(copy));
        PS.toast('Strategy duplicated');
        PS.pages.strategies(root);
      })
    );
    root.querySelectorAll('[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        const st = strats.find((x) => x.id === b.dataset.toggle);
        st.status = st.status === 'live' ? 'paused' : 'live';
        Store.set(KEYS.strategies, strats);
        PS.toast(`${st.name} ${st.status}`);
        PS.pages.strategies(root);
      })
    );

    /* ---- editor ---- */
    const openEditor = (existing) => {
      const st = existing || {
        name: '', markets: ['XAUUSD'], tf: '1H', status: 'draft',
        rules: { enter: '', stop: '', target: '', filters: [] },
      };
      const filterOpts = ['4H trend filter', 'London session only', 'Spread < 25 pts', 'No high-impact news', 'Max 3 open', 'ATR > 20'];
      const m = PS.modal({
        title: existing ? 'Edit strategy' : 'New strategy',
        wide: true,
        body: `
          <div class="grid g3" style="gap:10px">
            ${ui.field({ label: 'Name', id: 'st-name', value: st.name, placeholder: 'Gold FVG pullback' })}
            ${ui.field({ label: 'Market', id: 'st-market', value: (st.markets || ['XAUUSD'])[0], options: PS.SYMBOLS.map((x) => x.sym) })}
            ${ui.field({ label: 'Timeframe', id: 'st-tf', value: st.tf, options: ['5m', '15m', '1H', '4H', '1D'] })}
          </div>
          ${ui.field({ label: 'Entry rule', id: 'st-enter', value: st.rules.enter, placeholder: 'Retest of unmitigated 1H FVG after an Asian sweep' })}
          <div class="grid g2" style="gap:10px">
            ${ui.field({ label: 'Stop', id: 'st-stop', value: st.rules.stop, placeholder: 'Below the sweep low − 0.3×ATR' })}
            ${ui.field({ label: 'Target', id: 'st-target', value: st.rules.target, placeholder: 'Prior day high or 2R' })}
          </div>
          <div>
            <div class="label" style="margin-bottom:6px">Filters</div>
            <div class="grid g2" style="gap:5px">
              ${filterOpts
                .map(
                  (f) => `<label class="check"><input type="checkbox" data-filter="${esc(f)}" ${(st.rules.filters || []).includes(f) ? 'checked' : ''}><span class="xs">${esc(f)}</span></label>`
                )
                .join('')}
            </div>
          </div>
          ${ui.field({ label: 'Status', id: 'st-status', value: st.status, options: ['draft', 'live', 'paused'] })}
          <p class="xs dim">Rules are stored as text so you can read them back in six months and still understand them.</p>`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="st-save">${existing ? 'Save' : 'Create'}</button>`,
        onOpen(el, close) {
          el.querySelector('#st-save').addEventListener('click', () => {
            const name = el.querySelector('#st-name').value.trim();
            if (!name) return PS.toast('Give it a name', 'err');
            const filters = PS.$$('[data-filter]', el)
              .filter((c) => c.checked)
              .map((c) => c.dataset.filter);
            const rec = Object.assign({}, existing || {
              id: PS.uid('s'),
              win: 0, pf: 0, trades: 0, dd: 0,
              since: PS.isoDate(Date.now()),
            }, {
              name,
              markets: [el.querySelector('#st-market').value],
              tf: el.querySelector('#st-tf').value,
              status: el.querySelector('#st-status').value,
              rules: {
                enter: el.querySelector('#st-enter').value,
                stop: el.querySelector('#st-stop').value,
                target: el.querySelector('#st-target').value,
                filters,
              },
            });
            const all = Store.get(KEYS.strategies, []);
            const next = existing ? all.map((x) => (x.id === rec.id ? rec : x)) : all.concat(rec);
            Store.set(KEYS.strategies, next);
            close();
            PS.pages.strategies(root);
            PS.toast(existing ? 'Strategy saved' : 'Strategy created');
          });
        },
      });
    };

    root.querySelector('[data-act="new"]').addEventListener('click', () => openEditor(null));
    if (strats.length) renderGraph(strats[0]);
  };

  /* ======================================================================
     BACKTEST LAB — a real (if simple) bar-by-bar engine
     ====================================================================== */
  PS.backtest = function ({ sym, tf, fast, slow, atrMult, rr, riskPct, balance, lots, type }) {
    const meta = PS.symMeta(sym);
    const bars = PS.candles(sym, 700, tf === '1D' ? 6 : tf === '4H' ? 2.4 : 1);
    const closes = bars.map((b) => b.c);
    const emaF = PS.Ind.ema(closes, fast);
    const emaS = PS.Ind.ema(closes, slow);
    const atr = PS.Ind.atr(bars, 14);

    let equity = balance;
    let peak = balance;
    let maxDD = 0;
    const trades = [];
    const curve = [balance];
    let pos = null;

    for (let i = 2; i < bars.length; i++) {
      const b = bars[i];
      const ef = emaF[i];
      const es = emaS[i];
      const efPrev = emaF[i - 1];
      const esPrev = emaS[i - 1];
      if (ef == null || es == null || efPrev == null || esPrev == null || atr[i] == null) {
        curve.push(equity);
        continue;
      }

      const crossUp = efPrev <= esPrev && ef > es;
      const crossDown = efPrev >= esPrev && ef < es;
      const mode = type === 'trend' ? 'both' : 'long';

      /* manage open position */
      if (pos) {
        const hitStop = pos.side === 'buy' ? b.l <= pos.sl : b.h >= pos.sl;
        const hitTp = pos.side === 'buy' ? b.h >= pos.tp : b.l <= pos.tp;
        if (hitStop || hitTp) {
          const exit = hitStop ? pos.sl : pos.tp;
          const dir = pos.side === 'buy' ? 1 : -1;
          const pnl = PS.pnlFor(sym, pos.side, pos.lots, pos.entry, exit);
          equity += pnl;
          peak = Math.max(peak, equity);
          maxDD = Math.max(maxDD, peak - equity);
          trades.push({
            side: pos.side, entry: pos.entry, exit,
            openedAt: pos.t, closedAt: b.t,
            lots: pos.lots, pnl: +pnl.toFixed(2),
            r: PS.rFor(sym, pos.side, pos.lots, pos.entry, exit, pos.sl),
            reason: hitStop ? 'stop' : 'target',
          });
          pos = null;
        }
      }

      /* entries */
      if (!pos) {
        const enter = (crossUp && mode !== 'short') || (crossDown && mode === 'both');
        if (enter) {
          const side = crossUp ? 'buy' : 'sell';
          const dir = side === 'buy' ? 1 : -1;
          const riskCash = (equity * riskPct) / 100;
          const stopDist = atr[i] * atrMult;
          const perLot = PS.riskCashFor(sym, 1, b.c, b.c - dir * stopDist) || stopDist * PS.contractOf(sym);
          const size = lots || (perLot ? riskCash / perLot : 0);
          pos = {
            side,
            entry: b.c,
            sl: b.c - dir * stopDist,
            tp: b.c + dir * stopDist * rr,
            lots: +size.toFixed(2),
            t: b.t,
          };
        }
      }
      curve.push(equity);
    }

    /* close any open trade at the last bar */
    if (pos) {
      const dir = pos.side === 'buy' ? 1 : -1;
      const exit = closes[closes.length - 1];
      const pnl = PS.pnlFor(sym, pos.side, pos.lots, pos.entry, exit);
      equity += pnl;
      trades.push({
        side: pos.side, entry: pos.entry, exit, openedAt: pos.t,
        closedAt: bars[bars.length - 1].t, lots: pos.lots,
        pnl: +pnl.toFixed(2), r: PS.rFor(sym, pos.side, pos.lots, pos.entry, exit, pos.sl),
        reason: 'open-at-end',
      });
    }

    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl < 0);
    const gw = wins.reduce((a, t) => a + t.pnl, 0);
    const gl = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

    return {
      trades,
      curve,
      stats: {
        count: trades.length,
        net: +(equity - balance).toFixed(2),
        netPct: +(((equity - balance) / balance) * 100).toFixed(2),
        winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
        pf: gl ? gw / gl : gw ? Infinity : 0,
        maxDD: +maxDD.toFixed(2),
        maxDDPct: peak ? +((maxDD / peak) * 100).toFixed(2) : 0,
        expectancy: trades.length ? +(trades.reduce((a, t) => a + t.pnl, 0) / trades.length).toFixed(2) : 0,
        avgWin: wins.length ? gw / wins.length : 0,
        avgLoss: losses.length ? gl / losses.length : 0,
        final: +equity.toFixed(2),
      },
    };
  };

  PS.pages.lab = function (root) {
    const s = settings();
    const ccy = s.currency;
    const params = {
      sym: 'XAUUSD', tf: '1H', fast: 21, slow: 55,
      atrMult: 2, rr: 2, riskPct: s.riskPerTrade,
      balance: s.startingBalance, lots: 0, type: 'both',
    };

    const result = PS.backtest(params);

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Backtest lab</h1>
          <div class="sub">Bar-by-bar EMA crossover engine on sample OHLC · ${result.stats.count} trades simulated</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" data-act="csv">${icon('download')}Trade list</button>
          <button class="btn btn-sm btn-primary" data-act="run">${icon('play')}Run backtest</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid" style="grid-template-columns:262px minmax(0,1fr);align-items:start" id="lab-grid">
          ${ui.panel({
            title: 'Parameters',
            flush: true,
            body: `<div style="padding:12px;display:grid;gap:10px">
              ${ui.field({ label: 'Instrument', id: 'bt-sym', value: params.sym, options: PS.SYMBOLS.map((x) => x.sym) })}
              ${ui.field({ label: 'Timeframe', id: 'bt-tf', value: params.tf, options: ['15m', '1H', '4H', '1D'] })}
              <div class="grid g2" style="gap:8px">
                ${ui.field({ label: 'Fast EMA', id: 'bt-fast', type: 'number', value: params.fast })}
                ${ui.field({ label: 'Slow EMA', id: 'bt-slow', type: 'number', value: params.slow })}
              </div>
              <div class="grid g2" style="gap:8px">
                ${ui.field({ label: 'ATR mult', id: 'bt-atr', type: 'number', value: params.atrMult, attrs: 'step="0.1"' })}
                ${ui.field({ label: 'Reward:R', id: 'bt-rr', type: 'number', value: params.rr, attrs: 'step="0.5"' })}
              </div>
              ${ui.field({ label: 'Direction', id: 'bt-type', value: params.type, options: [{ value: 'both', label: 'Long & short' }, { value: 'long', label: 'Long only' }] })}
              <div class="grid g2" style="gap:8px">
                ${ui.field({ label: 'Risk %', id: 'bt-risk', type: 'number', value: params.riskPct, attrs: 'step="0.05"' })}
                ${ui.field({ label: 'Balance', id: 'bt-bal', type: 'number', value: params.balance })}
              </div>
              ${ui.field({ label: 'Fixed lots (0 = auto)', id: 'bt-lots', type: 'number', value: 0, attrs: 'step="0.01"', hint: 'Auto uses risk % and ATR stop' })}
              <button class="btn btn-primary btn-block" id="bt-run">${icon('play')}Run backtest</button>
              <p class="xs dim">Sample data, fixed seed. Numbers are illustrative of the engine, not a promise.</p>
            </div>`,
          })}
          <div style="display:grid;gap:12px;min-width:0">
            <div class="grid g4" id="bt-kpis"></div>
            ${ui.panel({
              title: 'Equity curve',
              right: `<span class="chip chip-plain" id="bt-range"></span>`,
              body: `<div class="chart-box"><canvas id="bt-chart"></canvas></div>`,
            })}
            <div class="grid g2">
              ${ui.panel({ title: 'Drawdown', body: `<div class="chart-box" id="bt-dd"></div>` })}
              ${ui.panel({ title: 'Monthly returns', body: `<div id="bt-monthly"></div>` })}
            </div>
            ${ui.panel({
              title: 'Simulated trades',
              flush: true,
              body: `<div id="bt-trades"></div>`,
            })}
          </div>
        </div>
      </div>`;

    let current = result;
    let chart = null;

    const paint = (res) => {
      const st = res.stats;
      root.querySelector('#bt-kpis').innerHTML = [
        ui.kpi({ k: 'Net', v: `<span class="${klass(st.net)}">${money(st.net, ccy, 0)}</span>`, d: signed(st.netPct, 2) + '%', accent: true }),
        ui.kpi({ k: 'Profit factor', v: st.pf === Infinity ? '∞' : fmt(st.pf, 2), d: `${st.count} trades` }),
        ui.kpi({ k: 'Win rate', v: fmt(st.winRate, 1) + '<small>%</small>', d: `${money(st.avgWin, ccy, 0)} avg win` }),
        ui.kpi({ k: 'Max drawdown', v: fmt(st.maxDDPct, 1) + '<small>%</small>', d: money(st.maxDD, ccy, 0) }),
      ].join('');

      root.querySelector('#bt-range').textContent = `${res.curve.length} bars`;
      if (chart) chart.setData(res.curve.map((v, i) => ({ t: Date.now() - (res.curve.length - i) * 36e5, o: v, h: v, l: v, c: v })), { resetView: true });

      /* drawdown series */
      let peak = res.curve[0];
      const dd = res.curve.map((v) => {
        peak = Math.max(peak, v);
        return -((peak - v) / peak) * 100;
      });
      root.querySelector('#bt-dd').innerHTML = PS.equitySvg(dd, { w: 420, h: 132, colour: '#f2555a', showZero: false, fill: true });

      /* monthly */
      const byMonth = {};
      res.trades.forEach((t) => {
        const d = new Date(t.closedAt);
        const k = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
        byMonth[k] = (byMonth[k] || 0) + t.pnl;
      });
      const months = Object.entries(byMonth);
      root.querySelector('#bt-monthly').innerHTML = months.length
        ? PS.barListHtml(months.map(([k, v]) => ({ label: k, value: v })), { format: (v) => money(v, ccy, 0) })
        : ui.empty('Insufficient data for monthly breakdown.');

      /* trades table */
      const rows = res.trades
        .slice()
        .reverse()
        .slice(0, 60)
        .map(
          (t) => `<tr>
            <td class="xs dim nowrap">${PS.dateShort(t.closedAt)}</td>
            <td>${ui.chip(t.side.toUpperCase(), t.side === 'buy' ? 'green' : 'red')}</td>
            <td class="num">${PS.fmtPrice(t.entry)}</td>
            <td class="num">${PS.fmtPrice(t.exit)}</td>
            <td class="num">${fmt(t.lots, 2)}</td>
            <td class="num ${klass(t.pnl)}">${money(t.pnl, ccy)}</td>
            <td class="num ${klass(t.r)}">${signed(t.r, 2)}R</td>
            <td><span class="chip ${t.reason === 'target' ? 'chip-green' : t.reason === 'stop' ? 'chip-red' : ''}">${esc(t.reason)}</span></td>
          </tr>`
        );
      root.querySelector('#bt-trades').innerHTML = ui.table({
        cols: ['Closed', 'Side', { label: 'Entry', num: true }, { label: 'Exit', num: true }, { label: 'Lots', num: true }, { label: 'P&L', num: true }, { label: 'R', num: true }, 'Reason'],
        rows,
        empty: 'No trades generated. Loosen the parameters.',
        cls: 'tbl-compact',
      });
    };

    const readParams = () => {
      params.sym = root.querySelector('#bt-sym').value;
      params.tf = root.querySelector('#bt-tf').value;
      params.fast = Number(root.querySelector('#bt-fast').value) || 21;
      params.slow = Number(root.querySelector('#bt-slow').value) || 55;
      params.atrMult = Number(root.querySelector('#bt-atr').value) || 2;
      params.rr = Number(root.querySelector('#bt-rr').value) || 2;
      params.riskPct = Number(root.querySelector('#bt-risk').value) || 1;
      params.balance = Number(root.querySelector('#bt-bal').value) || 10000;
      params.lots = Number(root.querySelector('#bt-lots').value) || 0;
      params.type = root.querySelector('#bt-type').value;
    };

    const run = () => {
      readParams();
      if (params.fast >= params.slow) {
        PS.toast('Fast EMA must be shorter than slow', 'err');
        return;
      }
      current = PS.backtest(params);
      paint(current);
      PS.toast(`Backtest complete · ${current.stats.count} trades`);
    };

    root.querySelector('#bt-run').addEventListener('click', run);
    root.querySelector('[data-act="run"]').addEventListener('click', run);
    root.querySelector('[data-act="csv"]').addEventListener('click', () => {
      const csv = ui.toCsv(current.trades, [
        { label: 'closed_at', get: (t) => new Date(t.closedAt).toISOString() },
        { label: 'side', get: (t) => t.side },
        { label: 'entry', get: (t) => t.entry },
        { label: 'exit', get: (t) => t.exit },
        { label: 'lots', get: (t) => t.lots },
        { label: 'pnl', get: (t) => t.pnl },
        { label: 'r', get: (t) => t.r },
        { label: 'reason', get: (t) => t.reason },
      ]);
      ui.download('pipsage-backtest-trades.csv', csv, 'text/csv');
      PS.toast('Trade list exported');
    });

    /* chart */
    chart = new PS.Chart(root.querySelector('#bt-chart'), { height: 240, type: 'area', showVolume: false, showAxis: true });
    chart.opts.padding = { top: 10, right: 58, bottom: 18, left: 6 };
    chart.setData(result.curve.map((v, i) => ({ t: Date.now() - (result.curve.length - i) * 36e5, o: v, h: v, l: v, c: v })));

    paint(result);

    const fix = () => {
      const g = root.querySelector('#lab-grid');
      g.style.gridTemplateColumns = window.innerWidth < 1080 ? '1fr' : '262px minmax(0,1fr)';
      if (chart) chart.resize();
    };
    fix();
    window.addEventListener('resize', PS.debounce(fix, 150));

    if (location.search.includes('strategy=')) {
      PS.toast('Parameters seeded from strategy — adjust and run');
    }
  };
})();
