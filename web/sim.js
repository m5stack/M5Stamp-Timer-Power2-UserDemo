/* M5PM1 / Stamp Timer Power2 behaviour model (simulation).
 * Register map follows lib/M5PM1/src/M5PM1.h; behaviour follows the M5PM1 datasheet and schematic S021 V0.7.1. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let LANG = null;
try { LANG = localStorage.getItem('stp2-lang'); } catch (e) {}
if (LANG !== 'zh' && LANG !== 'en') LANG = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const T = (zh, en) => (LANG === 'zh' ? zh : en);
const hex = (v, n = 2) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(n, '0');

const WK = { TIM: 0, VIN: 1, PWRBTN: 2, RSTBTN: 3, CMDRST: 4, EXT: 5, INOUT: 6 };
const PWR_DEF = 0x17; // LED | LDO | DCDC | CHG
const VREF = 3300;

const gpioDef = () => ({ func: 0, mode: 0, out: 0, drv: 1, pull: 0 });
const freshRegs = () => ({
  pwr: PWR_DEF, hold: 0, lvp: 0x40, i2c: 0,
  gpio: [0, 1, 2, 3, 4].map(gpioDef), wake: [0, 0, 0, 0, 0], edge: [0, 0, 0, 0, 0],
  wakeSrc: 0, irq1: 0, irq2: 0, irq3: 0,
  btn1: 0x2A, btn2: 0, pwmFreq: 500, pwm: [{ duty: 0, en: 0, pol: 0 }, { duty: 0, en: 0, pol: 0 }],
  tim: { cnt: 0, act: 0, arm: 0 }, neoCnt: 0, neoRefresh: 0, neo: Array(32).fill(0),
});

const S = {
  vin: true, bat: true, ext: false, vbat: 3850, gnd: false,
  ain: [0, 1650, 1200], gext: [null, null, null, null, null],
  lastEvt: null, sys: 'none', lvpLatch: false, resetUntil: 0, bootLowUntil: 0, asleep: false, lastI2c: 0, flashI2c: 0,
  btn: { down: false, t0: 0, longFired: false, clicks: 0, timer: null },
  r: freshRegs(),
};
const lvpMv = () => Math.round(2000 + S.r.lvp * 7.8125);

function D() {
  const now = Date.now(), r = S.r;
  const inReset = now < S.resetUntil;
  const batOk = S.bat && S.vbat > 2300;
  const alive = S.sys !== 'none';
  const boostOn = alive && !inReset && !!(r.pwr & 8) && (S.vin || batOk);
  const extIn = S.ext && !boostOn;
  const int5 = S.vin || extIn;
  const vbus = int5 ? 4950 : batOk ? S.vbat - 40 : 0;
  const vbusOk = vbus > 2300;
  const rails = vbusOk && alive && !inReset;
  const chgEn = !!(r.pwr & 1);
  return {
    now, inReset, batOk, boostOn, extIn, int5, vbus, vbusOk,
    py: vbusOk ? Math.min(3300, vbus - 60) : 0,
    dcdc: rails && !!(r.pwr & 2), ldo: rails && !!(r.pwr & 4),
    chg: int5 && S.bat && chgEn && S.vbat < 4180, full: int5 && S.bat && chgEn && S.vbat >= 4180,
    ichg: S.gnd ? 650 : 180, running: S.sys === 'on' || S.sys === 'dl', bootLow: now < S.bootLowUntil,
    vext: boostOn ? 5050 : S.ext ? 5000 : 0,
  };
}

/* ---------- power state ---------- */
function coldBoot() {
  S.r = freshRegs();
  Object.assign(S, { lvpLatch: false, asleep: false, resetUntil: 0, bootLowUntil: 0 });
  if (!D().int5 && S.vbat < lvpMv()) { S.sys = 'off'; S.lvpLatch = true; return; }
  S.sys = 'on';
  S.r.wakeSrc |= 1 << (S.vin ? WK.VIN : WK.INOUT);
}
function physics() {
  const d = D();
  if (!d.vbusOk) { S.sys = 'none'; S.asleep = false; return; }
  if (S.sys === 'none') return coldBoot();
  if (d.running && !d.int5 && S.bat && S.vbat < lvpMv()) {
    shutdown(); S.lvpLatch = true; toast(T('电池低压，自动关机', 'Low battery: powered off'));
  } else if (S.sys === 'off' && S.lvpLatch && (d.int5 || S.vbat >= lvpMv() + 100)) {
    S.lvpLatch = false; powerOn(d.int5 ? (S.vin ? WK.VIN : WK.INOUT) : null);
  }
}
function powerOn(bit) {
  S.sys = 'on'; S.asleep = false;
  if (bit != null) S.r.wakeSrc |= 1 << bit;
  S.r.pwr = (PWR_DEF & ~1) | (S.r.pwr & 1) | (S.r.pwr & 8 && S.r.hold & 0x40 ? 8 : 0);
}
function shutdown() {
  const r = S.r;
  S.sys = 'off'; S.asleep = false;
  let p = r.pwr & 1; // charging is not affected by power-off
  if (r.hold & 0x20) p |= r.pwr & 4;
  if (r.hold & 0x40) p |= r.pwr & 8;
  r.pwr = p;
  for (let i = 0; i < 5; i++) if (!(r.hold & (1 << i))) r.gpio[i] = gpioDef();
  if (!(r.hold & 1)) r.neoRefresh = 0;
}
function doReset(dl, bit) {
  const r = S.r, now = Date.now();
  r.hold = 0; r.gpio = [0, 1, 2, 3, 4].map(gpioDef); r.neoRefresh = 0;
  r.pwr = (PWR_DEF & ~1) | (r.pwr & 1);
  S.resetUntil = now + 500; S.asleep = false;
  if (dl) { S.sys = 'dl'; S.bootLowUntil = now + 1000; r.tim.arm = 0; } else { S.sys = 'on'; S.bootLowUntil = 0; }
  if (bit != null) r.wakeSrc |= 1 << bit;
}

