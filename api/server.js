#!/usr/bin/env node
'use strict';

/*
 * PipSage Desk private MT5 relay.
 * Node built-ins only. The public static site never receives the MT5 bridge token.
 * Orders are demo-only and expire rather than being retried after an uncertain send.
 */
const http = require('node:http');
const crypto = require('node:crypto');

const SYMBOLS = new Set([
  'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'NZDUSD', 'USDCHF',
  'XAGUSD', 'BTCUSD', 'ETHUSD', 'NAS100', 'US30', 'SPX500', 'USOIL', 'GER40',
]);
const BODY_LIMIT = 64 * 1024;
const HEARTBEAT_MAX_AGE = 15_000;
const QUOTE_MAX_AGE = 10_000;
const ORDER_TTL = 30_000;
const ORDER_CLAIM_MAX_AGE = 60_000;
const ORDER_HISTORY_LIMIT = 50;

function configFrom(env = process.env) {
  const ownerToken = String(env.PIPSAGE_OWNER_TOKEN || '');
  const bridgeToken = String(env.PIPSAGE_BRIDGE_TOKEN || '');
  const appOrigin = String(env.PIPSAGE_APP_ORIGIN || '');
  const maxRiskPercent = Number(env.PIPSAGE_MAX_RISK_PERCENT || 1.25);
  if (ownerToken.length < 64 || bridgeToken.length < 64) {
    throw new Error('Set PIPSAGE_OWNER_TOKEN and PIPSAGE_BRIDGE_TOKEN to separate 64-character random tokens.');
  }
  if (ownerToken === bridgeToken) throw new Error('Owner and bridge tokens must be different.');
  let parsedOrigin;
  try { parsedOrigin = new URL(appOrigin); } catch (_) { throw new Error('PIPSAGE_APP_ORIGIN must be the HTTPS origin of the public static site.'); }
  if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== appOrigin.replace(/\/$/, '')) {
    throw new Error('PIPSAGE_APP_ORIGIN must be an HTTPS origin with no path or trailing slash.');
  }
  if (!Number.isFinite(maxRiskPercent) || maxRiskPercent <= 0 || maxRiskPercent > 5) {
    throw new Error('PIPSAGE_MAX_RISK_PERCENT must be greater than 0 and no more than 5.');
  }
  return { ownerToken, bridgeToken, appOrigin: parsedOrigin.origin, maxRiskPercent };
}

