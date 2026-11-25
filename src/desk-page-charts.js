/* ==========================================================================
   Page: Charts
   Canvas workspace: instrument list, timeframe, overlays, pane indicators,
   drawing tools (levels), live readout, position sizing calculator.
   ========================================================================== */
(function () {
  'use strict';
  const PS = window.PS;
  const { ui, icon, esc, fmt, money, klass, Store, KEYS, settings } = PS;
  PS.pages = PS.pages || {};

  const TIMEFRAMES = [
    { id: '5m', label: '5m', bias: 0.15, count: 120 },
    { id: '15m', label: '15m', bias: 0.35, count: 120 },
    { id: '1H', label: '1H', bias: 1, count: 110 },
    { id: '4H', label: '4H', bias: 2.4, count: 100 },
    { id: '1D', label: '1D', bias: 6, count: 90 },
  ];

  const state = {
    sym: 'XAUUSD',
    tf: '1H',
    type: 'candles',
    pane: 'volume',
    overlays: [
      { type: 'ema', period: 21, colour: '#f5a524' },
      { type: 'ema', period: 50, colour: '#5b9dff' },
    ],
    levels: [
      { price: 3572, colour: '#f2555a', label: 'Resistance', dash: [4, 4] },
      { price: 3498, colour: '#2dd4bf', label: 'Support', dash: [4, 4] },
    ],
  };

  PS.pages.charts = function (root) {
    const s = settings();
    const ccy = s.currency;
    const watch = Store.get(KEYS.watchlist, ['XAUUSD']);
    if (!watch.includes(state.sym)) state.sym = watch[0] || 'XAUUSD';

    const meta = PS.symMeta(state.sym);

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Charts <span class="chip chip-amber" style="margin-left:2px">sample feed</span></h1>
          <div class="sub">Analysis workspace · crosshair, zoom and pan enabled</div>
        </div>
        <div class="actions">
          <div class="seg" id="tf-seg">
            ${TIMEFRAMES.map((t) => `<button data-tf="${t.id}" class="${t.id === state.tf ? 'active' : ''}">${t.label}</button>`).join('')}
          </div>
          <div class="seg" id="type-seg">
            ${[['candles', 'Candles'], ['line', 'Line'], ['area', 'Area'], ['bars', 'Bars']]
              .map(([k, l]) => `<button data-type="${k}" class="${k === state.type ? 'active' : ''}">${l}</button>`)
              .join('')}
          </div>
        </div>
      </div>
      <div class="page-body">
        <div class="grid" style="grid-template-columns:200px minmax(0,1fr) 236px;align-items:start" id="chart-grid">
          <!-- left: instruments -->
          <div style="display:grid;gap:10px" id="col-market">
            ${ui.panel({
              title: 'Markets',
              flush: true,
              body: `<div style="max-height:330px;overflow:auto" id="sym-list">
                ${watch
                  .map((sym) => {
                    const m = PS.symMeta(sym);
                    const chg = PS.dailyChange(sym);
                    return `<button class="row-between" data-sym="${sym}" style="width:100%;padding:8px 11px;border-bottom:1px solid var(--line);text-align:left;background:${sym === state.sym ? 'var(--panel-2)' : 'transparent'}">
                      <span>
                        <span class="sm" style="font-weight:${sym === state.sym ? 600 : 500}">${esc(sym)}</span>
                        <span class="xs dim" style="display:block">${esc(m.cls)}</span>
                      </span>
                      <span class="right">
                        <span class="mono xs" style="display:block">${fmt(PS.price(sym), m.dec)}</span>
                        <span class="mono xs ${klass(chg)}">${PS.pctStr(chg)}</span>
                      </span>
                    </button>`;
                  })
                  .join('')}
              </div>`,
            })}
            ${ui.panel({
              title: 'Overlays',
              body: `<div class="col" style="gap:6px">
                ${[
                  ['ema21', 'EMA 21'],
                  ['ema50', 'EMA 50'],
                  ['ema200', 'EMA 200'],
                  ['bb', 'Bollinger 20,2'],
                  ['vwap', 'VWAP'],
                ]
                  .map(
                    ([id, label]) => `<label class="check"><input type="checkbox" data-ov="${id}" ${state.overlays.some((o) => (id.startsWith('ema') ? o.type === 'ema' && o.period === Number(id.slice(3)) : o.type === id)) ? 'checked' : ''}><span class="xs">${label}</span></label>`
                  )
                  .join('')}
              </div>`,
            })}
          </div>

          <!-- centre: chart -->
          <div style="display:grid;gap:10px;min-width:0" id="col-main">
            <section class="panel">
              <div class="panel-head" style="flex-wrap:wrap">
                <div class="row" style="gap:10px">
                  <h2 style="font-size:14px">${esc(state.sym)}</h2>
                  <span class="chip chip-plain">${esc(meta.cls)}</span>
                  <span class="mono sm" id="last-px">${fmt(PS.price(state.sym), meta.dec)}</span>
                  <span class="mono xs ${klass(PS.dailyChange(state.sym))}" id="last-chg">${PS.pctStr(PS.dailyChange(state.sym))}</span>
                </div>
                <div class="right">
                  <span class="label" style="margin-right:2px">Pane</span>
                  <div class="seg" id="pane-seg">
                    ${[['none', 'None'], ['volume', 'Vol'], ['rsi', 'RSI'], ['macd', 'MACD']]
                      .map(([k, l]) => `<button data-pane="${k}" class="${k === state.pane ? 'active' : ''}">${l}</button>`)
                      .join('')}
                  </div>
                </div>
              </div>
              <div class="panel-body" style="padding:8px 8px 4px">
                <div class="chart-box"><canvas id="main-chart"></canvas></div>
                <div class="row-between" style="padding:6px 4px 2px;flex-wrap:wrap;gap:8px">
                  <div class="legend" id="ohlc-readout">
                    <span>Hover the chart for OHLC</span>
                  </div>
                  <div class="legend">
                    ${state.overlays
                      .map(
                        (o) => `<span><i style="background:${o.colour}"></i>${o.type.toUpperCase()}${o.period ? ' ' + o.period : ''}</span>`
                      )
                      .join('')}
                  </div>
                </div>
              </div>
              <div class="panel-foot row-between">
                <span class="xs">Scroll to zoom · drag to pan · sample candles</span>
                <button class="btn btn-sm btn-ghost" id="reset-view">${icon('refresh')}Reset</button>
              </div>
            </section>

            ${ui.panel({
              title: 'Structure levels',
              right: `<button class="btn btn-sm" id="add-level">${icon('plus')}Add level</button>`,
              flush: true,
              body: `<div id="level-list"></div>`,
            })}
          </div>

          <!-- right: readout + sizing -->
          <div style="display:grid;gap:10px" id="col-side">
            ${ui.panel({
              title: 'Market',
              body: `<div id="market-info"></div>`,
            })}
            ${ui.panel({
              title: 'Position size',
              sub: 'From your risk settings',
              body: `<div id="sizer" class="col" style="gap:9px"></div>`,
            })}
            ${ui.panel({
              title: 'Session',
              flush: true,
              body: `<div style="padding:10px" id="session-block"></div>`,
            })}
          </div>
        </div>
      </div>`;

    /* ---------------- chart ---------------- */
    const canvas = root.querySelector('#main-chart');
    const chart = new PS.Chart(canvas, {
      height: 420,
      type: state.type,
      pane: state.pane === 'none' ? null : state.pane,
      overlays: state.overlays,
      levels: state.levels,
      onHover: (bar) => {
        const out = root.querySelector('#ohlc-readout');
        if (!bar) {
          out.innerHTML = '<span>Hover the chart for OHLC</span>';
          return;
        }
        const up = bar.c >= bar.o;
        out.innerHTML = `
          <span>O <b class="mono ${up ? 'up' : 'dn'}">${fmt(bar.o, meta.dec)}</b></span>
          <span>H <b class="mono ${up ? 'up' : 'dn'}">${fmt(bar.h, meta.dec)}</b></span>
          <span>L <b class="mono ${up ? 'up' : 'dn'}">${fmt(bar.l, meta.dec)}</b></span>
          <span>C <b class="mono ${up ? 'up' : 'dn'}">${fmt(bar.c, meta.dec)}</b></span>
          <span class="dim">${new Date(bar.t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>`;
      },
    });

    const tfMeta = TIMEFRAMES.find((t) => t.id === state.tf) || TIMEFRAMES[2];
    let candles = PS.candles(state.sym, tfMeta.count, tfMeta.bias);
    chart.setData(candles, { resetView: true });

    const bindChart = () => {
      const out = root.querySelector('#ohlc-readout');
      out.innerHTML = '<span>Hover the chart for OHLC</span>';
      chart.draw();
    };

    /* timeframe */
    root.querySelectorAll('[data-tf]').forEach((b) =>
      b.addEventListener('click', () => {
        state.tf = b.dataset.tf;
        root.querySelectorAll('[data-tf]').forEach((x) => x.classList.toggle('active', x === b));
        const tm = TIMEFRAMES.find((t) => t.id === state.tf);
        candles = PS.candles(state.sym, tm.count, tm.bias);
        chart.opts.visible = tm.count;
        chart.setData(candles);
        bindChart();
      })
    );

    /* chart type */
    root.querySelectorAll('[data-type]').forEach((b) =>
      b.addEventListener('click', () => {
        state.type = b.dataset.type;
        root.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('active', x === b));
        chart.opts.type = state.type;
        chart.draw();
      })
    );

    /* pane */
    root.querySelectorAll('[data-pane]').forEach((b) =>
      b.addEventListener('click', () => {
        state.pane = b.dataset.pane;
        root.querySelectorAll('[data-pane]').forEach((x) => x.classList.toggle('active', x === b));
        chart.setPane(state.pane === 'none' ? null : state.pane);
      })
    );

    /* overlays */
    root.querySelectorAll('[data-ov]').forEach((cb) =>
      cb.addEventListener('change', () => {
        const id = cb.dataset.ov;
        const exists = state.overlays.findIndex((o) =>
          id.startsWith('ema') ? o.type === 'ema' && o.period === Number(id.slice(3)) : o.type === id
        );
        if (cb.checked && exists === -1) {
          if (id === 'ema21') state.overlays.push({ type: 'ema', period: 21, colour: '#f5a524' });
          if (id === 'ema50') state.overlays.push({ type: 'ema', period: 50, colour: '#5b9dff' });
          if (id === 'ema200') state.overlays.push({ type: 'ema', period: 200, colour: '#9b7bff' });
          if (id === 'bb') state.overlays.push({ type: 'bb', period: 20, colour: '#5b9dff' });
          if (id === 'vwap') state.overlays.push({ type: 'vwap', colour: '#2dd4bf' });
        } else if (!cb.checked && exists > -1) {
          state.overlays.splice(exists, 1);
        }
        chart.setOverlays(state.overlays);
      })
    );

    root.querySelector('#reset-view').addEventListener('click', () => {
      chart.view.count = candles.length;
      chart.view.start = 0;
      chart.draw();
      PS.toast('View reset');
    });

    /* ---------------- instruments ---------------- */
    root.querySelectorAll('[data-sym]').forEach((b) =>
      b.addEventListener('click', () => {
        state.sym = b.dataset.sym;
        PS.pages.charts(root);
      })
    );

    /* ---------------- market info ---------------- */
    const info = root.querySelector('#market-info');
    const rsi = PS.Ind.rsi(candles.map((c) => c.c), 14).filter((v) => v != null).pop();
    const atr = PS.Ind.atr(candles, 14).filter((v) => v != null).pop();
    const adx = PS.Ind.adx(candles, 14);
    const adxV = adx.adx.filter((v) => v != null).pop();
    const bb = PS.Ind.bollinger(candles.map((c) => c.c), 20, 2);
    const lastC = candles[candles.length - 1].c;
    const bbU = bb.upper.filter((v) => v != null).pop();
    const bbL = bb.lower.filter((v) => v != null).pop();
    const spreadPts = Math.round(meta.base * (meta.vol / 100) * 0.35 * (meta.dec > 3 ? 10000 : 1));

    info.innerHTML = ui.statRows([
      { k: 'Bid / Ask', v: `${fmt(lastC - meta.base * 0.00002, meta.dec)} / ${fmt(lastC + meta.base * 0.00002, meta.dec)}` },
      { k: 'Spread', v: spreadPts + ' pts' },
      { k: 'ATR (14)', v: fmt(atr, meta.dec) },
      { k: 'RSI (14)', v: fmt(rsi, 1), cls: rsi > 70 ? 'dn' : rsi < 30 ? 'up' : '' },
      { k: 'ADX (14)', v: fmt(adxV, 1) },
      { k: 'Bollinger width', v: fmt(((bbU - bbL) / lastC) * 100, 2) + '%' },
      { k: 'Day change', v: PS.pctStr(PS.dailyChange(state.sym)), cls: klass(PS.dailyChange(state.sym)) },
      { k: 'Contract', v: meta.unit || '—' },
    ]);

    /* ---------------- sizer ---------------- */
    const sizer = root.querySelector('#sizer');
    const bal = ui.accountSummary().balance;
    sizer.innerHTML = `
      ${ui.field({ label: 'Balance', id: 'sz-bal', type: 'number', value: bal })}
      <div class="grid g2" style="gap:8px">
        ${ui.field({ label: 'Risk %', id: 'sz-risk', type: 'number', value: s.riskPerTrade, attrs: 'step="0.05"' })}
        ${ui.field({ label: 'Entry', id: 'sz-entry', type: 'number', value: fmt(lastC, meta.dec), attrs: `step="${Math.pow(10, -meta.dec)}"` })}
      </div>
      ${ui.field({ label: 'Stop', id: 'sz-stop', type: 'number', value: fmt(lastC - (atr || lastC * 0.004) * 2, meta.dec), attrs: `step="${Math.pow(10, -meta.dec)}"` })}
      <div id="sz-out" class="note-card" style="background:var(--panel-2)"></div>
      <button class="btn btn-sm btn-block" id="sz-apply">Use in a new trade</button>`;

    const calcSize = () => {
      const balance = Number(root.querySelector('#sz-bal').value) || 0;
      const riskPct = Number(root.querySelector('#sz-risk').value) || 0;
      const entry = Number(root.querySelector('#sz-entry').value) || 0;
      const stop = Number(root.querySelector('#sz-stop').value) || 0;
      const r = ui.sizePosition({ balance, riskPct, entry, stop, sym: state.sym });
      const out = root.querySelector('#sz-out');
      const rr1 = entry + (entry - stop) * 2;
      out.innerHTML = `
        <div class="row-between"><span class="xs muted">Risk</span><span class="mono xs">${money(r.riskCash, ccy)}</span></div>
        <div class="row-between"><span class="xs muted">Stop distance</span><span class="mono xs">${fmt(r.stopDist, meta.dec)}</span></div>
        <div class="row-between"><span class="xs muted">Size</span><span class="mono xs" style="color:var(--amber);font-weight:600">${fmt(r.lots, 2)} lots</span></div>
        <div class="row-between"><span class="xs muted">2R target</span><span class="mono xs">${fmt(rr1, meta.dec)}</span></div>`;
      out.dataset.lots = r.lots;
    };
    ['sz-bal', 'sz-risk', 'sz-entry', 'sz-stop'].forEach((id) => {
      const el = root.querySelector('#' + id);
      if (el) el.addEventListener('input', calcSize);
    });
    calcSize();
    root.querySelector('#sz-apply').addEventListener('click', () => {
      sessionStorage.setItem(
        'ps.newTrade',
        JSON.stringify({
          sym: state.sym,
          lots: Number(root.querySelector('#sz-out').dataset.lots) || 0,
          entry: Number(root.querySelector('#sz-entry').value),
          sl: Number(root.querySelector('#sz-stop').value),
        })
      );
      location.href = 'journal.html#new';
    });

    /* ---------------- levels ---------------- */
    const renderLevels = () => {
      const host = root.querySelector('#level-list');
      host.innerHTML = state.levels
        .map(
          (l, i) => `<div class="row-between" style="padding:8px 11px;border-bottom:1px solid var(--line)">
            <div class="row" style="gap:7px">
              <span style="width:8px;height:8px;border-radius:2px;background:${l.colour};display:block"></span>
              <span class="mono xs">${fmt(l.price, meta.dec)}</span>
              <span class="xs dim">${esc(l.label || '')}</span>
            </div>
            <div class="row" style="gap:4px">
              <button class="icon-btn" data-flip="${i}" title="Move to current price">${icon('target')}</button>
              <button class="icon-btn" data-dellvl="${i}" title="Remove">${icon('trash')}</button>
            </div>
          </div>`
        )
        .join('') || `<div class="empty">No levels yet.</div>`;
      host.querySelectorAll('[data-dellvl]').forEach((b) =>
        b.addEventListener('click', () => {
          state.levels.splice(Number(b.dataset.dellvl), 1);
          chart.setLevels(state.levels);
          renderLevels();
        })
      );
      host.querySelectorAll('[data-flip]').forEach((b) =>
        b.addEventListener('click', () => {
          state.levels[Number(b.dataset.flip)].price = lastC;
          chart.setLevels(state.levels);
          renderLevels();
        })
      );
    };
    renderLevels();

    root.querySelector('#add-level').addEventListener('click', () => {
      const m = PS.modal({
        title: 'Add a level',
        body: `
          <div class="grid g2" style="gap:10px">
            ${ui.field({ label: 'Price', id: 'lvl-price', type: 'number', value: fmt(lastC, meta.dec) })}
            ${ui.field({ label: 'Label', id: 'lvl-label', value: 'Level' })}
          </div>
          ${ui.field({ label: 'Colour', id: 'lvl-colour', options: [
            { value: '#f2555a', label: 'Red — resistance' },
            { value: '#2dd4bf', label: 'Teal — support' },
            { value: '#f5a524', label: 'Amber — pivot' },
            { value: '#5b9dff', label: 'Blue — target' },
          ] })}
          ${ui.field({ label: 'Style', id: 'lvl-dash', options: [{ value: 'dash', label: 'Dashed' }, { value: 'solid', label: 'Solid' }] })}`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="lvl-save">Add level</button>`,
        onOpen(el, close) {
          el.querySelector('#lvl-save').addEventListener('click', () => {
            state.levels.push({
              price: Number(el.querySelector('#lvl-price').value) || lastC,
              label: el.querySelector('#lvl-label').value || 'Level',
              colour: el.querySelector('#lvl-colour').value,
              dash: el.querySelector('#lvl-dash').value === 'dash' ? [4, 4] : [],
            });
            chart.setLevels(state.levels);
            renderLevels();
            close();
            PS.toast('Level added');
          });
        },
      });
    });

    /* ---------------- sessions ---------------- */
    const st = PS.sessionState();
    root.querySelector('#session-block').innerHTML = st.sessions
      .map(
        (x) => `<div class="row-between" style="padding:5px 0">
          <span class="row" style="gap:6px"><i class="legend-dot" style="background:${x.colour}"></i><span class="xs">${x.name}</span></span>
          <span class="xs ${x.active ? 'up' : 'dim'}">${x.active ? 'open' : 'closed'}</span>
        </div>`
      )
      .join('') + `<div class="xs dim" style="margin-top:7px">IST ${st.ist.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>`;

    /* responsive: collapse the 3-column grid on small screens */
    const grid = root.querySelector('#chart-grid');
    const marketCol = root.querySelector('#col-market');
    const mainCol = root.querySelector('#col-main');
    const sideCol = root.querySelector('#col-side');
    const fix = () => {
      const narrow = window.innerWidth < 1180;
      const phone = window.innerWidth < 720;
      grid.style.gridTemplateColumns = narrow ? '1fr' : '200px minmax(0,1fr) 236px';
      /* on a phone the chart matters more than the symbol list, so lift it above */
      [marketCol, mainCol, sideCol].forEach((el) => el && (el.style.order = ''));
      if (phone) mainCol.style.order = '-1';
      chart.resize();
    };
    fix();
    window.addEventListener('resize', PS.debounce(fix, 150));
  };
})();