/* ---------- IRQ / GPIO ---------- */
const anyIrqPin = () => S.r.gpio.some(g => g.func === 1);
const irq3Val = () => (anyIrqPin() ? S.r.irq3 | (S.r.wakeSrc ? 2 : 0) : 0);
const irqActive = () => anyIrqPin() && !!((S.r.irq1 & 0x1f) || S.r.irq2 || irq3Val());
function irqSet(reg, bit) { if (anyIrqPin() && D().running) S.r[reg] |= 1 << bit; }

const pwmActive = ch => { const g = S.r.gpio[3 + ch]; return D().running && g.func === 3 && S.r.pwm[ch].en && g.drv === 0; };
const neoActive = () => { const g = S.r.gpio[0]; return D().running && g.func === 3 && g.drv === 0 && S.r.neoCnt > 0 && S.r.neoRefresh; };

function pinLevel(i) {
  if (!D().vbusOk) return 'z';
  const g = S.r.gpio[i];
  const pulled = g.pull === 1 ? 1 : g.pull === 2 ? 0 : 'z';
  if (g.func === 1) return irqActive() ? 0 : S.gext[i] ?? (pulled === 'z' ? 1 : pulled);
  if (g.func === 3) {
    if (i === 0) return neoActive() ? 'neo' : 'z';
    if (i >= 3) return pwmActive(i - 3) ? 'pwm' : 'z';
    return 'adc';
  }
  if (g.mode === 1) return g.out === 0 ? 0 : g.drv === 1 ? S.gext[i] ?? pulled : 1;
  return S.gext[i] ?? pulled;
}
const lvlNum = v => (v === 1 ? 1 : v === 0 ? 0 : null);

function setExt(i, v) {
  const before = lvlNum(pinLevel(i));
  S.gext[i] = v;
  const after = lvlNum(pinLevel(i));
  if (before === null || after === null || before === after) return;
  const r = S.r;
  if (S.sys === 'off' && r.wake[i] && !S.lvpLatch && (r.edge[i] === 1) === (after === 1)) {
    powerOn(WK.EXT); toast(T(`G${i} 唤醒开机`, `Woken by G${i}`));
  } else if (S.sys === 'on' && r.gpio[i].func === 0 && r.gpio[i].mode === 0) irqSet('irq1', i);
}

