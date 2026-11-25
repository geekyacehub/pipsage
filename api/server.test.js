'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, configFrom } = require('./server');

const config = {
  ownerToken: 'o'.repeat(64),
  bridgeToken: 'b'.repeat(64),
  appOrigin: 'https://pipsage-desk.onrender.com',
  maxRiskPercent: 1.25,
};
const owner = { Authorization: `Bearer ${config.ownerToken}`, Origin: config.appOrigin };
const bridge = { Authorization: `Bearer ${config.bridgeToken}` };

test('startup configuration requires separate strong tokens and an HTTPS app origin', () => {
  assert.throws(() => configFrom({ PIPSAGE_OWNER_TOKEN: 'short', PIPSAGE_BRIDGE_TOKEN: 'x'.repeat(64), PIPSAGE_APP_ORIGIN: config.appOrigin }), /64-character/);
  assert.throws(() => configFrom({ PIPSAGE_OWNER_TOKEN: 'o'.repeat(64), PIPSAGE_BRIDGE_TOKEN: 'o'.repeat(64), PIPSAGE_APP_ORIGIN: config.appOrigin }), /different/);
  assert.throws(() => configFrom({ PIPSAGE_OWNER_TOKEN: 'o'.repeat(64), PIPSAGE_BRIDGE_TOKEN: 'b'.repeat(64), PIPSAGE_APP_ORIGIN: 'http://example.com' }), /HTTPS/);
  const loaded = configFrom({ PIPSAGE_OWNER_TOKEN: 'o'.repeat(64), PIPSAGE_BRIDGE_TOKEN: 'b'.repeat(64), PIPSAGE_APP_ORIGIN: config.appOrigin });
  assert.equal(loaded.appOrigin, config.appOrigin);
  assert.equal(loaded.maxRiskPercent, 1.25);
});

async function withServer(fn) {
  const app = createApp(config);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  try { await fn(url, app.state); }
  finally { await new Promise((resolve) => app.server.close(resolve)); }
}

async function post(url, path, headers, body) {
  return fetch(url + path, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: JSON.stringify(body),
  });
}

