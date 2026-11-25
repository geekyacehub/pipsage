/* ==========================================================================
   PipSage Desk — optional, owner-authenticated MT5 demo bridge client.
   Owner token lives in tab sessionStorage only. MT5 credentials stay in the
   already-authenticated desktop terminal and never enter this browser.
   ========================================================================== */
(function () {
  'use strict';
  const PS = window.PS;
  const TOKEN_KEY = 'pipsage.bridge-owner-token';
  const API_URL = String(window.PS_API_URL || '').trim().replace(/\/+$/, '');
  const MAX_QUOTE_AGE = 10000;
  const state = { status: null, quotes: new Map(), error: '', lastUpdate: 0, running: false, timer: null, busy: false, bindPending: false };
  const originalPrice = PS.price;
  const originalDailyChange = PS.dailyChange;

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; }
    catch (_) { return ''; }
  }

  function emit() {
    document.dispatchEvent(new CustomEvent('pipsage:broker-update'));
    updateMarketNodes();
  }

  function freshQuote(sym) {
    const quote = state.quotes.get(String(sym || '').toUpperCase());
    if (!state.status || !state.status.connected || !state.status.demo || !quote || quote.stale || Date.now() - quote.receivedAt > MAX_QUOTE_AGE) return null;
    return quote;
  }

  async function request(path, options = {}) {
    if (!API_URL) throw new Error('The Render static site has no PIPSAGE_API_URL build setting yet.');
    const access = token();
    if (!access) throw new Error('Enter the owner access token in Settings to connect this browser.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(API_URL + path, {
        method: options.method || 'GET',
        headers: Object.assign({
          Authorization: 'Bearer ' + access,
          Accept: 'application/json',
        }, options.body ? { 'Content-Type': 'application/json' } : {}, options.headers || {}),
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: 'no-store',
        mode: 'cors',
        signal: controller.signal,
      });
      let payload = {};
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(payload.error || `API request failed (${response.status}).`);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  function status() {
    return Object.assign({
      apiConfigured: !!API_URL,
      authenticated: !!token(),
      connected: false,
      demo: false,
      quoteCount: 0,
      availableSymbols: [],
      missingSymbols: [],
      maxRiskPercent: 1.25,
      pendingOrder: null,
    }, state.status || {});
  }

  async function refresh() {
    if (state.busy || !API_URL || !token()) return status();
    state.busy = true;
    try {
      const snapshot = await request('/api/status');
      const quoteData = await request('/api/quotes');
      state.status = snapshot;
      state.quotes.clear();
      (quoteData.quotes || []).forEach((q) => {
        if (!q.stale && Number.isFinite(q.bid) && Number.isFinite(q.ask) && q.ask >= q.bid && q.bid > 0) {
          state.quotes.set(q.symbol, Object.assign({}, q, { receivedAt: Date.now() }));
        }
      });
      state.error = '';
      state.lastUpdate = Date.now();
      emit();
    } catch (err) {
      state.error = err && err.name === 'AbortError' ? 'API request timed out.' : String(err && err.message || 'Connection failed.');
      if (/Access denied|401/i.test(state.error)) {
        try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
        state.status = null;
        state.quotes.clear();
      } else if (state.status) {
        state.status = Object.assign({}, state.status, { connected: false, demo: false });
      }
      emit();
    } finally {
      state.busy = false;
    }
    return status();
  }

  function start() {
    if (state.running) return;
    state.running = true;
    refresh();
    state.timer = setInterval(refresh, 2500);
  }

  async function connect(ownerToken) {
    const value = String(ownerToken || '').trim();
    if (!API_URL) throw new Error('API URL is not configured in the Render static-site build.');
    if (value.length < 64) throw new Error('Owner access token must be a 64-character random token.');
    try { sessionStorage.setItem(TOKEN_KEY, value); }
    catch (_) { throw new Error('This browser does not allow session storage.'); }
    state.status = null;
    const result = await refresh();
    if (!result.authenticated || !state.status) throw new Error(state.error || 'Could not authenticate with the PipSage API.');
    return status();
  }

  function disconnect() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
    state.status = null;
    state.quotes.clear();
    state.error = '';
    emit();
    return status();
  }

  async function placeDemoOrder(order) {
    if (!status().connected || !status().demo) throw new Error('The Exness MT5 demo bridge is not connected.');
    return request('/api/orders', { method: 'POST', body: order });
  }

  async function getOrder(id) {
    if (!/^[a-f0-9]{32}$/.test(String(id || ''))) throw new Error('Invalid order reference.');
    return request('/api/orders/' + id);
  }

  async function acknowledgeUnknown(id) {
    if (!/^[a-f0-9]{32}$/.test(String(id || ''))) throw new Error('Invalid order reference.');
    return request('/api/orders/' + id + '/acknowledge', { method: 'POST', body: {} });
  }

  function quote(sym) { return freshQuote(sym); }

  function livePrice(sym, side) {
    const q = freshQuote(sym);
    if (!q) return originalPrice(sym);
    if (side === 'buy') return q.bid; // a long position exits at bid
    if (side === 'sell') return q.ask; // a short position exits at ask
    return (q.bid + q.ask) / 2;
  }
  PS.price = livePrice;
  PS.dailyChange = function (sym) {
    const q = freshQuote(sym);
    return q && Number.isFinite(q.dayChange) ? q.dayChange : originalDailyChange(sym);
  };

  PS.broker = {
    apiUrl: API_URL,
    token,
    status,
    quote,
    refresh,
    connect,
    disconnect,
    placeDemoOrder,
    getOrder,
    acknowledgeUnknown,
    isLive: (sym) => !!freshQuote(sym),
  };

  function updateMarketNodes() {
    document.querySelectorAll('[data-market-price]').forEach((el) => {
      const sym = el.getAttribute('data-market-price');
      const q = freshQuote(sym);
      const meta = PS.symMeta(sym);
      const price = q ? livePrice(sym, el.dataset.marketSide) : originalPrice(sym);
      el.textContent = PS.fmt(price, meta.dec);
      el.title = q
        ? `${q.brokerSymbol} · bid ${PS.fmt(q.bid, meta.dec)} / ask ${PS.fmt(q.ask, meta.dec)} · ${new Date(q.time).toLocaleTimeString()}`
        : 'Sample price · no fresh Exness MT5 quote for this symbol';
    });
    document.querySelectorAll('[data-market-day]').forEach((el) => {
      const sym = el.dataset.marketDay;
      const change = PS.dailyChange(sym);
      el.textContent = PS.pctStr(change);
      el.classList.remove('up', 'dn', 'flat');
      el.classList.add(PS.klass(change));
      if (!freshQuote(sym)) el.title = 'Illustrative sample day change';
      else el.title = 'Change from the current MT5 daily candle open';
    });
    document.querySelectorAll('[data-market-bidask]').forEach((el) => {
      const sym = el.dataset.marketBidask;
      const meta = PS.symMeta(sym);
      const q = freshQuote(sym);
      if (q) el.textContent = `${PS.fmt(q.bid, meta.dec)} / ${PS.fmt(q.ask, meta.dec)}`;
      else {
        const px = originalPrice(sym);
        const spread = meta.base * 0.00002;
        el.textContent = `${PS.fmt(px - spread, meta.dec)} / ${PS.fmt(px + spread, meta.dec)}`;
      }
    });
    document.querySelectorAll('[data-market-spread]').forEach((el) => {
      const sym = el.dataset.marketSpread;
      const meta = PS.symMeta(sym);
      const q = freshQuote(sym);
      el.textContent = PS.fmt(q ? q.ask - q.bid : meta.base * 0.00004, meta.dec);
      el.title = q ? `${q.brokerSymbol} quote spread` : 'Illustrative sample spread';
    });
    document.querySelectorAll('[data-live-pnl]').forEach((el) => {
      const sym = el.dataset.livePnl;
      const side = el.dataset.side;
      const lots = Number(el.dataset.lots);
      const entry = Number(el.dataset.entry);
      const value = PS.pnlFor(sym, side, lots, entry, PS.price(sym, side));
      el.textContent = PS.money(value, PS.settings().currency);
      el.classList.remove('up', 'dn', 'flat');
      el.classList.add(PS.klass(value));
    });
    document.querySelectorAll('[data-live-r]').forEach((el) => {
      const sym = el.dataset.liveR;
      const side = el.dataset.side;
      const value = PS.rFor(sym, side, Number(el.dataset.lots), Number(el.dataset.entry), PS.price(sym, side), Number(el.dataset.stop));
      el.textContent = PS.signed(value, 2) + 'R';
      el.classList.remove('up', 'dn', 'flat');
      el.classList.add(PS.klass(value));
    });
    document.querySelectorAll('[data-live-total-pnl]').forEach((el) => {
      const saved = PS.Store.get(PS.KEYS.trades, []);
      const open = (Array.isArray(saved) ? saved : []).filter((trade) => trade && trade.status === 'open');
      const total = open.reduce((sum, trade) => sum + PS.pnlFor(trade.sym, trade.side, trade.lots, trade.entry, PS.price(trade.sym, trade.side)), 0);
      el.textContent = PS.money(total, PS.settings().currency);
      el.classList.remove('up', 'dn', 'flat');
      el.classList.add(PS.klass(total));
    });
    const freshCount = Array.from(state.quotes.keys()).filter((sym) => !!freshQuote(sym)).length;
    document.querySelectorAll('[data-market-feed]').forEach((el) => {
      const connected = status().connected && freshCount > 0;
      el.textContent = connected ? `Exness MT5 demo · ${freshCount} live` : 'sample feed';
      el.classList.toggle('chip-teal', connected);
      el.classList.toggle('chip-amber', !connected);
    });
    paintSettingsPanel();
    paintOrderTicket();
  }

  function paintSettingsPanel() {
    const root = document.getElementById('broker-link-panel');
    if (!root) return;
    const stateEl = root.querySelector('#broker-link-state');
    const detailEl = root.querySelector('#broker-link-detail');
    const input = root.querySelector('#broker-owner-token');
    const disconnectButton = root.querySelector('#broker-disconnect');
    const current = status();
    if (input && current.authenticated && document.activeElement !== input) input.value = '';
    if (!current.apiConfigured) {
      stateEl.textContent = 'API not configured';
      detailEl.textContent = 'Create the Render API service and set PIPSAGE_API_URL on the static site before connecting.';
    } else if (!current.authenticated) {
      stateEl.textContent = 'Not connected';
      detailEl.textContent = 'Enter the owner access token from the API service. It is held in this tab session only.';
    } else if (current.connected && current.demo) {
      stateEl.textContent = `Connected · demo · ${current.quoteCount || 0} live symbols`;
      const missing = (current.missingSymbols || []).slice(0, 6);
      detailEl.textContent = !current.quoteCount
        ? 'MT5 demo account is verified, but there are no fresh ticks yet. Check that Market Watch symbols are visible and the broker market is publishing quotes.'
        : missing.length
          ? `Some instruments are not mapped in MT5: ${missing.join(', ')}${(current.missingSymbols || []).length > 6 ? '…' : ''}. See bridge/symbol-map.local.json.`
          : 'Exness MT5 demo verified. Market orders are demo-only and are rechecked by the desktop bridge.';
    } else {
      stateEl.textContent = 'API reachable · MT5 demo bridge offline';
      detailEl.textContent = state.error || current.connectionError || 'Start the bridge on the Windows PC with MT5 open to the Exness demo account.';
    }
    if (disconnectButton) disconnectButton.hidden = !current.authenticated;
  }

  function paintOrderTicket() {
    const root = document.getElementById('demo-order-ticket');
    if (!root) return;
    const symbol = root.querySelector('#order-symbol');
    const side = root.querySelector('#order-side');
    const volume = root.querySelector('#order-volume');
    const stop = root.querySelector('#order-stop');
    const target = root.querySelector('#order-target');
    const preview = root.querySelector('#order-preview');
    const button = root.querySelector('#demo-order-submit');
    const sym = symbol && symbol.value;
    const direction = side && side.value;
    const quote = freshQuote(sym);
    const statusNow = status();
    if (quote && preview) {
      const entry = direction === 'buy' ? quote.ask : quote.bid;
      const sl = Number(stop && stop.value);
      const lots = Number(volume && volume.value);
      const risk = sl > 0 && lots > 0 ? PS.riskCashFor(sym, lots, entry, sl) : 0;
      const equity = Number(statusNow.equity || 0);
      const pctText = statusNow.accountCurrency === 'USD' && equity > 0 ? ` (${PS.fmt((risk / equity) * 100, 2)}% of demo equity)` : '';
      preview.textContent = `MT5 ${quote.brokerSymbol} · bid ${PS.fmt(quote.bid, PS.symMeta(sym).dec)} / ask ${PS.fmt(quote.ask, PS.symMeta(sym).dec)} · desk-estimated stop risk ${PS.money(risk, 'USD')}${pctText}. The MT5 bridge recalculates risk in account currency using broker contract details before sending.`;
    } else if (preview) {
      preview.textContent = 'Waiting for an authenticated, fresh MT5 demo quote. No sample price can be used to place an order.';
    }
    if (button) button.disabled = !(statusNow.connected && statusNow.demo && quote && !statusNow.pendingOrder);
    const acknowledge = root.querySelector('#order-acknowledge');
    if (acknowledge) {
      const needsReview = statusNow.pendingOrder && statusNow.pendingOrder.status === 'unknown';
      acknowledge.hidden = !needsReview;
      if (needsReview && preview) preview.textContent = 'An order result was lost. Check MT5 order history first; never assume it failed or submit a duplicate.';
    }
  }

  function bindSettingsPanel() {
    const root = document.getElementById('broker-link-panel');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';
    const input = root.querySelector('#broker-owner-token');
    root.querySelector('#broker-connect').addEventListener('click', async () => {
      try {
        await connect(input.value);
        input.value = '';
        PS.toast('PipSage API connected for this tab');
      } catch (err) {
        PS.toast(err.message || 'Could not connect', 'err');
      }
      paintSettingsPanel();
    });
    root.querySelector('#broker-disconnect').addEventListener('click', () => {
      disconnect();
      PS.toast('Broker API disconnected from this tab');
    });
    paintSettingsPanel();
  }

  function bindOrderTicket() {
    const root = document.getElementById('demo-order-ticket');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';
    ['#order-symbol', '#order-side', '#order-volume', '#order-stop', '#order-target'].forEach((selector) => {
      const el = root.querySelector(selector);
      if (el) { el.addEventListener('input', paintOrderTicket); el.addEventListener('change', paintOrderTicket); }
    });
    root.querySelector('#demo-order-submit').addEventListener('click', async () => {
      const symbol = root.querySelector('#order-symbol').value;
      const side = root.querySelector('#order-side').value;
      const volume = Number(root.querySelector('#order-volume').value);
      const stopLoss = Number(root.querySelector('#order-stop').value);
      const targetText = root.querySelector('#order-target').value.trim();
      const takeProfit = targetText ? Number(targetText) : null;
      const q = freshQuote(symbol);
      if (!q || !status().connected || !status().demo) return PS.toast('A verified demo quote is required', 'err');
      if (!Number.isFinite(volume) || volume <= 0 || !Number.isFinite(stopLoss) || stopLoss <= 0 || (takeProfit !== null && (!Number.isFinite(takeProfit) || takeProfit <= 0))) {
        return PS.toast('Enter a valid volume and protective stop loss', 'err');
      }
      const entry = side === 'buy' ? q.ask : q.bid;
      const risk = PS.riskCashFor(symbol, volume, entry, stopLoss);
      const maxRiskPercent = Number(status().maxRiskPercent || 1.25);
      const text = `Send a DEMO ${side.toUpperCase()} market order for ${volume} lot(s) of ${symbol} on Exness MT5?\n\nEntry estimate: ${PS.fmt(entry, PS.symMeta(symbol).dec)}\nStop loss: ${PS.fmt(stopLoss, PS.symMeta(symbol).dec)}\nTake profit: ${takeProfit ? PS.fmt(takeProfit, PS.symMeta(symbol).dec) : 'not set'}\nDesk-estimated stop risk: ${PS.money(risk, 'USD')} (USD model; MT5 recalculates in account currency)\nServer risk cap: ${maxRiskPercent}% of demo equity\n\nThe API and MT5 bridge will refuse live accounts. Check the MT5 terminal after submission.`;
      if (!(await PS.confirm(text, { danger: true, confirmLabel: 'Send demo order' }))) return;
      const button = root.querySelector('#demo-order-submit');
      button.disabled = true;
      const orderState = root.querySelector('#order-result');
      orderState.textContent = 'Submitting demo order…';
      try {
        const submitted = await placeDemoOrder({ symbol, side, volume, stopLoss, takeProfit });
        orderState.textContent = `Queued (${submitted.id.slice(0, 8)}). Waiting for the MT5 demo terminal…`;
        const deadline = Date.now() + 70000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const response = await getOrder(submitted.id);
          const order = response.order;
          if (['filled', 'partial', 'rejected', 'error', 'expired', 'unknown', 'acknowledged'].includes(order.status)) {
            orderState.textContent = `Demo order ${order.status.toUpperCase()}: ${order.message || 'Check MT5 terminal history.'}${order.filledVolume ? ' · ' + PS.fmt(order.filledVolume, 3) + ' lots filled' : ''}${order.ticket ? ' · ticket ' + order.ticket : ''}${order.fillPrice ? ' · fill ' + PS.fmt(order.fillPrice, PS.symMeta(symbol).dec) : ''}`;
            if (order.status === 'filled' || order.status === 'partial') PS.toast(order.status === 'partial' ? 'MT5 demo order partially filled' : 'MT5 demo order accepted');
            else PS.toast('Order needs review: ' + order.status, 'err');
            await refresh();
            break;
          }
          orderState.textContent = `Order ${order.status} · ${order.message || 'Waiting for terminal confirmation.'}`;
        }
        if (Date.now() >= deadline) orderState.textContent = 'No final response yet. Check MT5 order history; do not submit again until you confirm whether it filled.';
      } catch (err) {
        orderState.textContent = err.message || 'Order request failed.';
        PS.toast(err.message || 'Demo order failed', 'err');
      } finally {
        paintOrderTicket();
      }
    });
    const acknowledge = root.querySelector('#order-acknowledge');
    if (acknowledge) acknowledge.addEventListener('click', async () => {
      const pending = status().pendingOrder;
      if (!pending || pending.status !== 'unknown') return;
      const ok = await PS.confirm('Have you checked MT5 order history for this order? Acknowledge only after review. This clears PipSage’s duplicate-send lock; it does not cancel or change any broker order.', { danger: true, confirmLabel: 'I checked MT5 history' });
      if (!ok) return;
      try {
        await acknowledgeUnknown(pending.id);
        await refresh();
        PS.toast('Order marked reviewed');
      } catch (err) { PS.toast(err.message || 'Could not acknowledge order', 'err'); }
    });
    paintOrderTicket();
  }

  function bindPage() {
    bindSettingsPanel();
    bindOrderTicket();
    paintSettingsPanel();
    paintOrderTicket();
  }

  document.addEventListener('ps:ready', bindPage);
  document.addEventListener('pipsage:broker-update', bindPage);
  const appRoot = document.getElementById('app');
  if (appRoot && window.MutationObserver) {
    new MutationObserver(() => {
      if (state.bindPending) return;
      state.bindPending = true;
      Promise.resolve().then(() => {
        state.bindPending = false;
        bindPage();
      });
    }).observe(appRoot, { childList: true });
  }

  const originalMount = PS.mount;
  if (typeof originalMount === 'function') {
    PS.mount = function () {
      start();
      return originalMount.apply(this, arguments);
    };
  }
})();