/* ---------- button ---------- */
const btnDbl = () => [125, 250, 500, 1000][(S.r.btn1 >> 5) & 3];
const btnLong = () => [1000, 2000, 3000, 4000][(S.r.btn1 >> 3) & 3];
function btnDown() { if (D().vbusOk) Object.assign(S.btn, { down: true, t0: Date.now(), longFired: false }); }
function btnUp() {
  if (!S.btn.down) return;
  S.btn.down = false;
  if (S.btn.longFired) return;
  S.btn.clicks++;
  clearTimeout(S.btn.timer);
  S.btn.timer = setTimeout(() => {
    const n = S.btn.clicks; S.btn.clicks = 0;
    n >= 2 ? onDouble() : onSingle();
    physics(); render();
  }, btnDbl() + 20);
}
function btnTick() {
  if (S.btn.down && !S.btn.longFired && Date.now() - S.btn.t0 >= btnLong()) {
    S.btn.longFired = true; S.btn.clicks = 0; clearTimeout(S.btn.timer);
    onLong(); physics(); render();
  }
}
// S.lastEvt = [gesture, result]; results: on, reset, off, dl, irq, locked, none
function onSingle(g = 'click') {
  if (S.sys === 'off') { if (!S.lvpLatch) powerOn(WK.PWRBTN); S.lastEvt = [g, S.lvpLatch ? 'none' : 'on']; return; }
  if (S.r.btn1 & 1) { irqSet('irq3', 0); S.lastEvt = [g, 'irq']; return; }
  doReset(false, WK.RSTBTN); S.lastEvt = [g, 'reset'];
}
function onDouble() {
  if (S.sys === 'off') return onSingle('double');
  if (S.r.btn2 & 1) { irqSet('irq3', 2); S.lastEvt = ['double', 'irq']; return; }
  shutdown(); S.lastEvt = ['double', 'off'];
}
function onLong() {
  if (S.sys === 'off') return onSingle('long');
  if (S.r.btn1 & 0x80) { S.lastEvt = ['long', 'locked']; return; }
  doReset(true, WK.RSTBTN); S.lastEvt = ['long', 'dl'];
}

/* ---------- timer ---------- */
let timAcc = 0;
const TIM_ACT = () => [T('停止', 'Stop'), T('置标志', 'Flag'), T('重启', 'Reboot'), T('开机', 'Power on'), T('关机', 'Power off')];
function timerTick(dt) {
  const t = S.r.tim;
  if (!t.arm || S.sys === 'dl' || !D().vbusOk) { timAcc = 0; return; }
  timAcc += dt;
  while (timAcc >= 1000 && t.arm) {
    timAcc -= 1000;
    if (t.cnt > 0) t.cnt--;
    if (t.cnt) continue;
    const a = t.act; t.arm = 0; t.act = 0;
    if (a === 1) S.r.wakeSrc |= 1 << WK.TIM;
    else if (a === 2) doReset(false, WK.TIM);
    else if (a === 3 && S.sys === 'off' && !S.lvpLatch) powerOn(WK.TIM);
    else if (a === 4 && S.sys === 'on') shutdown();
  }
}

function ledState() {
  const d = D(), now = d.now;
  if (!d.vbusOk || S.sys === 'none' || d.inReset) return false;
  if (S.sys === 'dl') return Math.floor(now / 500) % 2 === 0;
  if (S.sys === 'on' && anyIrqPin()) {
    if (S.r.btn2 & 1) return Math.floor(now / 100) % 2 === 0;
    if (S.r.btn1 & 1) return Math.floor(now / 200) % 2 === 0;
  }
  return S.sys === 'on' && !!(S.r.pwr & 0x10);
}
function sleepCheck() {
  const sl = S.r.i2c & 0x0f;
  if (sl && S.sys === 'on' && !pwmActive(0) && !pwmActive(1) && !S.asleep && Date.now() - S.lastI2c > sl * 1000) S.asleep = true;
}

/* ---------- register values ---------- */
const g5 = f => S.r.gpio.reduce((a, g, i) => a | (f(g, i) ? 1 << i : 0), 0);
const pp2 = (arr, n) => arr.slice(0, n).reduce((a, v, k) => a | (v << (2 * k)), 0);
const adcRaw = mv => Math.max(0, Math.min(4095, Math.round(mv * 4096 / VREF)));
function regVal(a) {
  const r = S.r, d = D();
  switch (a) {
    case 0x04: return (S.vin ? 1 : 0) | (S.ext && !d.boostOn ? 2 : 0) | (d.batOk ? 4 : 0);
    case 0x05: return r.wakeSrc;
    case 0x06: return r.pwr;
    case 0x07: return r.hold;
    case 0x08: return r.lvp;
    case 0x09: return r.i2c;
    case 0x10: return g5(g => g.mode);
    case 0x11: return g5(g => g.out);
    case 0x12: return g5((g, i) => pinLevel(i) === 1);
    case 0x13: return g5(g => g.drv);
    case 0x14: return pp2(r.gpio.map(g => g.pull), 4);
    case 0x15: return r.gpio[4].pull;
    case 0x16: return pp2(r.gpio.map(g => g.func), 4);
    case 0x17: return r.gpio[4].func;
    case 0x18: return r.wake.reduce((a, v, i) => a | (v << i), 0);
    case 0x19: return r.edge.reduce((a, v, i) => a | (v << i), 0);
    case 0x22: return d.batOk ? S.vbat : 0;
    case 0x24: return S.vin ? 5010 : 0;
    case 0x26: return d.vext;
    case 0x3C: return (r.tim.arm << 3) | r.tim.act;
    case 0x41: return anyIrqPin() ? r.irq2 : 0;
    case 0x42: return irq3Val();
    case 0x49: return r.btn1;
    case 0x4A: return r.btn2;
    case 0x50: return r.neoCnt | (r.neoRefresh ? 0x40 : 0);
    default: return 0;
  }
}