test('health is public; owner API requires a bearer token and allows only the configured origin', async () => {
  await withServer(async (url) => {
    const health = await fetch(url + '/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).mode, 'demo-only');

    const denied = await fetch(url + '/api/status');
    assert.equal(denied.status, 401);

    const wrongOrigin = await fetch(url + '/api/status', {
      headers: { Authorization: owner.Authorization, Origin: 'https://attacker.example' },
    });
    assert.equal(wrongOrigin.status, 403);

    const preflight = await fetch(url + '/api/status', {
      method: 'OPTIONS',
      headers: { Origin: config.appOrigin, 'Access-Control-Request-Method': 'GET' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), config.appOrigin);

    const status = await fetch(url + '/api/status', { headers: owner });
    assert.equal(status.status, 200);
    assert.equal(status.headers.get('access-control-allow-origin'), config.appOrigin);
  });
});

test('only a verified demo heartbeat enables quotes and trading', async () => {
  await withServer(async (url) => {
    const live = await post(url, '/bridge/heartbeat', bridge, {
      connected: true, demo: false, symbols: { EURUSD: 'EURUSD' }, error: 'Live account blocked',
    });
    assert.equal(live.status, 200);
    assert.equal((await live.json()).acceptedDemoOnly, false);

    const quoteDenied = await post(url, '/bridge/quotes', bridge, { quotes: [{
      symbol: 'EURUSD', bid: 1.1, ask: 1.1001, time: Date.now(),
    }] });
    assert.equal(quoteDenied.status, 409);

    const blockedOrder = await post(url, '/api/orders', owner, {
      symbol: 'EURUSD', side: 'buy', volume: 0.01, stopLoss: 1.09,
    });
    assert.equal(blockedOrder.status, 503);
  });
});

test('demo quotes are validated, exposed to owner, and stale quotes are flagged', async () => {
  await withServer(async (url, state) => {
    const heartbeat = await post(url, '/bridge/heartbeat', bridge, {
      connected: true, demo: true, accountCurrency: 'USD', equity: 10000,
      symbols: { EURUSD: 'EURUSDm', XAUUSD: 'XAUUSDm' },
    });
    assert.equal(heartbeat.status, 200);
    assert.equal((await heartbeat.json()).mappedSymbolCount, 2);

    const quoteResponse = await post(url, '/bridge/quotes', bridge, { quotes: [
      { symbol: 'EURUSD', bid: 1.1, ask: 1.1001, time: Date.now() },
      { symbol: 'XAUUSD', bid: -1, ask: 3, time: Date.now() },
      { symbol: 'NOTREAL', bid: 1, ask: 1.1, time: Date.now() },
    ] });
    assert.equal((await quoteResponse.json()).accepted, 1);

    const quotes = await fetch(url + '/api/quotes', { headers: owner });
    const body = await quotes.json();
    assert.equal(body.mode, 'demo-only');
    assert.equal(body.quotes.length, 1);
    assert.equal(body.quotes[0].brokerSymbol, 'EURUSDm');
    assert.equal(body.quotes[0].stale, false);

    state.quotes.get('EURUSD').receivedAt = Date.now() - 11_000;
    const stale = await (await fetch(url + '/api/quotes', { headers: owner })).json();
    assert.equal(stale.quotes[0].stale, true);

    await post(url, '/bridge/heartbeat', bridge, {
      connected: true, demo: true, accountCurrency: 'USD', equity: 10000,
      symbols: { EURUSD: 'EURUSD.pro', XAUUSD: 'XAUUSDm' },
    });
    assert.equal(state.quotes.size, 0, 'mapping change must discard quotes from the previous symbol session');
  });
});

test('demo order must include protective stop, fresh quote, and gets claimed only once', async () => {
  await withServer(async (url) => {
    await post(url, '/bridge/heartbeat', bridge, {
      connected: true, demo: true, accountCurrency: 'USD', equity: 10000,
      symbols: { EURUSD: 'EURUSDm' },
    });
    await post(url, '/bridge/quotes', bridge, { quotes: [{
      symbol: 'EURUSD', bid: 1.1, ask: 1.1002, time: Date.now(),
    }] });

    const wrongStop = await post(url, '/api/orders', owner, {
      symbol: 'EURUSD', side: 'buy', volume: 0.01, stopLoss: 1.101,
    });
    assert.equal(wrongStop.status, 422);

    const accepted = await post(url, '/api/orders', owner, {
      symbol: 'EURUSD', side: 'buy', volume: 0.01, stopLoss: 1.09, takeProfit: 1.12,
    });
    assert.equal(accepted.status, 202);
    const acceptedBody = await accepted.json();
    assert.equal(acceptedBody.mode, 'demo-only');

    const claim = await fetch(url + '/bridge/orders/claim', { headers: bridge });
    const claimed = await claim.json();
    assert.equal(claim.status, 200);
    assert.equal(claimed.order.id, acceptedBody.id);
    assert.equal(claimed.order.brokerSymbol, 'EURUSDm');

    const secondClaim = await (await fetch(url + '/bridge/orders/claim', { headers: bridge })).json();
    assert.equal(secondClaim.order, null);

    const result = await post(url, '/bridge/orders/result', bridge, {
      id: acceptedBody.id, status: 'filled', ticket: 1234, fillPrice: 1.1002, filledVolume: 0.01,
      message: 'Demo fill accepted',
    });
    assert.equal(result.status, 200);
    const detail = await (await fetch(url + '/api/orders/' + acceptedBody.id, { headers: owner })).json();
    assert.equal(detail.order.status, 'filled');
    assert.equal(detail.order.ticket, 1234);
  });
});

test('unknown execution requires owner review; partial fills remain distinct', async () => {
  await withServer(async (url, state) => {
    await post(url, '/bridge/heartbeat', bridge, {
      connected: true, demo: true, accountCurrency: 'USD', equity: 10000,
      symbols: { EURUSD: 'EURUSD' },
    });
    await post(url, '/bridge/quotes', bridge, { quotes: [{
      symbol: 'EURUSD', bid: 1.1, ask: 1.1001, time: Date.now(),
    }] });
    const response = await post(url, '/api/orders', owner, {
      symbol: 'EURUSD', side: 'sell', volume: 0.01, stopLoss: 1.11,
    });
    const { id } = await response.json();
    await fetch(url + '/bridge/orders/claim', { headers: bridge });

    const reported = await post(url, '/bridge/orders/result', bridge, {
      id, status: 'unknown', message: 'MT5 send timed out; inspect history.',
    });
    assert.equal(reported.status, 200);
    const detail = await (await fetch(url + '/api/orders/' + id, { headers: owner })).json();
    assert.equal(detail.order.status, 'unknown');
    assert.match(detail.order.message, /inspect history/);

    const blocked = await post(url, '/api/orders', owner, {
      symbol: 'EURUSD', side: 'sell', volume: 0.01, stopLoss: 1.11,
    });
    assert.equal(blocked.status, 409);
    assert.equal(state.orders.get(id).status, 'unknown');

    const acknowledged = await post(url, `/api/orders/${id}/acknowledge`, owner, {});
    assert.equal(acknowledged.status, 200);
    state.orderCooldownUntil = 0;
    const next = await post(url, '/api/orders', owner, {
      symbol: 'EURUSD', side: 'sell', volume: 0.01, stopLoss: 1.11,
    });
    assert.equal(next.status, 202);
    const nextOrder = await next.json();
    await fetch(url + '/bridge/orders/claim', { headers: bridge });
    const partialResult = await post(url, '/bridge/orders/result', bridge, {
      id: nextOrder.id, status: 'partial', message: 'Partial demo fill.',
      ticket: 5678, fillPrice: 1.1, filledVolume: 0.005,
    });
    assert.equal(partialResult.status, 200);
    const partial = await (await fetch(url + '/api/orders/' + nextOrder.id, { headers: owner })).json();
    assert.equal(partial.order.status, 'partial');
    assert.equal(partial.order.filledVolume, 0.005);
  });
});

test('an order with no terminal response becomes unknown and is never silently retried', async () => {
  await withServer(async (url, state) => {
    await post(url, '/bridge/heartbeat', bridge, {
      connected: true, demo: true, accountCurrency: 'USD', equity: 10000,
      symbols: { EURUSD: 'EURUSD' },
    });
    await post(url, '/bridge/quotes', bridge, { quotes: [{
      symbol: 'EURUSD', bid: 1.1, ask: 1.1001, time: Date.now(),
    }] });
    const response = await post(url, '/api/orders', owner, {
      symbol: 'EURUSD', side: 'sell', volume: 0.01, stopLoss: 1.11,
    });
    const { id } = await response.json();
    await fetch(url + '/bridge/orders/claim', { headers: bridge });
    state.orders.get(id).claimedAt = Date.now() - 61_000;
    const detail = await (await fetch(url + '/api/orders/' + id, { headers: owner })).json();
    assert.equal(detail.order.status, 'unknown');

    const blocked = await post(url, '/api/orders', owner, {
      symbol: 'EURUSD', side: 'sell', volume: 0.01, stopLoss: 1.11,
    });
    assert.equal(blocked.status, 409);

    const acknowledged = await post(url, `/api/orders/${id}/acknowledge`, owner, {});
    assert.equal(acknowledged.status, 200);
    assert.equal((await acknowledged.json()).order.status, 'acknowledged');

    state.orderCooldownUntil = 0;
    const afterReview = await post(url, '/api/orders', owner, {
      symbol: 'EURUSD', side: 'sell', volume: 0.01, stopLoss: 1.11,
    });
    assert.equal(afterReview.status, 202, 'owner review should clear the duplicate-send lock');
  });
});
