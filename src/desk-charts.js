/* ==========================================================================
   PipSage Desk — chart engine
   Canvas candlestick / line / area / bar chart with overlays, volume,
   crosshair readout, wheel zoom and drag pan. No dependencies.
   ========================================================================== */
(function () {
  'use strict';
  const PS = window.PS;
  const { clamp, fmt, Ind } = PS;

  const C = {
    up: '#3fd68b',
    down: '#f2555a',
    grid: 'rgba(255,255,255,0.055)',
    axis: '#737b86',
    amber: '#f5a524',
    teal: '#2dd4bf',
    blue: '#5b9dff',
    violet: '#9b7bff',
    red: '#f2555a',
    cross: 'rgba(255,255,255,0.28)',
  };
  PS.CHART_COLOURS = C;

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  class Chart {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = Object.assign(
        {
          type: 'candles',      // candles | line | area | bars
          height: 320,
          padding: { top: 12, right: 62, bottom: 22, left: 8 },
          pane: null,           // null | 'rsi' | 'macd' | 'volume'
          showVolume: true,
          showAxis: true,
          levels: [],           // [{price, colour, label}]
          zones: [],            // [{from, to, colour, label}]
          overlays: [],         // [{type:'sma'|'ema'|'bb'|'vwap', period, colour, label}]
          markers: [],          // [{i, price, colour, label, shape}]
          zoom: true,
          pan: true,
          onHover: null,
        },
        opts
      );
      this.data = [];
      this.view = { start: 0, count: 0 };
      this.hover = null;
      this._bind();
      this._resize();
    }

    _bind() {
      const c = this.canvas;
      this._onMove = (e) => {
        const r = c.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        this.hover = { x, y };
        if (this._dragging && this.opts.pan) {
          const dx = x - this._dragX;
          const perBar = this._plotW / Math.max(1, this.view.count);
          const shift = Math.round(-dx / perBar);
          if (shift !== 0) {
            this.view.start = clamp(this._dragStart + shift, 0, Math.max(0, this.data.length - this.view.count));
            this._dragX = x;
            this._dragStart = this.view.start;
          }
        }
        this.draw();
        if (this.opts.onHover) {
          const idx = this._indexAt(x);
          this.opts.onHover(idx >= 0 ? this.data[idx] : null, idx);
        }
      };
      this._onLeave = () => { this.hover = null; this.draw(); if (this.opts.onHover) this.opts.onHover(null, -1); };
      this._onDown = (e) => {
        if (!this.opts.pan) return;
        this._dragging = true;
        this._dragX = e.clientX - c.getBoundingClientRect().left;
        this._dragStart = this.view.start;
        c.style.cursor = 'grabbing';
      };
      this._onUp = () => { this._dragging = false; c.style.cursor = this.opts.zoom ? 'crosshair' : 'default'; };
      this._onWheel = (e) => {
        if (!this.opts.zoom || !this.data.length) return;
        e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;
        const cur = this.view.count;
        const next = clamp(Math.round(cur * (dir > 0 ? 1.18 : 0.85)), 18, this.data.length);
        const r = c.getBoundingClientRect();
        const rel = clamp((e.clientX - r.left - this.opts.padding.left) / Math.max(1, this._plotW), 0, 1);
        const anchor = this.view.start + rel * cur;
        this.view.count = next;
        this.view.start = clamp(Math.round(anchor - rel * next), 0, Math.max(0, this.data.length - next));
        this.draw();
      };

      c.addEventListener('mousemove', this._onMove);
      c.addEventListener('mouseleave', this._onLeave);
      c.addEventListener('mousedown', this._onDown);
      window.addEventListener('mouseup', this._onUp);
      c.addEventListener('wheel', this._onWheel, { passive: false });
      c.addEventListener('touchstart', (e) => { this._touch = e.touches[0].clientX; }, { passive: true });
      c.addEventListener('touchmove', (e) => {
        if (!this.opts.pan || !this._touch) return;
        const dx = e.touches[0].clientX - this._touch;
        const perBar = this._plotW / Math.max(1, this.view.count);
        this.view.start = clamp(this.view.start - Math.round(dx / perBar), 0, Math.max(0, this.data.length - this.view.count));
        this._touch = e.touches[0].clientX;
        this.draw();
      }, { passive: true });
      c.style.cursor = this.opts.zoom ? 'crosshair' : 'default';
    }

    setData(data, { resetView = true } = {}) {
      this.data = data || [];
      if (resetView) {
        this.view.count = Math.min(this.opts.visible || this.data.length, this.data.length);
        this.view.start = Math.max(0, this.data.length - this.view.count);
      }
      this.draw();
      return this;
    }

    setOverlays(o) { this.opts.overlays = o || []; this.draw(); return this; }
    setLevels(l) { this.opts.levels = l || []; this.draw(); return this; }
    setZones(z) { this.opts.zones = z || []; this.draw(); return this; }
    setMarkers(m) { this.opts.markers = m || []; this.draw(); return this; }
    setPane(p) { this.opts.pane = p; this.draw(); return this; }

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width || this.canvas.clientWidth || 600;
      const h = this.opts.height;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._w = w;
      this._h = h;
    }

    resize() { this._resize(); this.draw(); return this; }

    _visible() {
      const s = clamp(this.view.start, 0, Math.max(0, this.data.length - 1));
      const e = Math.min(this.data.length, s + this.view.count);
      return this.data.slice(s, e);
    }

    _indexAt(x) {
      if (!this.data.length) return -1;
      const pad = this.opts.padding;
      const rel = (x - pad.left) / Math.max(1, this._plotW);
      if (rel < 0 || rel > 1) return -1;
      return clamp(Math.floor(this.view.start + rel * this.view.count), 0, this.data.length - 1);
    }

    draw() {
      const ctx = this.ctx;
      if (!ctx) return;
      this._resize();
      const { padding: pad } = this.opts;
      const W = this._w;
      const H = this._h;
      const paneH = this.opts.pane ? Math.round(H * 0.26) : this.opts.showVolume ? Math.round(H * 0.14) : 0;
      const mainH = H - paneH - pad.top - pad.bottom;
      this._plotW = W - pad.left - pad.right;
      this._plotH = mainH;

      ctx.clearRect(0, 0, W, H);

      const bars = this._visible();
      if (!bars.length) {
        ctx.fillStyle = cssVar('--ink-4', '#545b64');
        ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data for this instrument', W / 2, H / 2);
        return;
      }

      /* price range */
      let hi = -Infinity;
      let lo = Infinity;
      bars.forEach((b) => {
        hi = Math.max(hi, b.h);
        lo = Math.min(lo, b.l);
      });
      this.opts.levels.forEach((l) => {
        if (typeof l.price === 'number') { hi = Math.max(hi, l.price); lo = Math.min(lo, l.price); }
      });
      const padP = (hi - lo) * 0.08 || hi * 0.001;
      hi += padP;
      lo -= padP;

      const bw = this._plotW / bars.length;
      const x = (i) => pad.left + i * bw + bw / 2;
      const y = (p) => pad.top + ((hi - p) / (hi - lo)) * mainH;

      this._x = x; this._y = y; this._bw = bw; this._hi = hi; this._lo = lo;

      /* grid + axis labels */
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.font = '9.5px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      const rows = 5;
      const _lb0 = bars[bars.length - 1];
      const liveY = _lb0 ? y(_lb0.c) : -99;
      for (let i = 0; i <= rows; i++) {
        const yy = pad.top + (mainH / rows) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, Math.round(yy) + 0.5);
        ctx.lineTo(pad.left + this._plotW, Math.round(yy) + 0.5);
        ctx.stroke();
        if (this.opts.showAxis) {
          const val = hi - ((hi - lo) / rows) * i;
          ctx.fillStyle = C.axis;
          ctx.textAlign = 'left';
          if (Math.abs(yy - liveY) > 13) ctx.fillText(fmt(val, PS.decimals(val)), pad.left + this._plotW + 7, yy);
        }
      }

      /* time labels */
      if (this.opts.showAxis) {
        ctx.fillStyle = C.axis;
        ctx.textAlign = 'center';
        const step = Math.max(1, Math.floor(bars.length / 6));
        for (let i = 0; i < bars.length; i += step) {
          const d = new Date(bars[i].t);
          ctx.fillText(
            d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            x(i),
            pad.top + mainH + 11
          );
        }
      }

      /* zones */
      this.opts.zones.forEach((z) => {
        const y1 = y(z.from);
        const y2 = y(z.to);
        ctx.fillStyle = z.colour || 'rgba(45,212,191,0.09)';
        ctx.fillRect(pad.left, Math.min(y1, y2), this._plotW, Math.abs(y2 - y1));
        ctx.strokeStyle = z.border || 'rgba(45,212,191,0.22)';
        ctx.strokeRect(pad.left + 0.5, Math.min(y1, y2) + 0.5, this._plotW - 1, Math.abs(y2 - y1) - 1);
        if (z.label) {
          ctx.fillStyle = z.labelColour || 'rgba(45,212,191,0.75)';
          ctx.font = '8.5px ui-monospace, monospace';
          ctx.textAlign = 'right';
          ctx.fillText(z.label, pad.left + this._plotW - 5, Math.min(y1, y2) + 8);
        }
      });

      /* series */
      const type = this.opts.type;
      if (type === 'candles' || type === 'bars') {
        bars.forEach((b, i) => {
          const up = b.c >= b.o;
          ctx.strokeStyle = up ? C.up : C.down;
          ctx.fillStyle = up ? C.up : C.down;
          const cx = x(i);
          if (type === 'candles') {
            ctx.beginPath();
            ctx.moveTo(Math.round(cx) + 0.5, y(b.h));
            ctx.lineTo(Math.round(cx) + 0.5, y(b.l));
            ctx.lineWidth = 1;
            ctx.stroke();
            const yo = y(Math.max(b.o, b.c));
            const yc = y(Math.min(b.o, b.c));
            const hgt = Math.max(1, yc - yo);
            ctx.fillRect(cx - Math.max(1, bw * 0.32), yo, Math.max(1.5, bw * 0.64), hgt);
          } else {
            ctx.fillRect(cx - Math.max(1, bw * 0.3), y(Math.max(b.o, b.c)), Math.max(1.5, bw * 0.6), Math.max(1, Math.abs(y(b.o) - y(b.c))));
          }
        });
      } else {
        const pts = bars.map((b, i) => [x(i), y(b.c)]);
        if (type === 'area') {
          const g = ctx.createLinearGradient(0, pad.top, 0, pad.top + mainH);
          g.addColorStop(0, 'rgba(245,165,36,0.26)');
          g.addColorStop(1, 'rgba(245,165,36,0.01)');
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pad.top + mainH);
          pts.forEach((p) => ctx.lineTo(p[0], p[1]));
          ctx.lineTo(pts[pts.length - 1][0], pad.top + mainH);
          ctx.closePath();
          ctx.fillStyle = g;
          ctx.fill();
        }
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.strokeStyle = C.amber;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      /* overlays */
      const closes = this.data.map((d) => d.c);
      const offset = this.view.start;
      this.opts.overlays.forEach((ov) => {
        let series = null;
        if (ov.type === 'sma') series = Ind.sma(closes, ov.period || 20);
        else if (ov.type === 'ema') series = Ind.ema(closes, ov.period || 21);
        else if (ov.type === 'vwap') series = Ind.vwap(this.data);
        else if (ov.type === 'bb') {
          const bb = Ind.bollinger(closes, ov.period || 20, 2);
          this._drawSeries(bb.upper.slice(offset, offset + bars.length), x, y, ov.colour || C.blue, 1, [3, 3]);
          this._drawSeries(bb.lower.slice(offset, offset + bars.length), x, y, ov.colour || C.blue, 1, [3, 3]);
          series = bb.mid;
        }
        if (series) this._drawSeries(series.slice(offset, offset + bars.length), x, y, ov.colour || C.amber, 1.4);
      });

      /* levels — the label sits on the axis, so it must not collide with the
         live price tag, which owns that space for ~16px around the last close */
      const lb = bars[bars.length - 1];
      const tagY = lb ? y(lb.c) : -99;
      this.opts.levels.forEach((l) => {
        if (typeof l.price !== 'number') return;
        const yy = Math.round(y(l.price)) + 0.5;
        if (yy < pad.top || yy > pad.top + mainH) return;
        ctx.strokeStyle = l.colour || C.amber;
        ctx.lineWidth = 1;
        ctx.setLineDash(l.dash || [4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, yy);
        ctx.lineTo(pad.left + this._plotW, yy);
        ctx.stroke();
        ctx.setLineDash([]);
        const label = l.label || fmt(l.price, PS.decimals(l.price));
        ctx.font = '9.5px ui-monospace, monospace';
        const w = ctx.measureText(label).width + 10;
        /* nudge below the live tag when the two would overlap */
        let ly = yy;
        if (Math.abs(yy - tagY) < 19) ly = tagY + (yy >= tagY ? 19 : -19);
        ly = Math.max(pad.top + 8, Math.min(pad.top + mainH - 8, ly));
        ctx.fillStyle = l.colour || C.amber;
        ctx.fillRect(pad.left + this._plotW + 3, ly - 7, w, 14);
        ctx.fillStyle = '#0a0b0d';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, pad.left + this._plotW + 8, ly);
      });

      /* price marker dot */
      const lastBar = bars[bars.length - 1];
      if (lastBar) {
        const cx = x(bars.length - 1);
        const cy = y(lastBar.c);
        ctx.beginPath();
        ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = C.amber;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245,165,36,0.18)';
        ctx.fill();
      }

      /* volume / pane */
      if (paneH > 0) {
        const pTop = pad.top + mainH + pad.bottom + 2;
        const pBot = H - 2;
        const pH = pBot - pTop;
        ctx.strokeStyle = C.grid;
        ctx.beginPath();
        ctx.moveTo(pad.left, pTop - 0.5);
        ctx.lineTo(pad.left + this._plotW, pTop - 0.5);
        ctx.stroke();

        if (this.opts.pane === 'rsi') {
          const rsi = Ind.rsi(this.data.map((d) => d.c), 14).slice(this.view.start, this.view.start + bars.length);
          [30, 50, 70].forEach((lvl) => {
            const yy = pTop + pH - (lvl / 100) * pH;
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(pad.left, yy);
            ctx.lineTo(pad.left + this._plotW, yy);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = C.axis;
            ctx.font = '8.5px ui-monospace, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(String(lvl), pad.left + this._plotW + 7, yy);
          });
          ctx.beginPath();
          let started = false;
          rsi.forEach((v, i) => {
            if (v == null) return;
            const yy = pTop + pH - (v / 100) * pH;
            if (!started) { ctx.moveTo(x(i), yy); started = true; } else ctx.lineTo(x(i), yy);
          });
          ctx.strokeStyle = C.violet;
          ctx.lineWidth = 1.3;
          ctx.stroke();
          ctx.fillStyle = C.axis;
          ctx.font = '9px ui-monospace, monospace';
          ctx.textAlign = 'left';
          ctx.fillText('RSI 14', pad.left + 3, pTop + 8);
        } else if (this.opts.pane === 'macd') {
          const m = Ind.macd(this.data.map((d) => d.c));
          const hist = m.hist.slice(this.view.start, this.view.start + bars.length);
          const vals = hist.filter((v) => v != null);
          const mx = Math.max(1, ...vals.map(Math.abs));
          const zero = pTop + pH / 2;
          hist.forEach((v, i) => {
            if (v == null) return;
            const hgt = (Math.abs(v) / mx) * (pH / 2 - 2);
            ctx.fillStyle = v >= 0 ? 'rgba(63,214,139,0.55)' : 'rgba(242,85,90,0.55)';
            ctx.fillRect(x(i) - Math.max(1, bw * 0.28), v >= 0 ? zero - hgt : zero, Math.max(1.4, bw * 0.56), hgt);
          });
          [m.line, m.signal].forEach((s, k) => {
            const sl = s.slice(this.view.start, this.view.start + bars.length);
            ctx.beginPath();
            let st = false;
            sl.forEach((v, i) => {
              if (v == null) return;
              const yy = zero - (v / mx) * (pH / 2 - 2);
              if (!st) { ctx.moveTo(x(i), yy); st = true; } else ctx.lineTo(x(i), yy);
            });
            ctx.strokeStyle = k ? C.amber : C.teal;
            ctx.lineWidth = 1.1;
            ctx.stroke();
          });
        } else {
          /* volume */
          const vmax = Math.max(...bars.map((b) => b.v || 1));
          bars.forEach((b, i) => {
            const hgt = ((b.v || 0) / vmax) * (pH - 4);
            const up = b.c >= b.o;
            ctx.fillStyle = up ? 'rgba(63,214,139,0.34)' : 'rgba(242,85,90,0.34)';
            ctx.fillRect(x(i) - Math.max(1, bw * 0.3), pBot - hgt, Math.max(1.4, bw * 0.6), hgt);
          });
        }
      }

      /* markers */
      this.opts.markers.forEach((m) => {
        const idx = m.i - this.view.start;
        if (idx < 0 || idx >= bars.length) return;
        const cx = x(idx);
        const cy = y(m.price);
        ctx.beginPath();
        if (m.shape === 'up') {
          ctx.moveTo(cx, cy - 7);
          ctx.lineTo(cx - 4, cy + 1);
          ctx.lineTo(cx + 4, cy + 1);
        } else {
          ctx.moveTo(cx, cy + 7);
          ctx.lineTo(cx - 4, cy - 1);
          ctx.lineTo(cx + 4, cy - 1);
        }
        ctx.closePath();
        ctx.fillStyle = m.colour || C.amber;
        ctx.fill();
      });

      /* crosshair */
      if (this.hover && this.hover.x >= pad.left && this.hover.x <= pad.left + this._plotW) {
        const hx = this.hover.x;
        const hy = clamp(this.hover.y, pad.top, pad.top + mainH);
        ctx.strokeStyle = C.cross;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(hx) + 0.5, pad.top);
        ctx.lineTo(Math.round(hx) + 0.5, pad.top + mainH);
        ctx.moveTo(pad.left, Math.round(hy) + 0.5);
        ctx.lineTo(pad.left + this._plotW, Math.round(hy) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);

        const price = hi - ((hy - pad.top) / mainH) * (hi - lo);
        const lbl = fmt(price, PS.decimals(price));
        ctx.font = '9.5px ui-monospace, monospace';
        const w = ctx.measureText(lbl).width + 10;
        ctx.fillStyle = cssVar('--panel-3', '#1b1f24');
        ctx.fillRect(pad.left + this._plotW + 3, hy - 8, w, 16);
        ctx.strokeStyle = C.cross;
        ctx.strokeRect(pad.left + this._plotW + 3.5, hy - 7.5, w - 1, 15);
        ctx.fillStyle = cssVar('--ink', '#e9ebee');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(lbl, pad.left + this._plotW + 8, hy);

        const idx = this._indexAt(hx);
        if (idx >= 0) {
          const d = new Date(this.data[idx].t);
          const ts = d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          const tw = ctx.measureText(ts).width + 12;
          const cx2 = clamp(hx - tw / 2, pad.left, pad.left + this._plotW - tw);
          ctx.fillStyle = cssVar('--panel-3', '#1b1f24');
          ctx.fillRect(cx2, pad.top + mainH + 2, tw, 15);
          ctx.fillStyle = cssVar('--ink-2', '#a6adb7');
          ctx.textAlign = 'center';
          ctx.fillText(ts, cx2 + tw / 2, pad.top + mainH + 10);
        }
      }

      /* last price tag on axis */
      if (lastBar && this.opts.showAxis) {
        const cy = y(lastBar.c);
        if (cy > pad.top && cy < pad.top + mainH) {
          const lbl = fmt(lastBar.c, PS.decimals(lastBar.c));
          ctx.font = '9.5px ui-monospace, monospace';
          const w = ctx.measureText(lbl).width + 10;
          const up = lastBar.c >= lastBar.o;
          ctx.fillStyle = up ? C.up : C.down;
          ctx.fillRect(pad.left + this._plotW + 3, cy - 8, w, 16);
          ctx.fillStyle = '#0a0b0d';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(lbl, pad.left + this._plotW + 8, cy);
        }
      }
    }

    _drawSeries(series, x, y, colour, width, dash) {
      const ctx = this.ctx;
      ctx.beginPath();
      let started = false;
      series.forEach((v, i) => {
        if (v == null || !isFinite(v)) return;
        const yy = y(v);
        if (!started) { ctx.moveTo(x(i), yy); started = true; } else ctx.lineTo(x(i), yy);
      });
      ctx.strokeStyle = colour;
      ctx.lineWidth = width || 1.3;
      if (dash) ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  PS.Chart = Chart;

  /* helper: equity curve as SVG string (used in several pages) */
  PS.equitySvg = function (values, { w = 520, h = 150, colour = null, showZero = true, fill = true } = {}) {
    if (!values || values.length < 2) {
      return `<div class="empty">Not enough data yet.</div>`;
    }
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const pad = (max - min) * 0.12 || 1;
    const hi = max + pad;
    const lo = min - pad;
    const px = (i) => (i / (values.length - 1)) * w;
    const py = (v) => h - ((v - lo) / (hi - lo)) * h;
    const col = colour || (values[values.length - 1] >= 0 ? C.up : C.down);
    const line = values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
    const zeroY = py(0);
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">
      <defs><linearGradient id="eqg${Math.random().toString(36).slice(2, 7)}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${col}" stop-opacity=".26"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/>
      </linearGradient></defs>
      ${showZero ? `<line x1="0" x2="${w}" y1="${zeroY}" y2="${zeroY}" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 4"/>` : ''}
      ${fill ? `<path d="${line} L${w} ${h} L0 ${h} Z" fill="url(#eqg${'F'})" opacity=".85"/>` : ''}
      <path d="${line}" fill="none" stroke="${col}" stroke-width="1.7" stroke-linejoin="round"/>
    </svg>`.replace(`url(#eqgF)`, `url(#eqg${'x'})`);
  };

  /* simple sparkline */
  PS.sparkSvg = function (values, { w = 70, h = 20, colour } = {}) {
    if (!values || values.length < 2) return '';
    const max = Math.max(...values);
    const min = Math.min(...values);
    const px = (i) => (i / (values.length - 1)) * w;
    const py = (v) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
    const col = colour || (values[values.length - 1] >= values[0] ? C.up : C.down);
    return `<svg viewBox="0 0 ${w} ${h}" style="width:${w}px;height:${h}px" aria-hidden="true"><path d="${d}" fill="none" stroke="${col}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  };

  /* donut */
  PS.donutSvg = function (segments, { size = 132, thickness = 13 } = {}) {
    const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
    const r = (size - thickness) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circ = 2 * Math.PI * r;
    let acc = 0;
    const arcs = segments
      .map((s) => {
        const frac = Math.max(0, s.value) / total;
        const dash = frac * circ;
        const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.colour}"
          stroke-width="${thickness}" stroke-dasharray="${dash} ${circ - dash}"
          stroke-dashoffset="${-acc}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"/>`;
        acc += dash;
        return el;
      })
      .join('');
    return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="${thickness}"/>
      ${arcs}
    </svg>`;
  };

  /* horizontal bar list */
  PS.barListHtml = function (rows, { max = null, format = (v) => PS.signed(v, 2) } = {}) {
    const top = max || Math.max(1, ...rows.map((r) => Math.abs(r.value)));
    return rows
      .map(
        (r) => `<div style="display:grid;grid-template-columns:minmax(70px,1fr) 2.2fr auto;gap:10px;align-items:center;padding:5px 0">
          <span class="xs" style="color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${PS.esc(r.label)}</span>
          <span class="bar ${r.value >= 0 ? 'green' : 'red'}" style="height:5px"><i style="width:${clamp((Math.abs(r.value) / top) * 100, 2, 100)}%"></i></span>
          <span class="mono xs ${r.value >= 0 ? 'up' : 'dn'}" style="min-width:62px;text-align:right">${format(r.value)}</span>
        </div>`
      )
      .join('');
  };
})();