/* ---------- actions ---------- */
// Host-side I²C action. The first access after idle sleep only wakes the chip.
function act(fn) {
  if (!D().vbusOk) return toast(T('模组未上电', 'Module has no power'));
  if (S.asleep) { S.asleep = false; toast(T('首帧唤醒 M5PM1（NACK），已重试', 'First frame woke M5PM1 (NACK), retried')); }
  fn();
  S.lastI2c = Date.now(); S.flashI2c = S.lastI2c + 400;
  physics(); render();
}
function phys(fn) { fn(); physics(); render(); }

const A = {
  setVin(v) { phys(() => { if (S.vin === v) return; S.vin = v; irqSet('irq2', v ? 0 : 1); if (v && S.sys === 'off') { S.lvpLatch = false; powerOn(WK.VIN); } }); },
  setExt(v) {
    if (v && D().boostOn) return toast(T('正在输出 5V，先关闭升压', 'Boost is on, turn it off first'));
    phys(() => { if (S.ext === v) return; S.ext = v; if (!(S.r.pwr & 8)) irqSet('irq2', v ? 2 : 3); if (v && S.sys === 'off' && !(S.r.pwr & 8)) { S.lvpLatch = false; powerOn(WK.INOUT); } });
  },
  setBat(v) { phys(() => { if (S.bat === v) return; S.bat = v; if (!(S.r.pwr & 1)) irqSet('irq2', v ? 4 : 5); }); },
  setVbat(mv) { phys(() => (S.vbat = mv)); },
  setGnd(v) { phys(() => (S.gnd = v)); },
  pwrBit(bit, v) {
    if (bit === 8 && v && S.ext) { render(); return toast(T('口上已有外部 5V，不能开启升压', 'External 5V present, boost refused')); }
    act(() => (S.r.pwr = v ? S.r.pwr | bit : S.r.pwr & ~bit));
  },
  holdBit(bit, v) { act(() => (S.r.hold = v ? S.r.hold | bit : S.r.hold & ~bit)); },
  setLvp(v) { act(() => (S.r.lvp = v)); },
  sysCmd(cmd) {
    act(() => {
      if (cmd === 1) shutdown();
      else if (cmd === 2) doReset(false, WK.CMDRST);
      else if (S.r.btn1 & 0x80) toast(T('DL_LOCK 已锁定下载模式', 'Download mode locked (DL_LOCK)'));
      else doReset(true, WK.CMDRST);
    });
  },
  timer(sec, action) { act(() => { S.r.tim = { cnt: sec, act: action, arm: sec > 0 && action > 0 ? 1 : 0 }; timAcc = 0; }); },
  clearIrq() { act(() => { S.r.irq1 = S.r.irq2 = S.r.irq3 = 0; }); },
  clearWake(mask = 0x7f) { act(() => (S.r.wakeSrc &= ~mask)); },
  gpio(i, k, v) {
    if (k === 'func' && v === 1 && i === 1) return;
    act(() => (S.r.gpio[i][k] = v));
  },
  wake(i, v) {
    if (i === 1) return toast(T('G1 不支持唤醒', 'G1 cannot wake'));
    const partner = { 0: 2, 2: 0, 3: 4, 4: 3 }[i];
    if (v && S.r.wake[partner]) return toast(T(`G${partner} 已占用唤醒线（G${i}/G${partner} 二选一）`, `G${partner} already uses this wake line (G${i}/G${partner}: pick one)`));
    act(() => (S.r.wake[i] = v ? 1 : 0));
  },
  edge(i, v) { act(() => (S.r.edge[i] = v)); },
  pwm(ch, k, v) { act(() => (S.r.pwm[ch][k] = v)); },
  pwmFreq(f) { act(() => (S.r.pwmFreq = f)); },
  neo(cnt, colors) { act(() => { S.r.neoCnt = cnt; for (let k = 0; k < 32; k++) S.r.neo[k] = k < cnt ? colors[k % colors.length] : 0; S.r.neoRefresh = 1; }); },
  btn(k, v) { act(() => (k === 1 ? (S.r.btn1 = v) : (S.r.btn2 = v))); },
  i2c(v) { act(() => (S.r.i2c = v)); },
};

const rgb565 = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
const from565 = v => `rgb(${((v >> 11) & 31) * 8},${((v >> 5) & 63) * 4},${(v & 31) * 8})`;

let toastT;
function toast(msg) {
  const e = $('#toast'); if (!e) return;
  e.textContent = msg; e.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (e.hidden = true), 2200);
}
