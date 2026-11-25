/* ==========================================================================
   Pages: Assistant · Calendar · Notes · Routine · Playbook · Settings
   ========================================================================== */
(function () {
  'use strict';
  const PS = window.PS;
  const { ui, icon, esc, fmt, money, signed, klass, Store, KEYS, settings } = PS;
  PS.pages = PS.pages || {};

  /* ======================================================================
     ASSISTANT — answers from your own data
     ====================================================================== */
  const SUGGESTIONS = [
    'How is my edge holding up?',
    'What is my worst setup?',
    'How risky is today?',
    'Review my last 10 trades',
    'Which session makes me money?',
    'What should I stop doing?',
    'Size a gold trade for me',
    'Summarise my week',
  ];

  function answer(q) {
    const s = settings();
    const ccy = s.currency;
    const trades = Store.get(KEYS.trades, []);
    const closed = trades.filter((t) => t.status !== 'open');
    const st = PS.stats(trades);
    const risk = ui.riskToday();
    const acc = ui.accountSummary();
    const ql = q.toLowerCase();

    const money0 = (n) => money(n, ccy, 0);
    const pct = (n) => fmt(n, 1) + '%';

    if (/edge|holding up|how am i|performance|doing|profitable|make money/.test(ql)) {
      const trend =
        st.count > 10
          ? (() => {
              const recent = closed.slice().sort((a, b) => b.closedAt - a.closedAt).slice(0, 5);
              const older = closed.slice().sort((a, b) => b.closedAt - a.closedAt).slice(5);
              const rNet = recent.reduce((a, t) => a + t.pnl, 0);
              const oNet = older.reduce((a, t) => a + t.pnl, 0) / Math.max(1, older.length / 5);
              return rNet > oNet ? 'improving' : 'softening';
            })()
          : 'not enough data';
      return `Across <strong>${st.count} closed trades</strong> you are <strong>${money(st.net, ccy)}</strong>, a <strong>${pct(st.winRate)}</strong> hit rate with a profit factor of <strong>${st.profitFactor === Infinity ? '∞' : fmt(st.profitFactor, 2)}</strong>.
        <div class="msg-card">
          <div class="row-kv"><span>Expectancy per trade</span><span>${money(st.expectancy, ccy)}</span></div>
          <div class="row-kv"><span>Average win / loss</span><span>${money0(st.avgWin)} / ${money0(-st.avgLoss)}</span></div>
          <div class="row-kv"><span>Average R</span><span>${signed(st.avgR, 2)}R</span></div>
          <div class="row-kv"><span>Recent trend</span><span>${trend}</span></div>
        </div>
        The single number that matters is expectancy: <code>${money(st.expectancy, ccy)}</code> per trade. Positive edge plus sane sizing is the whole game — everything else is noise.`;
    }

    if (/worst|leak|stop doing|mistake|losing/.test(ql)) {
      const losses = closed.filter((t) => t.pnl < 0);
      const setups = PS.groupBy(losses, (t) => t.setup || 'Untagged');
      const sessions = PS.groupBy(losses, (t) => t.session || '—');
      const worst = setups[0];
      return `Clearest leak: <strong>${esc(worst ? worst.key : 'untagged trades')}</strong>, <strong>${money(worst ? worst.stats.net : 0, ccy)}</strong> across ${worst ? worst.stats.count : 0} trades.
        <div class="msg-card">
          <div class="row-kv"><span>Worst session</span><span>${esc(sessions[0] ? sessions[0].key : '—')} (${money(sessions[0] ? sessions[0].stats.net : 0, ccy)})</span></div>
          <div class="row-kv"><span>Longest losing streak</span><span>${Math.abs(st.worstStreak)} trades</span></div>
          <div class="row-kv"><span>Average loss</span><span>${money0(-st.avgLoss)}</span></div>
        </div>
        The pattern I would attack first: you lose more per losing trade (${money0(st.avgLoss)}) than you make per winner (${money0(st.avgWin)}) ${st.avgWin < st.avgLoss ? '— so your win rate has to carry the whole book' : '— which is the right way round'}. ${st.avgWin < st.avgLoss ? 'Cut the losers earlier or demand more from the winners.' : ''}`;
    }

    if (/risk|today|exposure|safe/.test(ql)) {
      return `Today: <strong>${pct(risk.usedPct)}</strong> of your daily loss budget used — ${money(risk.used, ccy)} of ${money(risk.dailyLimit, ccy)}.
        <div class="msg-card">
          <div class="row-kv"><span>Open positions</span><span>${risk.openCount} / ${s.maxOpenPositions}</span></div>
          <div class="row-kv"><span>Open risk to stops</span><span>${money0(risk.openRisk)}</span></div>
          <div class="row-kv"><span>Remaining budget</span><span>${money0(risk.remaining)}</span></div>
          <div class="row-kv"><span>Per-trade limit</span><span>${fmt(s.riskPerTrade, 2)}%</span></div>
        </div>
        ${risk.breaches.positions ? 'You are over your maximum open positions. Close one before adding another.' : risk.usedPct > 60 ? 'You are more than halfway through the daily budget. The next stop-out is the last one you are allowed.' : 'Room to work, but size from the stop, not from conviction.'}`;
    }

    if (/last 10|last ten|review|recent trades/.test(ql)) {
      const recent = closed.slice().sort((a, b) => b.closedAt - a.closedAt).slice(0, 10);
      const rs = PS.stats(recent);
      return `Your last <strong>${recent.length}</strong> closed trades:
        <div class="msg-card">
          ${recent
            .map(
              (t) => `<div class="row-kv"><span>${esc(t.sym)} · ${esc(t.side)} · ${esc(t.setup || '—')}</span>
                <span class="${klass(t.pnl)}">${money(t.pnl, ccy)}</span></div>`
            )
            .join('')}
        </div>
        Net <strong>${money(rs.net, ccy)}</strong>, ${pct(rs.winRate)} win rate. ${rs.net >= 0 ? 'Nothing broken — repeat the process, not the outcome.' : 'This stretch is negative. Check whether the losses share one cause before you change the system.'}`;
    }

    if (/session|time of day|london|new york|tokyo|asia/.test(ql)) {
      const bySess = PS.groupBy(closed, (t) => t.session || '—');
      if (!bySess.length) return `No session tags in your journal yet. Add a session when you log a trade and I can break this down properly.`;
      return `By session:
        <div class="msg-card">
          ${bySess
            .map(
              (g) => `<div class="row-kv"><span>${esc(g.key)} · ${g.stats.count} trades · ${pct(g.stats.winRate)} win</span>
                <span class="${klass(g.stats.net)}">${money(g.stats.net, ccy)}</span></div>`
            )
            .join('')}
        </div>
        Trade the session that pays you, not the one that entertains you.`;
    }

    if (/size|lot|position siz|calculator/.test(ql)) {
      const bal = acc.balance;
      const riskCash = (bal * s.riskPerTrade) / 100;
      const entry = PS.price('XAUUSD');
      /* 1 point on gold = $0.01, so a 220-point stop is a $2.20 price move */
      const stop = entry - 2.2;
      const perLot = PS.riskCashFor('XAUUSD', 1, entry, stop);
      const lots = perLot ? riskCash / perLot : 0;
      return `At <strong>${money(bal, ccy, 0)}</strong> balance and <strong>${fmt(s.riskPerTrade, 2)}%</strong> risk, your budget per trade is <strong>${money(riskCash, ccy)}</strong>.
        <div class="msg-card">
          <div class="row-kv"><span>Gold entry</span><span>${fmt(entry, 2)}</span></div>
          <div class="row-kv"><span>220-point stop (1 lot = 100 oz)</span><span>${money(perLot, ccy)} risk / lot</span></div>
          <div class="row-kv"><span>Suggested size</span><span>${fmt(lots, 2)} lots</span></div>
          <div class="row-kv"><span>If you use a 2×ATR stop</span><span>halve it</span></div>
        </div>
        Always size from the stop distance, never from how confident you feel. The <a href="charts.html" style="color:var(--amber)">Charts</a> page has a live calculator wired to the same maths.`;
    }

    if (/week|summar|month/.test(ql)) {
      const weekStart = Date.now() - 7 * 864e5;
      const wk = closed.filter((t) => t.closedAt >= weekStart);
      const ws = PS.stats(wk);
      const reflections = Store.get(KEYS.reflections, []).filter((r) => r.createdAt >= weekStart);
      return `Last 7 days: <strong>${ws.count}</strong> closed trades, <strong class="${klass(ws.net)}">${money(ws.net, ccy)}</strong>, ${pct(ws.winRate)} win rate.
        <div class="msg-card">
          <div class="row-kv"><span>Best trade</span><span class="up">${money(ws.maxWin, ccy)}</span></div>
          <div class="row-kv"><span>Worst trade</span><span class="dn">${money(ws.maxLoss, ccy)}</span></div>
          <div class="row-kv"><span>Reflections written</span><span>${reflections.length}</span></div>
        </div>
        ${reflections.length === 0 ? 'No reflections this week. Two honest lines a day is the cheapest edge you will ever buy.' : `Your own note said: “${esc(reflections[0].lessons || reflections[0].body.slice(0, 90))}”. Worth re-reading before Monday.`}`;
    }

    if (/strategy|strategies|backtest/.test(ql)) {
      const strats = Store.get(KEYS.strategies, []);
      const live = strats.filter((x) => x.status === 'live');
      return `You have <strong>${strats.length}</strong> strategies, <strong>${live.length}</strong> live.
        <div class="msg-card">
          ${strats
            .map((x) => `<div class="row-kv"><span>${esc(x.name)}</span><span>${esc(x.status)}${x.pf ? ' · PF ' + fmt(x.pf, 2) : ''}</span></div>`)
            .join('')}
        </div>
        ${live.length === 0 ? 'Nothing is running. That is fine — an untested idea is not a strategy.' : 'Anything live deserves a weekly check against your own journal. If a live strategy has no matching trades in your log, you are running something you do not understand.'}`;
    }

    if (/note|idea|playbook/.test(ql)) {
      const notes = Store.get(KEYS.notes, []);
      return `You have <strong>${notes.length}</strong> notes saved.
        <div class="msg-card">
          ${notes.slice(0, 5).map((n) => `<div class="row-kv"><span>${esc(n.title)}</span><span>${esc(n.tag || '—')}</span></div>`).join('')}
        </div>
        Pinned notes are the ones you keep coming back to — check them before the session, not after the loss.`;
    }

    if (/hello|hi |hey|morning|afternoon|evening/.test(ql)) {
      return `Desk is open. ${acc.open.length} position${acc.open.length === 1 ? '' : 's'} running, ${pct(risk.usedPct)} of the daily budget used. What are we looking at?`;
    }

    return `I can work with what is on this desk: <strong>${st.count} closed trades</strong>, <strong>${acc.open.length} open</strong>, <strong>${Store.get(KEYS.strategies, []).length} strategies</strong> and <strong>${Store.get(KEYS.notes, []).length} notes</strong>.
      <div class="msg-card">
        <div class="row-kv"><span>Try asking</span><span>how is my edge holding up</span></div>
        <div class="row-kv"><span></span><span>what is my worst setup</span></div>
        <div class="row-kv"><span></span><span>how risky is today</span></div>
      </div>
      Everything I say comes from your own data — never from a market feed, and never as advice.`;
  }

  PS.pages.assistant = function (root) {
    const s = settings();
    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Assistant <span class="chip chip-amber">reads your data</span></h1>
          <div class="sub">Local, rule-based, honest about what it does not know</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" data-act="clear">${icon('refresh')}Clear</button>
        </div>
      </div>
      <div class="chat-shell">
        <div class="chat-scroll" id="chat-scroll"><div class="chat-inner" id="chat-inner"></div></div>
        <div class="chat-input-wrap">
          <div class="chat-suggestions">
            ${SUGGESTIONS.map((x) => `<button class="sugg" data-q="${esc(x)}">${esc(x)}</button>`).join('')}
          </div>
          <form class="chat-form" id="chat-form">
            <textarea id="chat-text" rows="1" placeholder="Ask about your trades, risk, strategies or notes…" aria-label="Message the assistant"></textarea>
            <button class="btn btn-primary" type="submit" style="height:38px">${icon('send')}Send</button>
          </form>
        </div>
      </div>`;

    const inner = root.querySelector('#chat-inner');
    const scroll = root.querySelector('#chat-scroll');

    const paint = () => {
      const history = Store.get(KEYS.chat, []);
      inner.innerHTML = history
        .map(
          (m) => `<div class="msg ${m.who}">
            <div class="msg-avatar">${m.who === 'ai' ? icon('bot') : 'You'}</div>
            <div class="msg-body">${m.text}</div>
          </div>`
        )
        .join('');
      scroll.scrollTop = scroll.scrollHeight;
    };
    paint();

    const send = (text) => {
      if (!text.trim()) return;
      const history = Store.get(KEYS.chat, []);
      history.push({ who: 'user', text: esc(text) });
      Store.set(KEYS.chat, history);
      paint();

      const holder = document.createElement('div');
      holder.className = 'msg ai';
      holder.innerHTML = `<div class="msg-avatar">${icon('bot')}</div><div class="msg-body"><span class="typing"><i></i><i></i><i></i></span></div>`;
      inner.appendChild(holder);
      scroll.scrollTop = scroll.scrollHeight;

      setTimeout(() => {
        const h = Store.get(KEYS.chat, []);
        h.push({ who: 'ai', text: answer(text) });
        Store.set(KEYS.chat, h);
        paint();
      }, 620);
    };

    const form = root.querySelector('#chat-form');
    const ta = root.querySelector('#chat-text');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = ta.value;
      ta.value = '';
      send(v);
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    root.querySelectorAll('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        ta.value = b.dataset.q;
        form.requestSubmit();
      })
    );
    root.querySelector('[data-act="clear"]').addEventListener('click', () => {
      Store.set(KEYS.chat, [{ who: 'ai', text: 'Cleared. What do you want to look at?' }]);
      paint();
      PS.toast('Conversation cleared');
    });
  };

  /* ======================================================================
     CALENDAR
     ====================================================================== */
  PS.pages.calendar = function (root) {
    const s = settings();
    const events = Store.get(KEYS.events, []);
    const st = PS.sessionState();
    const now = Date.now();
    const nextIdx = events.findIndex((e) => e.at > now);

    const groups = {};
    events.forEach((e) => {
      const d = new Date(e.at);
      const key = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      groups[key] = groups[key] || [];
      groups[key].push(e);
    });

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Calendar</h1>
          <div class="sub">Scheduled releases and the session clock · times in IST</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" data-act="refresh">${icon('refresh')}Rebuild</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid g4">
          ${ui.kpi({ k: 'Next high impact', v: (() => { const e = events.find((x) => x.impact === 'high' && x.at > now); return e ? new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'; })(), d: (() => { const e = events.find((x) => x.impact === 'high' && x.at > now); return e ? esc(e.name) : 'none scheduled'; })(), accent: true, iconName: 'bell' })}
          ${ui.kpi({ k: 'Session now', v: st.anyOpen ? st.sessions.filter((x) => x.active).map((x) => x.name).join(' + ') || 'Open' : 'Closed', d: `IST ${st.ist.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, iconName: 'clock' })}
          ${ui.kpi({ k: 'Events tracked', v: String(events.length), d: 'next 3 weeks', iconName: 'calendar' })}
          ${ui.kpi({ k: 'News blackout', v: s.newsBlackout ? 'On' : 'Off', d: 'blocks entries near releases', iconName: 'shield' })}
        </div>

        ${ui.panel({
          title: 'Session clock',
          sub: 'Overlap of London and New York is where the volatility lives',
          body: `<div style="display:grid;gap:8px">
            ${st.sessions
              .map(
                (x) => `<div class="row" style="gap:10px">
                  <span class="xs" style="width:66px;color:var(--ink-2)">${x.name}</span>
                  <div class="bar ${x.active ? 'green' : ''}" style="flex:1;height:8px">
                    <i style="width:100%;background:${x.active ? 'var(--green)' : 'var(--panel-4)'}"></i>
                  </div>
                  <span class="chip ${x.active ? 'chip-green' : ''}" style="min-width:56px;justify-content:center">${x.active ? 'open' : 'closed'}</span>
                  <span class="mono xs dim" style="width:96px;text-align:right">${String(Math.floor(x.open / 60)).padStart(2, '0')}:${String(x.open % 60).padStart(2, '0')}–${String(Math.floor((x.close % 1440) / 60)).padStart(2, '0')}:${String(x.close % 60).padStart(2, '0')}</span>
                </div>`
              )
              .join('')}
          </div>`,
        })}

        <div class="grid g2-1">
          ${ui.panel({
            title: 'Economic calendar',
            sub: 'Recurring template, projected forward',
            flush: true,
            body: `<div style="padding:10px;display:grid;gap:16px">
              ${Object.entries(groups)
                .map(
                  ([day, list]) => `<div>
                    <div class="label-lg" style="margin-bottom:7px">${esc(day)}</div>
                    <div style="display:grid;gap:6px">
                      ${list
                        .map(
                          (e) => `<div class="cal-event ${events.indexOf(e) === nextIdx ? 'next' : ''}">
                            <span class="time">${new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span class="name">${esc(e.name)}
                              <div class="meta">${esc(e.ccy)} · prev ${esc(e.prev)} · forecast ${esc(e.fcast)}</div>
                            </span>
                            <span class="impact ${e.impact}" title="${e.impact} impact"><i></i><i></i><i></i></span>
                          </div>`
                        )
                        .join('')}
                    </div>
                  </div>`
                )
                .join('')}
            </div>`,
          })}
          <div style="display:grid;gap:12px">
            ${ui.panel({
              title: 'Session edge',
              sub: 'From your journal',
              body: (() => {
                const bySess = PS.groupBy(Store.get(KEYS.trades, []).filter((t) => t.status !== 'open'), (t) => t.session || '—');
                return bySess.length
                  ? `<div class="tbl-wrap" style="max-height:none"><table class="tbl tbl-compact">
                      <thead><tr><th>Session</th><th class="num">Trades</th><th class="num">Win</th><th class="num">Net</th></tr></thead>
                      <tbody>${PS.ui.sessionStats(Store.get(KEYS.trades, [])) || '<tr><td colspan="4" class="empty">No data</td></tr>'}</tbody>
                    </table></div>`
                  : ui.empty('Log trades with a session tag to see this.');
              })(),
            })}
            ${ui.panel({
              title: 'Pre-session checklist',
              body: `<div class="check-list">
                ${[
                  'Marked the Asian range high and low',
                  'Checked the calendar for high-impact releases',
                  'Wrote the day plan in Notes',
                  'Confirmed the daily loss budget',
                  'Two setups maximum',
                ]
                  .map(
                    (x, i) => `<label class="check-item">
                      <span class="check-box"></span>
                      <span class="txt sm">${esc(x)}</span>
                    </label>`
                  )
                  .join('')}
              </div>`,
            })}
          </div>
        </div>
      </div>`;

    root.querySelector('[data-act="refresh"]').addEventListener('click', () => {
      Store.set(KEYS.events, PS.buildEvents());
      PS.pages.calendar(root);
      PS.toast('Calendar rebuilt');
    });
  };

  /* ======================================================================
     NOTES
     ====================================================================== */
  PS.pages.notes = function (root) {
    const notes = Store.get(KEYS.notes, []);
    const tags = Array.from(new Set(notes.map((n) => n.tag).filter(Boolean)));
    let tag = 'all';
    let q = '';

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Notes</h1>
          <div class="sub">Rules, playbook fragments, things you keep relearning</div>
        </div>
        <div class="actions">
          <input class="in" id="note-q" placeholder="Search notes…" style="height:30px;width:180px;font-size:12px">
          <button class="btn btn-sm btn-primary" data-act="new">${icon('plus')}New note</button>
        </div>
      </div>
      <div class="page-body">
        <div class="pill-nav" id="tag-nav">
          <button class="active" data-tag="all">All (${notes.length})</button>
          ${tags.map((t) => `<button data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
        <div class="grid g3" id="note-grid"></div>
      </div>`;

    const paint = () => {
      const list = notes
        .filter((n) => tag === 'all' || n.tag === tag)
        .filter((n) => !q || (n.title + ' ' + n.body).toLowerCase().includes(q))
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);

      root.querySelector('#note-grid').innerHTML =
        list.length
          ? list
              .map(
                (n) => `<article class="panel" data-note="${n.id}">
                  <div class="panel-head">
                    <h2 style="font-size:12.5px">${esc(n.title)}</h2>
                    <div class="right">
                      ${n.pinned ? `<span class="chip chip-amber">${icon('spark')}pinned</span>` : ''}
                      <button class="icon-btn" data-pin="${n.id}" title="${n.pinned ? 'Unpin' : 'Pin'}">${icon('spark')}</button>
                      <button class="icon-btn" data-editnote="${n.id}" title="Edit">${icon('edit')}</button>
                      <button class="icon-btn" data-delnote="${n.id}" title="Delete">${icon('trash')}</button>
                    </div>
                  </div>
                  <div class="panel-body">
                    <p class="sm" style="color:var(--ink-2);white-space:pre-wrap;line-height:1.6">${esc(n.body.slice(0, 300))}${n.body.length > 300 ? '…' : ''}</p>
                  </div>
                  <div class="panel-foot row-between">
                    <span class="chip chip-plain">${esc(n.tag || 'untagged')}</span>
                    <span class="xs dim">${PS.ago(n.updatedAt)}</span>
                  </div>
                </article>`
              )
              .join('')
          : ui.empty(q ? 'No notes match that search.' : 'No notes yet. Write the rule you keep breaking.');

      root.querySelectorAll('[data-pin]').forEach((b) =>
        b.addEventListener('click', () => {
          const all = Store.get(KEYS.notes, []);
          const n = all.find((x) => x.id === b.dataset.pin);
          n.pinned = !n.pinned;
          Store.set(KEYS.notes, all);
          paint();
        })
      );
      root.querySelectorAll('[data-delnote]').forEach((b) =>
        b.addEventListener('click', async () => {
          if (!(await PS.confirm('Delete this note?', { danger: true, confirmLabel: 'Delete' }))) return;
          Store.set(KEYS.notes, Store.get(KEYS.notes, []).filter((x) => x.id !== b.dataset.delnote));
          PS.pages.notes(root);
          PS.toast('Note deleted');
        })
      );
      root.querySelectorAll('[data-editnote]').forEach((b) =>
        b.addEventListener('click', () => editor(Store.get(KEYS.notes, []).find((x) => x.id === b.dataset.editnote)))
      );
    };

    const editor = (existing) => {
      const n = existing || { title: '', body: '', tag: 'rules', pinned: false };
      PS.modal({
        title: existing ? 'Edit note' : 'New note',
        wide: true,
        body: `
          ${ui.field({ label: 'Title', id: 'n-title', value: n.title, placeholder: 'Rule: no entry on the break' })}
          <div class="grid g2" style="gap:10px">
            ${ui.field({ label: 'Tag', id: 'n-tag', value: n.tag, options: ['rules', 'playbook', 'risk', 'learning', 'ideas', 'review'] })}
            <div class="field"><label>Pinned</label><label class="check" style="height:32px;align-items:center"><input type="checkbox" id="n-pin" ${n.pinned ? 'checked' : ''}><span class="xs">Keep at the top</span></label></div>
          </div>
          ${ui.field({ label: 'Body', id: 'n-body', textarea: true, value: n.body, placeholder: 'Write it so you can read it back in six months and still understand it.' })}`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="n-save">Save</button>`,
        onOpen(el, close) {
          el.querySelector('#n-save').addEventListener('click', () => {
            const title = el.querySelector('#n-title').value.trim();
            const body = el.querySelector('#n-body').value.trim();
            if (!title || !body) return PS.toast('Title and body are required', 'err');
            const all = Store.get(KEYS.notes, []);
            const rec = Object.assign({}, existing || { id: PS.uid('n'), createdAt: Date.now() }, {
              title,
              body,
              tag: el.querySelector('#n-tag').value,
              pinned: el.querySelector('#n-pin').checked,
              updatedAt: Date.now(),
            });
            Store.set(KEYS.notes, existing ? all.map((x) => (x.id === rec.id ? rec : x)) : all.concat(rec));
            close();
            PS.pages.notes(root);
            PS.toast('Note saved');
          });
        },
      });
    };

    root.querySelector('[data-act="new"]').addEventListener('click', () => editor(null));
    root.querySelector('#note-q').addEventListener('input', PS.debounce((e) => { q = e.target.value.toLowerCase(); paint(); }, 180));
    root.querySelectorAll('[data-tag]').forEach((b) =>
      b.addEventListener('click', () => {
        tag = b.dataset.tag;
        root.querySelectorAll('[data-tag]').forEach((x) => x.classList.toggle('active', x === b));
        paint();
      })
    );

    paint();
  };

  /* ======================================================================
     ROUTINE / TASKS
     ====================================================================== */
  PS.pages.tasks = function (root) {
    const tasks = Store.get(KEYS.tasks, []);
    const habits = Store.get(KEYS.habits, []);
    const cats = ['pre-market', 'post-market', 'research', 'risk', 'admin'];

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Routine</h1>
          <div class="sub">The boring part that makes the trading part work</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-primary" data-act="new">${icon('plus')}Add task</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid g4">
          ${ui.kpi({ k: 'Open tasks', v: String(tasks.filter((t) => !t.done).length), d: `${tasks.length} total`, accent: true, iconName: 'checkSquare' })}
          ${ui.kpi({ k: 'Done', v: String(tasks.filter((t) => t.done).length), d: 'all time', iconName: 'check' })}
          ${ui.kpi({ k: 'Habits tracked', v: String(habits.length), d: 'this week', iconName: 'repeat' })}
          ${ui.kpi({ k: 'Habit score', v: (() => { const total = habits.length * 7; const done = habits.reduce((a, h) => a + h.days.filter(Boolean).length, 0); return total ? Math.round((done / total) * 100) + '<small>%</small>' : '—'; })(), d: '7-day completion', iconName: 'target' })}
        </div>

        <div class="grid g2-1">
          ${ui.panel({
            title: 'Tasks',
            flush: true,
            body: `<div id="task-list" style="padding:10px;display:grid;gap:6px"></div>`,
            foot: `<span class="xs">Grouped by phase of the day.</span>`,
          })}
          ${ui.panel({
            title: 'Weekly habits',
            sub: 'Tick the days you actually did it',
            body: `<div id="habit-grid"></div>`,
          })}
        </div>

        ${ui.panel({
          title: 'Pre-market routine',
          sub: 'Your standing checklist',
          body: `<div class="check-list">
            ${['Check the economic calendar for high-impact releases', 'Mark the Asian range and prior day high/low', 'Note the higher-timeframe bias', 'Decide the two setups you will take', 'Set the daily loss budget and walk away from screens if hit']
              .map((x) => `<div class="check-item"><span class="check-box"></span><span class="txt sm">${esc(x)}</span></div>`)
              .join('')}
          </div>`,
        })}
      </div>`;

    const paintTasks = () => {
      const host = root.querySelector('#task-list');
      const list = Store.get(KEYS.tasks, []);
      host.innerHTML = cats
        .map((cat) => {
          const items = list.filter((t) => t.cat === cat);
          if (!items.length) return '';
          return `<div>
            <div class="label" style="margin:6px 2px 5px">${esc(cat)}</div>
            ${items
              .map(
                (t) => `<div class="check-item ${t.done ? 'done' : ''}" data-t="${t.id}">
                  <span class="check-box">${t.done ? icon('check') : ''}</span>
                  <span class="txt sm">${esc(t.text)}</span>
                  <span class="xs dim" style="margin-left:auto">${PS.dateShort(t.due || Date.now())}</span>
                  <button class="icon-btn" data-delt="${t.id}">${icon('x')}</button>
                </div>`
              )
              .join('')}
          </div>`;
        })
        .join('') || ui.empty('No tasks. Add the first one.');

      host.querySelectorAll('[data-t]').forEach((el) =>
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-delt]')) return;
          const all = Store.get(KEYS.tasks, []);
          const t = all.find((x) => x.id === el.dataset.t);
          t.done = !t.done;
          Store.set(KEYS.tasks, all);
          paintTasks();
        })
      );
      host.querySelectorAll('[data-delt]').forEach((b) =>
        b.addEventListener('click', () => {
          Store.set(KEYS.tasks, Store.get(KEYS.tasks, []).filter((x) => x.id !== b.dataset.delt));
          paintTasks();
          PS.toast('Task removed');
        })
      );
    };

    const paintHabits = () => {
      const h = Store.get(KEYS.habits, []);
      const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      root.querySelector('#habit-grid').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr repeat(7,22px);gap:4px;align-items:center">
          <span></span>
          ${days.map((d) => `<span class="heat-head">${d}</span>`).join('')}
          ${h
            .map(
              (habit) => `<span class="xs" style="color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(habit.name)}</span>
                ${habit.days
                  .map(
                    (v, i) => `<button class="heat-cell" data-h="${habit.id}" data-d="${i}" style="aspect-ratio:1;padding:0;background:${v ? 'rgba(63,214,139,0.55)' : 'var(--panel-2)'};border:1px solid var(--line)"></button>`
                  )
                  .join('')}`
            )
            .join('')}
        </div>
        <p class="xs dim" style="margin-top:10px">Click a square to toggle. Consistency beats intensity.</p>`;

      root.querySelectorAll('[data-h]').forEach((b) =>
        b.addEventListener('click', () => {
          const all = Store.get(KEYS.habits, []);
          const habit = all.find((x) => x.id === b.dataset.h);
          const i = Number(b.dataset.d);
          habit.days[i] = habit.days[i] ? 0 : 1;
          Store.set(KEYS.habits, all);
          paintHabits();
        })
      );
    };

    root.querySelector('[data-act="new"]').addEventListener('click', () => {
      PS.modal({
        title: 'New task',
        body: `${ui.field({ label: 'Task', id: 'tk-text', placeholder: 'Review the two open positions before London' })}
          ${ui.field({ label: 'Phase', id: 'tk-cat', options: cats })}`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="tk-save">Add</button>`,
        onOpen(el, close) {
          el.querySelector('#tk-save').addEventListener('click', () => {
            const text = el.querySelector('#tk-text').value.trim();
            if (!text) return;
            const all = Store.get(KEYS.tasks, []);
            all.push({ id: PS.uid('k'), text, done: false, due: Date.now(), cat: el.querySelector('#tk-cat').value });
            Store.set(KEYS.tasks, all);
            close();
            paintTasks();
            PS.toast('Task added');
          });
        },
      });
    });

    paintTasks();
    paintHabits();
  };

  /* ======================================================================
     PLAYBOOK
     ====================================================================== */
  PS.pages.playbook = function (root) {
    const snippets = Store.get(KEYS.snippets, PS.SNIPPETS);
    const strats = Store.get(KEYS.strategies, []);
    const notes = Store.get(KEYS.notes, []).filter((n) => n.tag === 'playbook' || n.tag === 'rules');
    const cats = Array.from(new Set(snippets.map((s) => s.cat)));

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Playbook</h1>
          <div class="sub">Your setups, your code, your rules — in one place you can actually search</div>
        </div>
        <div class="actions">
          <input class="in" id="pb-q" placeholder="Search the playbook…" style="height:30px;width:190px;font-size:12px">
        </div>
      </div>
      <div class="page-body">
        <div class="pill-nav" id="pb-nav">
          <button class="active" data-cat="all">All (${snippets.length})</button>
          ${cats.map((c) => `<button data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
        <div class="grid g2" id="pb-grid"></div>

        <div class="grid g2">
          ${ui.panel({
            title: 'Your setups',
            sub: 'From the strategy builder',
            flush: true,
            body: strats.length
              ? `<div>${strats
                  .map(
                    (s) => `<div style="padding:11px 12px;border-bottom:1px solid var(--line)">
                      <div class="row-between">
                        <strong class="sm">${esc(s.name)}</strong>
                        ${ui.statusPill(s.status)}
                      </div>
                      <div class="xs dim" style="margin-top:4px">${esc((s.markets || []).join(', '))} · ${esc(s.tf)}</div>
                      <div class="xs" style="margin-top:6px;color:var(--ink-2)">Entry: ${esc(s.rules.enter || '—')}</div>
                      <div class="xs" style="color:var(--ink-2)">Stop: ${esc(s.rules.stop || '—')}</div>
                      <div class="xs" style="color:var(--ink-2)">Target: ${esc(s.rules.target || '—')}</div>
                    </div>`
                  )
                  .join('')}</div>`
              : ui.empty('No strategies yet.'),
          })}
          ${ui.panel({
            title: 'Rules worth re-reading',
            flush: true,
            body: notes.length
              ? `<div>${notes
                  .map(
                    (n) => `<div style="padding:11px 12px;border-bottom:1px solid var(--line)">
                      <div class="row-between"><strong class="sm">${esc(n.title)}</strong>${n.pinned ? ui.chip('pinned', 'amber') : ''}</div>
                      <p class="xs" style="margin-top:5px;color:var(--ink-2);white-space:pre-wrap">${esc(n.body.slice(0, 220))}${n.body.length > 220 ? '…' : ''}</p>
                    </div>`
                  )
                  .join('')}</div>`
              : ui.empty('Tag a note as “rules” or “playbook” and it appears here.'),
          })}
        </div>
      </div>`;

    let cat = 'all';
    let q = '';

    const paint = () => {
      const list = snippets
        .filter((s) => cat === 'all' || s.cat === cat)
        .filter((s) => !q || (s.name + ' ' + s.desc + ' ' + s.code).toLowerCase().includes(q));

      root.querySelector('#pb-grid').innerHTML =
        list.length
          ? list
              .map(
                (s) => `<article class="panel">
                  <div class="panel-head">
                    <div style="min-width:0">
                      <h2 style="font-size:12.5px">${esc(s.name)}</h2>
                      <div class="sub">${esc(s.desc)}</div>
                    </div>
                    <div class="right">
                      <span class="chip chip-plain">${esc(s.lang)}</span>
                      <button class="icon-btn" data-copy="${s.id}" title="Copy code">${icon('copy')}</button>
                    </div>
                  </div>
                  <div class="panel-body flush">
                    <pre class="mono xs" style="margin:0;padding:11px 12px;overflow:auto;max-height:230px;line-height:1.55;color:var(--ink-2);background:#08090b">${esc(s.code)}</pre>
                  </div>
                </article>`
              )
              .join('')
          : ui.empty('Nothing matches.');

      root.querySelectorAll('[data-copy]').forEach((b) =>
        b.addEventListener('click', () => {
          const s = snippets.find((x) => x.id === b.dataset.copy);
          if (!s) return;
          navigator.clipboard
            ?.writeText(s.code)
            .then(() => PS.toast('Code copied'))
            .catch(() => PS.toast('Could not copy', 'err'));
        })
      );
    };

    root.querySelector('#pb-q').addEventListener('input', PS.debounce((e) => { q = e.target.value.toLowerCase(); paint(); }, 160));
    root.querySelectorAll('[data-cat]').forEach((b) =>
      b.addEventListener('click', () => {
        cat = b.dataset.cat;
        root.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('active', x === b));
        paint();
      })
    );
    paint();
  };

  /* ======================================================================
     SETTINGS
     ====================================================================== */
  PS.pages.settings = function (root) {
    const s = settings();
    const accounts = Store.get(KEYS.accounts, []);
    const sizeKB = (PS.Store.size() / 1024).toFixed(1);

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <h1>Settings</h1>
          <div class="sub">Everything lives on this device — no accounts, no cloud</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-primary" data-act="save">${icon('save')}Save</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid g2">
          ${ui.panel({
            title: 'Profile',
            body: `<div class="col" style="gap:12px">
              <div class="grid g2" style="gap:10px">
                ${ui.field({ label: 'Your name', id: 's-name', value: s.name })}
                ${ui.field({ label: 'Currency', id: 's-ccy', value: s.currency, options: ['USD', 'EUR', 'GBP', 'NGN', 'JPY'] })}
              </div>
              <div class="grid g2" style="gap:10px">
                ${ui.field({ label: 'Starting balance', id: 's-bal', type: 'number', value: s.startingBalance })}
                ${ui.field({ label: 'Timezone label', id: 's-tz', value: s.timezone, hint: 'Sessions are shown in IST' })}
              </div>
            </div>`,
          })}
          ${ui.panel({
            title: 'Risk defaults',
            body: `<div class="col" style="gap:12px">
              <div class="grid g2" style="gap:10px">
                ${ui.field({ label: 'Risk per trade (%)', id: 's-risk', type: 'number', value: s.riskPerTrade, attrs: 'step="0.05"' })}
                ${ui.field({ label: 'Max open positions', id: 's-maxpos', type: 'number', value: s.maxOpenPositions })}
              </div>
              <div class="grid g2" style="gap:10px">
                ${ui.field({ label: 'Daily loss limit (%)', id: 's-daily', type: 'number', value: s.dailyLossLimit, attrs: 'step="0.5"' })}
                ${ui.field({ label: 'Max spread (pts)', id: 's-spread', type: 'number', value: s.maxSpread })}
              </div>
              ${ui.toggle({ label: 'News blackout', id: 's-news', checked: s.newsBlackout, hint: 'No entries around high-impact releases' })}
            </div>`,
          })}
        </div>

        ${ui.panel({
          title: 'Broker accounts',
          sub: 'Descriptive only — this static build cannot place orders',
          flush: true,
          body: `<div>${accounts
            .map(
              (a) => `<div class="row-between" style="padding:11px 12px;border-bottom:1px solid var(--line)">
                <div style="min-width:0">
                  <div class="sm" style="font-weight:500">${esc(a.name)}</div>
                  <div class="xs dim">${esc(a.broker)} · ${esc(a.login)} · ${esc(a.server)} · ${esc(a.leverage)}</div>
                </div>
                <div class="row" style="gap:8px">
                  <span class="mono xs">${money(a.balance, a.currency, 0)}</span>
                  ${ui.statusPill(a.status)}
                </div>
              </div>`
            )
            .join('')}</div>`,
          foot: `<div class="row-between"><span class="xs">No live connection exists in this build. Adding one needs a backend with an MT5 bridge.</span>
            <button class="btn btn-sm" disabled>Connect</button></div>`,
        })}

        <div class="grid g2">
          ${ui.panel({
            title: 'Appearance',
            body: `<div class="col" style="gap:12px">
              ${ui.field({ label: 'Theme', id: 's-theme', value: s.theme, options: [{ value: 'dark', label: 'Graphite (dark)' }, { value: 'light', label: 'Paper (light)' }] })}
              ${ui.toggle({ label: 'Collapse the sidebar', id: 's-rail', checked: s.railMini })}
              <p class="xs dim">Keyboard: <kbd>Ctrl</kbd>+<kbd>K</kbd> opens the command palette.</p>
            </div>`,
          })}
          ${ui.panel({
            title: 'Access',
            body: `<div class="col" style="gap:10px">
              <p class="sm muted">The passphrase is a local convenience lock, not encryption. Anyone with access to this browser profile can read the data.</p>
              <div class="row" style="gap:8px;flex-wrap:wrap">
                <button class="btn btn-sm" data-act="relock">${icon('lock')}Lock now</button>
                <button class="btn btn-sm" data-act="change">Change passphrase</button>
              </div>
            </div>`,
          })}
        </div>

        <section class="panel" id="data">
          <div class="panel-head"><h2>Your data</h2><div class="right"><span class="chip chip-teal">local-only</span></div></div>
          <div class="panel-body" style="display:grid;gap:12px">
            <p class="sm muted">Nothing is uploaded. Export a copy before clearing browser data or switching machines.</p>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm" data-act="export">${icon('download')}Export everything</button>
              <label class="btn btn-sm" style="cursor:pointer">${icon('upload')}Import backup<input type="file" id="s-import" accept="application/json" hidden></label>
              <button class="btn btn-sm" data-act="demo">Reload sample data</button>
              <button class="btn btn-sm btn-danger" data-act="wipe">${icon('trash')}Delete everything</button>
            </div>
            <div class="card" style="background:var(--panel-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:12px">
              <div class="grid g4" style="gap:10px">
                ${[
                  ['Trades', Store.get(KEYS.trades, []).length],
                  ['Strategies', Store.get(KEYS.strategies, []).length],
                  ['Notes', Store.get(KEYS.notes, []).length],
                  ['Storage', sizeKB + ' KB'],
                ]
                  .map(([k, v]) => `<div><div class="label">${k}</div><div class="mono sm" style="margin-top:2px">${v}</div></div>`)
                  .join('')}
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>About this build</h2></div>
          <div class="panel-body">
            <p class="sm muted">
              PipSage Desk v2 — a single-user trading workspace. No plans, no paywalls, no seats:
              every module is available because there is only one user. Static files, no dependencies,
              no analytics, no cookies. Market prices and backtests run on deterministic sample data;
              your journal, notes and strategies are real and stored locally.
            </p>
          </div>
        </section>
      </div>`;

    root.querySelector('[data-act="save"]').addEventListener('click', () => {
      const next = PS.saveSettings({
        name: root.querySelector('#s-name').value.trim() || 'Trader',
        currency: root.querySelector('#s-ccy').value,
        startingBalance: Number(root.querySelector('#s-bal').value) || 10000,
        timezone: root.querySelector('#s-tz').value,
        riskPerTrade: Number(root.querySelector('#s-risk').value) || 1.25,
        maxOpenPositions: Number(root.querySelector('#s-maxpos').value) || 3,
        dailyLossLimit: Number(root.querySelector('#s-daily').value) || 4,
        maxSpread: Number(root.querySelector('#s-spread').value) || 25,
        newsBlackout: root.querySelector('#s-news').checked,
        theme: root.querySelector('#s-theme').value,
        railMini: root.querySelector('#s-rail').checked,
      });
      document.documentElement.setAttribute('data-theme', next.theme);
      PS.toast('Settings saved');
      PS.pages.settings(root);
    });

    root.querySelector('[data-act="relock"]').addEventListener('click', async () => {
      if (!(await PS.confirm('Lock the desk? You will need the passphrase to get back in.', { confirmLabel: 'Lock' }))) return;
      PS.Store.del(KEYS.gate);
      location.reload();
    });

    root.querySelector('[data-act="change"]').addEventListener('click', () => {
      PS.Store.del(KEYS.gate);
      PS.toast('Locked — reload to set a new passphrase');
      setTimeout(() => location.reload(), 900);
    });

    root.querySelector('[data-act="export"]').addEventListener('click', () => {
      const payload = { app: 'PipSage Desk', version: 2, exported: new Date().toISOString(), data: PS.Store.all() };
      ui.download('pipsage-desk-' + PS.isoDate(Date.now()) + '.json', JSON.stringify(payload, null, 2));
      PS.toast('Backup downloaded');
    });

    root.querySelector('#s-import').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          PS.Store.load(JSON.parse(fr.result));
          PS.toast('Backup restored');
          setTimeout(() => location.reload(), 700);
        } catch (err) {
          PS.toast('Could not read that file', 'err');
        }
      };
      fr.readAsText(f);
    });

    root.querySelector('[data-act="demo"]').addEventListener('click', async () => {
      if (!(await PS.confirm('Reset to the sample data? Your own entries will be replaced.', { danger: true, confirmLabel: 'Reset' }))) return;
      PS.Store.wipe();
      PS.seed();
      location.reload();
    });

    root.querySelector('[data-act="wipe"]').addEventListener('click', async () => {
      if (!(await PS.confirm('Delete every trade, note, strategy and setting on this device? This cannot be undone. Demo data will not be reseeded; use Reload sample data if you want it back.', { danger: true, confirmLabel: 'Delete everything' }))) return;
      PS.Store.wipe();
      PS.Store.set(KEYS.seedDisabled, true);
      location.reload();
    });
  };
})();
