// ---------- Shared ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DEG = 180 / Math.PI;

// Same logic as PID.py; dt is passed in instead of read from a StopWatch
class PID {
  constructor(Kp, Ki, Kd, maxOutput) {
    this.Kp = Kp; this.Ki = Ki; this.Kd = Kd; this.maxOutput = maxOutput;
    this.reset();
  }
  compute(setpoint, measurement, dt) {
    const error = setpoint - measurement;
    const P = this.Kp * error;
    const limit = this.Ki ? Math.abs(this.maxOutput / this.Ki) : 0;
    this.integral = clamp(this.integral + error * dt, -limit, limit);
    const I = this.Ki * this.integral;
    const D = dt > 0 ? this.Kd * (error - this.lastError) / dt : 0;
    this.lastError = error;
    this.terms = { P, I, D };
    return P + I + D;
  }
  reset() {
    this.integral = 0; this.lastError = 0; this.terms = { P: 0, I: 0, D: 0 };
    return 0;
  }
}

// Size the backing store to the on-screen (scaled) size, draw in CSS pixels
function fitCanvas(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const rect = canvas.getBoundingClientRect();
  const scale = (w ? rect.width / w : 1) * (window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(w * scale)), H = Math.max(1, Math.round(h * scale));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { ctx, w, h };
}

// Run fn(dt) every frame, only while the slide holding `el` is on screen
function animate(el, fn) {
  let raf = 0, last = 0;
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fn(dt);
    raf = requestAnimationFrame(frame);
  };
  Deck.on(el, {
    start() { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { cancelAnimationFrame(raf); },
  });
}

let audioCtx = null;
function tone(freq, ms) {
  audioCtx = audioCtx || new AudioContext();
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.value = 0.05;
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + ms / 1000);
}

// Text drawn on the canvases lives in #sim-text so it can be edited like the slides
const label = key => document.querySelector(`#sim-text [data-key="${key}"]`)?.textContent ?? key;

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const COLORS = {};
['--bg', '--panel', '--panel-2', '--line', '--text', '--muted', '--teal', '--amber', '--p', '--i', '--d', '--red']
  .forEach(n => { COLORS[n.slice(2)] = css(n); });