function tokenMatches(header, expected) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function createApp(config) {
  const state = {
    bridge: { connected: false, demo: false, lastHeartbeat: 0, accountCurrency: '', equity: 0, symbols: {}, error: '' },
    quotes: new Map(),
    orders: new Map(),
    queue: [],
    orderCooldownUntil: 0,
  };

  const send = (res, status, body, headers = {}) => {
    const data = status === 204 ? '' : JSON.stringify(body);
    res.writeHead(status, Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(data),
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    }, headers));
    res.end(data || undefined);
  };

  const corsHeaders = (origin) => origin === config.appOrigin ? {
    'Access-Control-Allow-Origin': config.appOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin',
  } : {};

  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });

  const ownerAuth = (req) => tokenMatches(req.headers.authorization, config.ownerToken);
  const bridgeAuth = (req) => tokenMatches(req.headers.authorization, config.bridgeToken);
  const bridgeFresh = (now = Date.now()) => state.bridge.connected && state.bridge.demo && now - state.bridge.lastHeartbeat <= HEARTBEAT_MAX_AGE;
  const quoteFresh = (symbol, now = Date.now()) => {
    const q = state.quotes.get(symbol);
    return q && now - q.receivedAt <= QUOTE_MAX_AGE ? q : null;
  };

  function statusSnapshot(now = Date.now()) {
    const connected = bridgeFresh(now);
    const quotes = Array.from(state.quotes.values()).filter((q) => now - q.receivedAt <= QUOTE_MAX_AGE);
    const mapped = Object.keys(state.bridge.symbols || {});
    return {
      service: 'pipsage-mt5-relay',
      mode: 'demo-only',
      connected,
      demo: connected,
      lastHeartbeat: state.bridge.lastHeartbeat || null,
      accountCurrency: connected ? state.bridge.accountCurrency : '',
      equity: connected ? state.bridge.equity : 0,
      quoteCount: quotes.length,
      availableSymbols: quotes.map((q) => q.symbol).sort(),
      mappedSymbols: mapped.sort(),
      missingSymbols: Array.from(SYMBOLS).filter((s) => !mapped.includes(s)).sort(),
      maxRiskPercent: config.maxRiskPercent,
      connectionError: state.bridge.error || '',
      pendingOrder: Array.from(state.orders.values()).find((o) => ['queued', 'claimed', 'unknown'].includes(o.status)) || null,
    };
  }

  function expireOrders(now = Date.now()) {
    for (const [id, order] of state.orders) {
      if (order.status === 'queued' && now > order.expiresAt) order.status = 'expired';
      if (order.status === 'claimed' && now - order.claimedAt > ORDER_CLAIM_MAX_AGE) {
        /* Never retry an order after a lost response: it might already have filled. */
        order.status = 'unknown';
        order.message = 'No terminal result arrived; check MT5 order history before acknowledging.';
      }
      if (['filled', 'partial', 'rejected', 'error', 'expired', 'acknowledged'].includes(order.status) && now - order.createdAt > 24 * 60 * 60 * 1000) {
        state.orders.delete(id);
      }
    }
    while (state.orders.size > ORDER_HISTORY_LIMIT) {
      const first = state.orders.keys().next().value;
      if (['queued', 'claimed', 'unknown'].includes(state.orders.get(first).status)) break;
      state.orders.delete(first);
    }
  }

  const appHandler = async (req, res) => {
    const origin = req.headers.origin || '';
    const headers = corsHeaders(origin);
    if (origin && origin !== config.appOrigin) return send(res, 403, { error: 'Origin not allowed.' });
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
    if (req.method === 'OPTIONS') return send(res, 204, {}, headers);

    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, service: 'pipsage-mt5-relay', mode: 'demo-only' });
    }

    if (url.pathname.startsWith('/api/')) {
      if (!ownerAuth(req)) return send(res, 401, { error: 'Access denied.' }, headers);
      if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, statusSnapshot(), headers);
      if (req.method === 'GET' && url.pathname === '/api/quotes') {
        const now = Date.now();
        const quotes = Array.from(state.quotes.values()).map((q) => Object.assign({}, q, {
          stale: now - q.receivedAt > QUOTE_MAX_AGE,
        })).sort((a, b) => a.symbol.localeCompare(b.symbol));
        return send(res, 200, { mode: 'demo-only', quotes }, headers);
      }
      if (req.method === 'POST' && url.pathname === '/api/orders') {
        expireOrders();
        if (!bridgeFresh()) return send(res, 503, { error: 'Exness MT5 demo bridge is offline or not verified as a demo account.' }, headers);
        const locked = Array.from(state.orders.values()).find((o) => ['queued', 'claimed', 'unknown'].includes(o.status));
        if (locked) return send(res, 409, { error: 'An order is pending or needs review. Check MT5 before sending another.', orderId: locked.id, status: locked.status }, headers);
        if (Date.now() < state.orderCooldownUntil) return send(res, 429, { error: 'Please wait before submitting another order.' }, headers);
        const body = await readBody(req);
        const symbol = String(body.symbol || '').toUpperCase();
        const side = String(body.side || '').toLowerCase();
        const volume = Number(body.volume);
        const stopLoss = Number(body.stopLoss);
        const takeProfit = body.takeProfit == null || body.takeProfit === '' ? null : Number(body.takeProfit);
        if (!SYMBOLS.has(symbol) || !state.bridge.symbols[symbol]) return send(res, 422, { error: 'That symbol is not mapped in the connected MT5 terminal.' }, headers);
        if (!['buy', 'sell'].includes(side)) return send(res, 422, { error: 'Side must be buy or sell.' }, headers);
        if (!isNumber(volume) || volume <= 0 || volume > 100) return send(res, 422, { error: 'Volume is outside the allowed range.' }, headers);
        if (!isNumber(stopLoss) || stopLoss <= 0 || (takeProfit !== null && (!isNumber(takeProfit) || takeProfit <= 0))) {
          return send(res, 422, { error: 'A valid stop loss is required; take profit must be positive when supplied.' }, headers);
        }
        const quote = quoteFresh(symbol);
        if (!quote) return send(res, 503, { error: 'A fresh quote is not available for that symbol.' }, headers);
        if (side === 'buy' && (stopLoss >= quote.ask || (takeProfit !== null && takeProfit <= quote.ask))) {
          return send(res, 422, { error: 'For a buy, stop loss must be below ask and take profit above ask.' }, headers);
        }
        if (side === 'sell' && (stopLoss <= quote.bid || (takeProfit !== null && takeProfit >= quote.bid))) {
          return send(res, 422, { error: 'For a sell, stop loss must be above bid and take profit below bid.' }, headers);
        }
        const now = Date.now();
        const order = {
          id: crypto.randomBytes(16).toString('hex'),
          symbol, brokerSymbol: state.bridge.symbols[symbol], side, volume,
          stopLoss, takeProfit, status: 'queued', createdAt: now, expiresAt: now + ORDER_TTL,
          maxRiskPercent: config.maxRiskPercent, message: 'Waiting for MT5 demo terminal.',
        };
        state.orders.set(order.id, order);
        state.queue.push(order.id);
        state.orderCooldownUntil = now + 1500;
        return send(res, 202, { id: order.id, status: order.status, expiresAt: order.expiresAt, mode: 'demo-only' }, headers);
      }
      if (req.method === 'GET' && /^\/api\/orders\/[a-f0-9]{32}$/.test(url.pathname)) {
        expireOrders();
        const id = url.pathname.split('/').pop();
        const order = state.orders.get(id);
        if (!order) return send(res, 404, { error: 'Order was not found. It may have expired after a service restart.' }, headers);
        return send(res, 200, { order: publicOrder(order) }, headers);
      }
      if (req.method === 'POST' && /^\/api\/orders\/[a-f0-9]{32}\/acknowledge$/.test(url.pathname)) {
        expireOrders();
        const id = url.pathname.split('/')[3];
        const order = state.orders.get(id);
        if (!order || order.status !== 'unknown') return send(res, 409, { error: 'Only an order with unknown terminal status can be acknowledged.' }, headers);
        order.status = 'acknowledged';
        order.message = 'Owner acknowledged after checking the MT5 terminal.';
        return send(res, 200, { order: publicOrder(order) }, headers);
      }
      return send(res, 404, { error: 'Route not found.' }, headers);
    }

    if (url.pathname.startsWith('/bridge/')) {
      if (!bridgeAuth(req)) return send(res, 401, { error: 'Bridge authentication failed.' });
      if (req.method === 'POST' && url.pathname === '/bridge/heartbeat') {
        const body = await readBody(req);
        const now = Date.now();
        const demo = body.demo === true;
        const connected = body.connected === true && demo;
        const rawSymbols = body.symbols && typeof body.symbols === 'object' ? body.symbols : {};
        const symbols = {};
        if (connected) {
          for (const symbol of SYMBOLS) {
            const brokerSymbol = rawSymbols[symbol];
            if (typeof brokerSymbol === 'string' && brokerSymbol.length > 0 && brokerSymbol.length <= 40) symbols[symbol] = brokerSymbol;
          }
        }
        const previousSymbols = JSON.stringify(state.bridge.symbols || {});
        state.bridge = {
          connected, demo, lastHeartbeat: now,
          accountCurrency: connected && typeof body.accountCurrency === 'string' ? body.accountCurrency.slice(0, 8) : '',
          equity: connected && isNumber(body.equity) && body.equity > 0 ? body.equity : 0,
          symbols,
          error: connected ? '' : String(body.error || (body.demo === false ? 'Live accounts are blocked; switch MT5 to a demo account.' : 'MT5 demo terminal is not connected.')).slice(0, 180),
        };
        if (!connected || JSON.stringify(symbols) !== previousSymbols) state.quotes.clear();
        return send(res, 200, { ok: true, acceptedDemoOnly: connected, mappedSymbolCount: Object.keys(symbols).length });
      }
      if (req.method === 'POST' && url.pathname === '/bridge/quotes') {
        if (!bridgeFresh()) return send(res, 409, { error: 'Send a demo heartbeat before quotes.' });
        const body = await readBody(req);
        const rows = Array.isArray(body.quotes) ? body.quotes : [];
        if (rows.length > SYMBOLS.size) return send(res, 422, { error: 'Too many quote rows.' });
        const now = Date.now();
        let accepted = 0;
        for (const row of rows) {
          if (!row || !SYMBOLS.has(row.symbol) || !state.bridge.symbols[row.symbol]) continue;
          if (!isNumber(row.bid) || !isNumber(row.ask) || row.bid <= 0 || row.ask < row.bid) continue;
          if (!Number.isSafeInteger(row.time) || row.time < now - 120_000 || row.time > now + 10_000) continue;
          const dayChange = isNumber(row.dayChange) && row.dayChange >= -100 && row.dayChange <= 100 ? row.dayChange : null;
          state.quotes.set(row.symbol, {
            symbol: row.symbol, brokerSymbol: state.bridge.symbols[row.symbol], bid: row.bid, ask: row.ask,
            dayChange, time: row.time, receivedAt: now,
          });
          accepted++;
        }
        return send(res, 200, { ok: true, accepted });
      }
      if (req.method === 'GET' && url.pathname === '/bridge/orders/claim') {
        expireOrders();
        if (!bridgeFresh()) return send(res, 409, { error: 'Demo terminal is not connected.' });
        while (state.queue.length) {
          const id = state.queue.shift();
          const order = state.orders.get(id);
          if (!order || order.status !== 'queued') continue;
          if (Date.now() > order.expiresAt) { order.status = 'expired'; continue; }
          order.status = 'claimed';
          order.claimedAt = Date.now();
          order.message = 'Claimed by MT5 demo bridge; waiting for broker result.';
          return send(res, 200, { order: {
            id: order.id, symbol: order.symbol, brokerSymbol: order.brokerSymbol, side: order.side,
            volume: order.volume, stopLoss: order.stopLoss, takeProfit: order.takeProfit,
            maxRiskPercent: order.maxRiskPercent,
          } });
        }
        return send(res, 200, { order: null });
      }
      if (req.method === 'POST' && url.pathname === '/bridge/orders/result') {
        const body = await readBody(req);
        const order = state.orders.get(String(body.id || ''));
        if (!order || order.status !== 'claimed') return send(res, 404, { error: 'Claimed order not found.' });
        const resultStatus = String(body.status || 'error');
        if (!['filled', 'partial', 'rejected', 'error', 'unknown'].includes(resultStatus)) return send(res, 422, { error: 'Invalid order result.' });
        order.status = resultStatus;
        order.message = String(body.message || '').slice(0, 180);
        if (isNumber(body.ticket) && body.ticket > 0) order.ticket = Math.floor(body.ticket);
        if (isNumber(body.fillPrice) && body.fillPrice > 0) order.fillPrice = body.fillPrice;
        if (isNumber(body.filledVolume) && body.filledVolume > 0) order.filledVolume = body.filledVolume;
        order.finishedAt = Date.now();
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Bridge route not found.' });
    }

    return send(res, 404, { error: 'Route not found.' });
  };

  function publicOrder(order) {
    const { id, symbol, side, volume, stopLoss, takeProfit, status, createdAt, expiresAt, message, ticket, fillPrice, filledVolume, finishedAt, maxRiskPercent } = order;
    return { id, symbol, side, volume, stopLoss, takeProfit, status, createdAt, expiresAt, message, ticket, fillPrice, filledVolume, finishedAt, maxRiskPercent, mode: 'demo-only' };
  }

  const server = http.createServer((req, res) => {
    Promise.resolve(appHandler(req, res)).catch((err) => {
      if (res.headersSent || res.destroyed) return;
      const status = Number(err && err.status) || 500;
      send(res, status, { error: status >= 500 ? 'Request failed.' : err.message });
    });
  });

  return { server, state };
}

if (require.main === module) {
  let config;
  try { config = configFrom(); }
  catch (err) { console.error('[PipSage API]', err.message); process.exit(1); }
  const { server } = createApp(config);
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => console.log(`[PipSage API] listening on 0.0.0.0:${port} (demo-only)`));
}

module.exports = { createApp, configFrom, SYMBOLS };