// ---------- Drone: hold a height against gravity ----------
class DroneSim {
  constructor(root) {
    this.root = root;
    this.world = root.querySelector('canvas.world');
    this.plot = root.querySelector('canvas.plot');
    this.pid = new PID(0, 0, 0, 25);
    this.target = 5;
    this.inputs = {};
    root.querySelectorAll('input[data-k]').forEach(inp => {
      this.inputs[inp.dataset.k] = inp;
      inp.addEventListener('input', () => this.readGains());
    });
    root.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => this.preset(b)));
    root.querySelector('[data-act=gust]').addEventListener('click', () => { this.v += (Math.random() < 0.5 ? -1 : 1) * 5; });
    root.querySelector('[data-act=reset]').addEventListener('click', () => this.reset());
    // Click the sky to move the target
    this.world.addEventListener('pointerdown', e => {
      const r = this.world.getBoundingClientRect();
      const py = (e.clientY - r.top) / r.height * this.world.clientHeight;
      const m = this.yToHeight(py, this.world.clientHeight);
      this.target = clamp(Math.round(m * 2) / 2, 1, 9.5);
    });
    this.readGains();
    this.reset();
    animate(root, dt => this.tick(dt));
  }

  // 0 m sits on the ground line, 10 m near the top edge
  heightToY(m, h) { const ground = h - 34; return ground - m * (ground - 24) / 10; }
  yToHeight(py, h) { const ground = h - 34; return (ground - py) / ((ground - 24) / 10); }

  readGains() {
    for (const k of ['Kp', 'Ki', 'Kd']) {
      const inp = this.inputs[k];
      this.pid[k] = parseFloat(inp.value);
      inp.closest('.slider').querySelector('output').textContent = parseFloat(inp.value).toFixed(1);
    }
  }

  preset(btn) {
    const [kp, ki, kd] = btn.dataset.preset.split(',');
    this.inputs.Kp.value = kp; this.inputs.Ki.value = ki; this.inputs.Kd.value = kd;
    this.readGains();
    this.root.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b === btn));
    this.root.querySelectorAll('.caption[data-for]').forEach(c => { c.hidden = c.dataset.for !== btn.dataset.preset; });
    this.reset();
  }

  reset() {
    this.h = 0; this.v = 0; this.u = 0; this.t = 0; this.nextCtl = 0; this.nextLog = 0;
    this.pid.reset();
    this.hist = [];
  }

  tick(dt) {
    const step = 0.002, ctl = 0.02;
    for (let s = 0; s < dt; s += step) {
      if (this.t >= this.nextCtl) {
        this.nextCtl += ctl;
        this.u = clamp(this.pid.compute(this.target, this.h, ctl), 0, 25);
      }
      const a = this.u - 9.81 - 0.15 * this.v;
      this.v += a * step;
      this.h += this.v * step;
      if (this.h < 0) { this.h = 0; this.v = Math.max(0, this.v); }
      this.t += step;
      if (this.t >= this.nextLog) {
        this.nextLog += 0.04;
        this.hist.push([this.t, this.h, this.target]);
        while (this.hist.length && this.hist[0][0] < this.t - 12) this.hist.shift();
      }
    }
    this.drawWorld();
    this.drawPlot();
    this.drawBars();
  }

  drawWorld() {
    const { ctx, w, h } = fitCanvas(this.world);
    const ground = h - 34;
    const y = m => this.heightToY(m, h);
    ctx.clearRect(0, 0, w, h);

    // height ruler
    ctx.font = '600 12px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    for (let m = 0; m <= 10; m += 2) {
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(0, y(m), 10, 1);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(m + ' m', 14, y(m) + 4);
    }
    ctx.fillStyle = '#20292e';
    ctx.fillRect(0, ground, w, h - ground);

    // target
    ctx.strokeStyle = COLORS.amber; ctx.setLineDash([8, 7]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(48, y(this.target)); ctx.lineTo(w, y(this.target)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.amber; ctx.textAlign = 'right';
    ctx.fillText(label('target'), w - 8, y(this.target) - 8);

    // drone
    const cx = w / 2 + 20, cy = y(this.h) - 14;
    const thrust = this.u / 25;
    ctx.fillStyle = `rgba(63,193,240,${0.15 + thrust * 0.5})`;
    for (const dx of [-34, 34]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx - 9, cy + 6); ctx.lineTo(cx + dx + 9, cy + 6); ctx.lineTo(cx + dx, cy + 8 + thrust * 46);
      ctx.fill();
    }
    ctx.strokeStyle = '#c8d2d8'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx - 34, cy); ctx.lineTo(cx + 34, cy); ctx.stroke();
    ctx.fillStyle = '#f2f3f1';
    ctx.fillRect(cx - 16, cy - 9, 32, 16);
    ctx.fillStyle = COLORS.teal;
    ctx.fillRect(cx - 16, cy - 9, 32, 5);
    const spin = Math.abs(Math.sin(this.t * 40)) * 0.8 + 0.2;
    ctx.fillStyle = '#9fb0b9';
    for (const dx of [-34, 34]) {
      ctx.beginPath(); ctx.ellipse(cx + dx, cy - 6, 20 * (this.u > 0.1 ? spin : 1), 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'left';
    ctx.font = '600 13px ui-monospace, Menlo, monospace';
    ctx.fillText(this.h.toFixed(1) + ' m', cx + 58, cy + 4);
  }

  drawPlot() {
    const { ctx, w, h } = fitCanvas(this.plot);
    const L = 44, R = 12, T = 14, B = 26;
    const x = t => L + (t - (this.t - 12)) / 12 * (w - L - R);
    const y = m => T + (1 - m / 10) * (h - T - B);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '600 12px ui-monospace, Menlo, monospace';
    for (let m = 0; m <= 10; m += 2) {
      ctx.fillStyle = COLORS.line; ctx.fillRect(L, y(m), w - L - R, 1);
      ctx.fillStyle = COLORS.muted; ctx.textAlign = 'right'; ctx.fillText(m, L - 8, y(m) + 4);
    }
    ctx.textAlign = 'left';
    ctx.fillText(label('time'), L, h - 7);
    const line = (k, color, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = dash ? 2 : 3; ctx.setLineDash(dash ? [8, 7] : []);
      ctx.beginPath();
      this.hist.forEach((p, n) => (n ? ctx.lineTo(x(p[0]), y(p[k])) : ctx.moveTo(x(p[0]), y(p[k]))));
      ctx.stroke(); ctx.setLineDash([]);
    };
    line(2, COLORS.amber, true);
    line(1, COLORS.teal, false);

    const err = this.target - this.h;
    const out = this.root.querySelector('[data-out=err]');
    if (out) out.textContent = (err >= 0 ? '+' : '') + err.toFixed(2) + ' m';
  }

  drawBars() {
    const t = this.pid.terms;
    const set = (key, value, centered) => {
      const bar = this.root.querySelector(`[data-bar=${key}]`);
      if (!bar) return;
      const fill = bar.querySelector('.fill');
      const frac = clamp(value / 25, -1, 1);
      if (centered) {
        fill.style.left = (50 + Math.min(0, frac) * 50) + '%';
        fill.style.width = Math.abs(frac) * 50 + '%';
      } else {
        fill.style.left = '0'; fill.style.width = clamp(frac, 0, 1) * 100 + '%';
      }
      bar.querySelector('output').textContent = value.toFixed(1);
    };
    set('P', t.P, true); set('I', t.I, true); set('D', t.D, true); set('U', this.u, false);
  }
}

// ---------- Robot twin: a model of the LEGO robot, side view ----------
// Model: inverted pendulum on wheels. dc() is treated as a speed command with a short lag,
// tilt() reports whole degrees, and the loop runs every wait(ms) + ~1 ms.
class RobotTwin {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    const ds = root.dataset;
    this.mode = ds.mode || 'cascade';                    // none | roll | cascade
    this.gains = (ds.gains || '22,140,0.22').split(',').map(Number);
    this.bias = parseFloat(ds.bias ?? '1');              // IMU's "90" is not quite the balance point
    this.battery = parseFloat(ds.battery ?? '1');
    this.waitMs = parseFloat(ds.wait ?? '10');
    this.L = 0.12; this.tau = 0.03; this.vmax = 0.9; this.r = 0.028;
    this.targetSpeed = 0;
    this.bindControls();
    this.reset();
    animate(root, dt => this.tick(dt));
  }

  // Buttons and sliders live anywhere on the twin's slide (one twin per slide)
  bindControls() {
    const scope = this.root.closest('.slide');
    const on = (sel, fn) => scope.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => fn(b)));
    on('[data-act=push-l]', () => this.push(-1));
    on('[data-act=push-r]', () => this.push(1));
    on('[data-act=reset]', () => this.reset());
    on('[data-set-mode]', b => {
      this.mode = b.dataset.setMode;
      this.speed.reset(); this.targetLean = 0;
      scope.querySelectorAll('[data-set-mode]').forEach(x => x.classList.toggle('on', x === b));
    });
    on('[data-act=beep-block]', () => { tone(520, 600); this.freezeUntil = this.t + 0.6; });
    on('[data-act=beep-free]', () => tone(520, 600));
    scope.querySelectorAll('[data-drive]').forEach(b => {
      const d = parseFloat(b.dataset.drive);
      b.addEventListener('pointerdown', () => { this.targetSpeed = d * 400; });
      ['pointerup', 'pointerleave'].forEach(ev => b.addEventListener(ev, () => { this.targetSpeed = 0; }));
    });
    scope.querySelectorAll('input[data-target]').forEach(inp => {
      const upd = () => {
        this[inp.dataset.target] = parseFloat(inp.value);
        const o = inp.closest('.slider')?.querySelector('output');
        if (o) o.textContent = inp.dataset.target === 'battery' ? Math.round(inp.value * 100) + '%' : inp.value;
      };
      inp.addEventListener('input', upd);
      upd();
    });
    this.canvas.addEventListener('pointerdown', e => {
      const r = this.canvas.getBoundingClientRect();
      this.push(e.clientX - r.left < r.width / 2 ? -1 : 1);
    });
    if (scope.querySelector('[data-drive]')) {
      const active = () => scope.classList.contains('active');
      addEventListener('keydown', e => {
        if (!active()) return;
        if (e.key === 'w' || e.key === 'W') this.targetSpeed = 400;
        if (e.key === 's' || e.key === 'S') this.targetSpeed = -400;
      });
      addEventListener('keyup', e => { if ('wWsS'.includes(e.key)) this.targetSpeed = 0; });
    }
  }

  reset() {
    this.th = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random()) / DEG;
    this.w = 0; this.x = 0; this.v = 0; this.u = 0; this.t = 0;
    this.nextCtl = 0; this.counter = 0; this.lastRoll = 0; this.lastSpeed = 0;
    this.active = false; this.targetLean = 0; this.freezeUntil = 0;
    this.fallenAt = null; this.camX = 0; this.wheel = 0; this.nextLog = 0;
    this.roll = new PID(...this.gains, 100);
    this.speed = new PID(0.006, 0.0014, 0.000005, 30);
    this.hist = [];
  }

  push(dir) { if (this.fallenAt === null) this.w += dir * 0.6; }

  control() {
    if (this.t < this.freezeUntil) return;           // blocked loop: motors keep the last power
    const lean = Math.round(this.th * DEG + this.bias);
    if (this.mode === 'none') { this.u = 0; return; }

    // Safety stop if robot falls
    if (Math.abs(lean) > 45) {
      this.u = this.roll.reset(); this.speed.reset(); this.targetLean = 0; this.active = false;
    }
    // Activate balance when upright
    if (Math.abs(lean) < 20) this.active = true;
    if (this.active) {
      this.u = clamp(-this.roll.compute(this.targetLean, lean, this.t - this.lastRoll), -100, 100);
    }
    this.lastRoll = this.t;

    this.counter = (this.counter + 1) % 10000;
    if (this.mode === 'cascade' && this.counter % 5 === 0) {
      const wheelSpeed = this.v / this.r * DEG;      // deg/s, like motor.speed()
      this.targetLean = clamp(this.speed.compute(this.targetSpeed, wheelSpeed, this.t - this.lastSpeed), -30, 30);
      this.lastSpeed = this.t;
    }
  }

  tick(dt) {
    const step = 0.0005, ctl = (this.waitMs + 1) / 1000;
    for (let s = 0; s < dt; s += step) {
      if (this.t >= this.nextCtl) { this.nextCtl = this.t + ctl; this.control(); }
      const a = (this.u / 100 * this.vmax * this.battery - this.v) / this.tau;
      const alpha = (9.81 * Math.sin(this.th) - a * Math.cos(this.th)) / this.L;
      this.v += a * step; this.x += this.v * step; this.wheel += this.v / this.r * step;
      this.w += alpha * step; this.th += this.w * step;
      if (Math.abs(this.th) >= 80 / DEG) {             // lying on the table
        this.th = Math.sign(this.th) * 80 / DEG; this.w = 0;
        if (this.fallenAt === null) this.fallenAt = this.t;
      }
      this.t += step;
      if (this.t >= this.nextLog) {
        this.nextLog += 0.03;
        this.hist.push([this.t, this.th * DEG]);
        while (this.hist.length && this.hist[0][0] < this.t - 6) this.hist.shift();
      }
    }
    // Someone picks it up and puts it back
    if (this.fallenAt !== null && this.t - this.fallenAt > 1.4) this.reset();
    this.draw();
  }

  draw() {
    const { ctx, w, h } = fitCanvas(this.canvas);
    const ground = h - 46;
    const s = Math.min((h - 110) / 0.27, w / 0.36);    // px per meter
    this.camX += (this.x - this.camX) * 0.08;
    const sx = mx => w / 2 + (mx - this.camX) * s;
    ctx.clearRect(0, 0, w, h);

    this.drawChart(ctx, w);

    // ground ruler
    ctx.fillStyle = '#20292e';
    ctx.fillRect(0, ground, w, h - ground);
    ctx.font = '600 12px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    const first = Math.floor((this.camX - w / 2 / s) / 0.05) * 0.05;
    for (let m = first; m < this.camX + w / 2 / s; m += 0.05) {
      const k = Math.round(m / 0.05);
      const major = k % 5 === 0;
      ctx.fillStyle = major ? COLORS.muted : COLORS.line;
      ctx.fillRect(sx(m), ground, 1.5, major ? 14 : 7);
      if (major) ctx.fillText(Math.round(k * 5) + ' cm', sx(m), ground + 30);
    }
    // start flag
    const fx = sx(0);
    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(fx - 1, ground - 70, 2, 70);
    ctx.beginPath(); ctx.moveTo(fx + 1, ground - 70); ctx.lineTo(fx + 30, ground - 61); ctx.lineTo(fx + 1, ground - 52); ctx.fill();

    this.drawRobot(ctx, sx(this.x), ground, s);

    // HUD
    ctx.textAlign = 'left';
    ctx.font = '600 14px ui-monospace, Menlo, monospace';
    ctx.fillStyle = COLORS.text;
    const lean = this.th * DEG;
    const pad = Math.max(...['lean', 'power', 'position'].map(k => label(k).length)) + 1;
    ctx.fillText(`${label('lean').padEnd(pad)}${lean >= 0 ? '+' : ''}${lean.toFixed(1)}°`, 14, 92);
    ctx.fillText(`${label('power').padEnd(pad)}${Math.round(this.u)}%`, 14, 112);
    ctx.fillText(`${label('position').padEnd(pad)}${(this.x * 100).toFixed(0)} cm`, 14, 132);
    ctx.fillStyle = COLORS['panel-2'];
    ctx.fillRect(14, 140, 120, 8);
    ctx.fillStyle = Math.abs(this.u) > 95 ? COLORS.red : COLORS.teal;
    const pw = this.u / 100 * 60;
    ctx.fillRect(74 + Math.min(0, pw), 140, Math.abs(pw), 8);

    const pill = (text, color) => {
      ctx.font = '700 16px ui-monospace, Menlo, monospace';
      const tw = ctx.measureText(text).width + 28;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.roundRect(w / 2 - tw / 2, 84, tw, 32, 16); ctx.fill();
      ctx.fillStyle = '#0d1114'; ctx.textAlign = 'center'; ctx.fillText(text, w / 2, 105);
    };
    if (this.fallenAt !== null) pill(label('fell'), COLORS.red);
    else if (this.t < this.freezeUntil) pill(label('blocked'), COLORS.amber);
  }

  drawChart(ctx, w) {
    const T = 12, H = 56, L = 14, R = 14;
    const y = deg => T + H / 2 - clamp(deg, -15, 15) / 15 * (H / 2);
    ctx.fillStyle = COLORS['panel-2'];
    ctx.fillRect(L, T, w - L - R, H);
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(L, y(0), w - L - R, 1);
    ctx.font = '600 11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = COLORS.muted; ctx.textAlign = 'left';
    ctx.fillText(label('chart'), L + 6, T + 13);
    ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 2;
    ctx.beginPath();
    this.hist.forEach((p, n) => {
      const px = L + (p[0] - (this.t - 6)) / 6 * (w - L - R);
      n ? ctx.lineTo(px, y(p[1])) : ctx.moveTo(px, y(p[1]));
    });
    ctx.stroke();
  }

  drawRobot(ctx, x, ground, s) {
    const r = this.r * s;
    ctx.save();
    ctx.translate(x, ground - r);

    // body, rotated around the axle
    ctx.save();
    ctx.rotate(this.th);
    const rect = (x0, y0, x1, y1, color) => { ctx.fillStyle = color; ctx.fillRect(x0 * s, -y1 * s, (x1 - x0) * s, (y1 - y0) * s); };
    rect(-0.013, 0.0, 0.013, 0.03, '#e7e9e6');        // motor, white end
    rect(-0.013, 0.03, 0.013, 0.075, '#8a9399');      // motor, grey body
    rect(-0.072, 0.118, -0.03, 0.128, '#15191b');     // black frame at the back
    rect(-0.03, 0.075, 0.0, 0.165, '#1aa0a6');        // hub, teal back
    rect(0.0, 0.075, 0.03, 0.165, '#f2f3f1');         // hub, white front
    rect(0.004, 0.105, 0.026, 0.135, '#ffd27a');      // LED matrix glow
    rect(-0.016, 0.165, -0.011, 0.188, '#d8dbd6');    // sensor posts
    rect(0.011, 0.165, 0.016, 0.188, '#d8dbd6');
    rect(-0.022, 0.188, 0.03, 0.214, '#f2f3f1');      // ultrasonic sensor
    ctx.fillStyle = '#15191b';
    ctx.beginPath(); ctx.arc(0.03 * s, -0.201 * s, 0.009 * s, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.restore();

    // wheel
    ctx.fillStyle = '#15191b';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2c3338';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#59646b'; ctx.lineWidth = Math.max(2, r * 0.14);
    for (let k = 0; k < 4; k++) {
      const a = this.wheel + k * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); ctx.stroke();
    }
    ctx.restore();
  }
}

document.querySelectorAll('.drone-sim').forEach(el => new DroneSim(el));
document.querySelectorAll('.twin').forEach(el => new RobotTwin(el));
