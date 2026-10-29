/* M5PM1 / Stamp Timer Power2 behaviour model (simulation).
 * Register map follows lib/M5PM1/src/M5PM1.h; behaviour follows the M5PM1 datasheet and schematic S021 V0.7.1.
 * The register file R is the single source of truth for everything the host can write. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let LANG = null;
try { LANG = localStorage.getItem('stp2-lang'); } catch (e) {}
if (LANG !== 'zh' && LANG !== 'en') LANG = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const T = (zh, en) => (LANG === 'zh' ? zh : en);
const hex = (v, n = 2) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(n, '0');

const WK = { TIM: 0, VIN: 1, PWRBTN: 2, RSTBTN: 3, CMDRST: 4, EXT: 5, INOUT: 6 };
const VREF = 3300;
const TEMP_C = 31;

/* ---------- register file ---------- */
const R = new Uint8Array(256);
const R_DEF = { 0x06: 0x17, 0x08: 0x40, 0x13: 0x1F, 0x34: 0xF4, 0x35: 0x01, 0x49: 0x2A };
// Writable bits per register; reserved bits read back as 0.
const WMASK = {
  0x06: 0x1F, 0x07: 0x7F, 0x09: 0x1F, 0x10: 0x1F, 0x11: 0x1F, 0x13: 0x3F, 0x15: 0x03, 0x17: 0x03, 0x18: 0x1F, 0x19: 0x1F,
  0x31: 0x3F, 0x33: 0x3F, 0x3B: 0x7F, 0x3C: 0x0F, 0x43: 0x1F, 0x44: 0x3F, 0x45: 0x07, 0x4A: 0x01, 0x50: 0x7F,
};
const READ_ONLY = new Set([0x00, 0x01, 0x02, 0x03, 0x04, 0x12, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x48]);
function resetRegs() { R.fill(0); for (const [a, v] of Object.entries(R_DEF)) R[a] = v; }

const bitOf = (a, n) => (R[a] >> n) & 1;
const fld = (a, lo, w) => (R[a] >> lo) & ((1 << w) - 1);
const put = (a, lo, w, v) => { const m = ((1 << w) - 1) << lo; R[a] = (R[a] & ~m) | ((v << lo) & m); };
const gFuncAt = i => (i < 4 ? [0x16, 2 * i] : [0x17, 0]);
const gPullAt = i => (i < 4 ? [0x14, 2 * i] : [0x15, 0]);
const G = {
  func: i => fld(...gFuncAt(i), 2), pull: i => fld(...gPullAt(i), 2),
  mode: i => bitOf(0x10, i), out: i => bitOf(0x11, i), drv: i => bitOf(0x13, i),
  wake: i => bitOf(0x18, i), edge: i => bitOf(0x19, i), hold: i => bitOf(0x07, i),
};
// Power-off / reset return a pin to input, open-drain, no pull, GPIO function. Wake config is kept.
function gpioDefault(i) { put(0x10, i, 1, 0); put(0x11, i, 1, 0); put(0x13, i, 1, 1); put(...gPullAt(i), 2, 0); put(...gFuncAt(i), 2, 0); }
const pwm = ch => { const hc = R[0x31 + 2 * ch]; return { duty12: R[0x30 + 2 * ch] | ((hc & 15) << 8), en: (hc >> 4) & 1, pol: (hc >> 5) & 1 }; };
const pwmPct = ch => Math.round(pwm(ch).duty12 * 100 / 4095);
const pwmFreq = () => R[0x34] | (R[0x35] << 8);
const timCnt = () => R[0x38] | (R[0x39] << 8) | (R[0x3A] << 16) | ((R[0x3B] & 0x7F) << 24);
const lvpMv = () => Math.round(2000 + R[0x08] * 7.81);
const lvpReg = mv => Math.floor((mv - 2000) * 100 / 781); // same formula as M5PM1::setBatteryLvp

/* ---------- simulation state (things the host cannot write) ---------- */
const S = {
  vin: true, bat: true, ext: false, vbat: 3850, gnd: false,
  ain: [0, 1650, 1200], gext: [null, null, null, null, null],
  sys: 'none', lvpLatch: false, resetUntil: 0, bootLowUntil: 0, asleep: false, lastI2c: 0, flashI2c: 0,
  btn: { down: false, t0: 0, longFired: false, clicks: 0, timer: null }, btnFlag: 0, lastEvt: null,
  adcRes: 0, timLeft: 0, wdtLeft: 0, neoShown: [], neoRGB: [],
};
const PHYS_DEF = { vin: true, bat: true, ext: false, vbat: 3850, gnd: false };

function D() {
  const now = Date.now(), p = R[0x06];
  const inReset = now < S.resetUntil;
  const batOk = S.bat && S.vbat > 2300;
  const alive = S.sys !== 'none';
  const boostOn = alive && !inReset && !!(p & 8) && (S.vin || batOk);
  const extIn = S.ext && !boostOn;
  const int5 = S.vin || extIn;
  const vbus = int5 ? 4950 : batOk ? S.vbat - 40 : 0;
  const vbusOk = vbus > 2300;
  const rails = vbusOk && alive && !inReset;
  const chgEn = !!(p & 1);
  return {
    now, inReset, batOk, boostOn, extIn, int5, vbus, vbusOk,
    py: vbusOk ? Math.min(3300, vbus - 60) : 0,
    dcdc: rails && !!(p & 2), ldo: rails && !!(p & 4),
    chg: int5 && S.bat && chgEn && S.vbat < 4180, full: int5 && S.bat && chgEn && S.vbat >= 4180,
    ichg: S.gnd ? 650 : 180, running: S.sys === 'on' || S.sys === 'dl', bootLow: now < S.bootLowUntil,
    vext: boostOn ? 5050 : S.ext ? 5000 : 0, vin: S.vin ? 5010 : 0,
  };
}

/* ---------- power state ---------- */
function coldBoot() {
  resetRegs();
  Object.assign(S, { lvpLatch: false, asleep: false, resetUntil: 0, bootLowUntil: 0, adcRes: 0, timLeft: 0, wdtLeft: 0, neoShown: [], neoRGB: [], btnFlag: 0 });
  if (!D().int5 && S.vbat < lvpMv()) { S.sys = 'off'; S.lvpLatch = true; return; }
  S.sys = 'on';
  R[0x05] |= 1 << (S.vin ? WK.VIN : WK.INOUT);
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
  if (bit != null) R[0x05] |= 1 << bit;
  R[0x06] = 0x16 | (R[0x06] & 0x09); // defaults back on; charge and a held boost keep their state
}
function shutdown() {
  // DCDC and LED turn off, charging is unaffected, HOLD_CFG decides LDO / boost / GPIO.
  let p = R[0x06] & 1;
  if (R[0x07] & 0x20) p |= R[0x06] & 4;
  if (R[0x07] & 0x40) p |= R[0x06] & 8;
  R[0x06] = p;
  for (let i = 0; i < 5; i++) if (!G.hold(i)) gpioDefault(i);
  S.sys = 'off'; S.asleep = false;
}
function doReset(dl, bit) {
  const now = Date.now();
  R[0x07] = 0;
  for (let i = 0; i < 5; i++) gpioDefault(i);
  R[0x06] = 0x16 | (R[0x06] & 1);
  S.resetUntil = now + 500; S.asleep = false;
  if (dl) {
    // Download mode also stops the user timer, the watchdog and idle sleep.
    S.sys = 'dl'; S.bootLowUntil = now + 1000;
    R[0x3C] = 0; S.timLeft = 0; R[0x0A] = 0; S.wdtLeft = 0; put(0x09, 0, 4, 0);
  } else { S.sys = 'on'; S.bootLowUntil = 0; }
  if (bit != null) R[0x05] |= 1 << bit;
}
function sysCmd(cmd) {
  if (cmd === 1) { if (D().running) shutdown(); }
  else if (cmd === 2) doReset(false, WK.CMDRST);
  else if (cmd === 3) { if (R[0x49] & 0x80) toast(T('DL_LOCK 已锁定下载模式', 'Download mode locked (DL_LOCK)')); else doReset(true, WK.CMDRST); }
}

/* ---------- IRQ ---------- */
const anyIrqPin = () => [0, 1, 2, 3, 4].some(i => G.func(i) === 1);
const irqPending = () => anyIrqPin() && !!((R[0x40] & ~R[0x43] & 0x1F) | (R[0x41] & ~R[0x44] & 0x3F) | (R[0x42] & ~R[0x45] & 0x07));
function irqSet(a, bit) { if (anyIrqPin() && D().running) R[a] |= 1 << bit; }
function irqHousekeeping() {
  if (!anyIrqPin()) { R[0x40] = R[0x41] = R[0x42] = 0; return; }
  if (R[0x05]) R[0x42] |= 2; // WAKEUP stays set until WAKE_SRC is cleared
}

/* ---------- GPIO ---------- */
const pwmActive = ch => D().running && G.func(3 + ch) === 3 && pwm(ch).en && G.drv(3 + ch) === 0;
const neoActive = () => D().running && G.func(0) === 3 && G.drv(0) === 0 && (R[0x50] & 63) > 0 && S.neoShown.length > 0;
function pinLevel(i) {
  if (!D().vbusOk) return 'z';
  const f = G.func(i), pulled = ['z', 1, 0, 'z'][G.pull(i)];
  if (f === 1) return irqPending() ? 0 : S.gext[i] ?? (pulled === 'z' ? 1 : pulled);
  if (f === 3) {
    if (i === 0) return neoActive() ? 'neo' : 'z';
    if (i >= 3) return pwmActive(i - 3) ? 'pwm' : 'z';
    return 'adc';
  }
  if (f === 2) return 'z';
  if (G.mode(i)) return G.out(i) === 0 ? 0 : G.drv(i) ? S.gext[i] ?? pulled : 1;
  return S.gext[i] ?? pulled;
}
const lvlNum = v => (v === 1 ? 1 : v === 0 ? 0 : null);
function setExt(i, v) {
  const before = lvlNum(pinLevel(i));
  S.gext[i] = v;
  const after = lvlNum(pinLevel(i));
  if (before === null || after === null || before === after) return;
  if (S.sys === 'off' && G.wake(i) && i !== 1 && !S.lvpLatch && (G.edge(i) === 1) === (after === 1)) {
    powerOn(WK.EXT); toast(T(`G${i} 唤醒开机`, `Woken by G${i}`));
  } else if (S.sys === 'on' && G.func(i) === 0 && G.mode(i) === 0) irqSet(0x40, i);
}

/* ---------- button ---------- */
const btnDbl = () => [125, 250, 500, 1000][(R[0x49] >> 5) & 3];
const btnLong = () => [1000, 2000, 3000, 4000][(R[0x49] >> 3) & 3];
function btnDown() { if (D().vbusOk) { Object.assign(S.btn, { down: true, t0: Date.now(), longFired: false }); S.btnFlag = 1; } }
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
  if (R[0x49] & 1) { irqSet(0x42, 0); S.lastEvt = [g, 'irq']; return; }
  doReset(false, WK.RSTBTN); S.lastEvt = [g, 'reset'];
}
function onDouble() {
  if (S.sys === 'off') return onSingle('double');
  if (R[0x4A] & 1) { irqSet(0x42, 2); S.lastEvt = ['double', 'irq']; return; }
  shutdown(); S.lastEvt = ['double', 'off'];
}
function onLong() {
  if (S.sys === 'off') return onSingle('long');
  if (R[0x49] & 0x80) { S.lastEvt = ['long', 'locked']; return; }
  doReset(true, WK.RSTBTN); S.lastEvt = ['long', 'dl'];
}

/* ---------- once-per-second: timer and watchdog ---------- */
const TIM_ACT = () => [T('停止', 'Stop'), T('置标志', 'Flag'), T('重启', 'Reboot'), T('开机', 'Power on'), T('关机', 'Power off')];
let secAcc = 0;
function secTick(dt) {
  if (!D().vbusOk) { secAcc = 0; return; }
  secAcc += dt;
  while (secAcc >= 1000) {
    secAcc -= 1000;
    if ((R[0x3C] & 8) && S.sys !== 'dl' && --S.timLeft <= 0) {
      const a = R[0x3C] & 7;
      R[0x3C] = 0; S.timLeft = 0;
      if (a === 1) R[0x05] |= 1 << WK.TIM;
      else if (a === 2) doReset(false, WK.TIM);
      else if (a === 3 && S.sys === 'off' && !S.lvpLatch) powerOn(WK.TIM);
      else if (a === 4 && S.sys === 'on') shutdown();
    }
    if (R[0x0A] && S.sys === 'on' && --S.wdtLeft <= 0) {
      doReset(false, null); S.wdtLeft = R[0x0A];
      toast(T('看门狗超时，系统复位', 'Watchdog timeout: reset'));
    }
  }
}

function ledState() {
  const d = D(), now = d.now;
  if (!d.vbusOk || S.sys === 'none' || d.inReset) return false;
  if (S.sys === 'dl') return Math.floor(now / 500) % 2 === 0;
  if (S.sys === 'on' && anyIrqPin()) {
    if (R[0x4A] & 1) return Math.floor(now / 100) % 2 === 0;
    if (R[0x49] & 1) return Math.floor(now / 200) % 2 === 0;
  }
  return S.sys === 'on' && !!(R[0x06] & 0x10);
}
function sleepCheck() {
  const sl = R[0x09] & 0x0F;
  if (sl && S.sys === 'on' && !pwmActive(0) && !pwmActive(1) && !S.asleep && Date.now() - S.lastI2c > sl * 1000) S.asleep = true;
}

/* ---------- register access as seen by the host ---------- */
const adcRaw = mv => Math.max(0, Math.min(4095, Math.round(mv * 4096 / VREF)));
function adcConvert() {
  const ch = (R[0x2A] >> 1) & 7;
  S.adcRes = ch === 6 ? TEMP_C : (ch === 1 || ch === 2) && G.func(ch) === 3 ? adcRaw(S.ain[ch]) : 0;
}
function regRead(a) {
  const d = D();
  const half = (v, hi) => (hi ? (v >> 8) & 0xFF : v & 0xFF);
  switch (a) {
    case 0x00: return 0x50;
    case 0x01: return 0x20;
    case 0x02: return 0x05;
    case 0x03: return 0x06;
    case 0x04: return (S.vin ? 1 : 0) | (S.ext && !d.boostOn ? 2 : 0) | (d.batOk ? 4 : 0);
    case 0x0B: case 0x0C: case 0x3D: return 0;
    case 0x12: return [0, 1, 2, 3, 4].reduce((m, i) => m | (pinLevel(i) === 1 ? 1 << i : 0), 0);
    case 0x20: case 0x21: return half(VREF, a & 1);
    case 0x22: case 0x23: return half(d.batOk ? S.vbat : 0, a & 1);
    case 0x24: case 0x25: return half(d.vin, a & 1);
    case 0x26: case 0x27: return half(d.vext, a & 1);
    case 0x28: case 0x29: return half(S.adcRes, a & 1);
    case 0x48: return (S.btn.down ? 1 : 0) | (S.btnFlag ? 0x80 : 0);
    default: return R[a];
  }
}
const reg16 = a => regRead(a) | (regRead(a + 1) << 8);

function hostWrite(a, v) {
  v &= 0xFF;
  if (READ_ONLY.has(a)) return;
  switch (a) {
    case 0x05: case 0x40: case 0x41: case 0x42: R[a] &= v; return; // write 0 clears, 1 keeps
    case 0x06:
      if (v & 8 && !(R[0x06] & 8) && S.ext) { toast(T('EXT_5V_INOUT 上有外部 5V，不能开升压', 'External 5V on EXT_5V_INOUT: boost refused')); v &= ~8; }
      R[0x06] = v & 0x1F; return;
    case 0x0A: R[0x0A] = v; S.wdtLeft = v; return;
    case 0x0B: if (v === 0xA5) S.wdtLeft = R[0x0A]; return;
    case 0x0C: if (v >> 4 === 0xA) sysCmd(v & 3); return;
    case 0x2A: R[0x2A] = v & 0x0E; if (v & 1) adcConvert(); return; // START self-clears
    case 0x3C:
      R[0x3C] = v & 0x0F;
      if (v & 8) { S.timLeft = timCnt(); if (!S.timLeft) R[0x3C] &= ~8; secAcc = 0; }
      return;
    case 0x3D: if (v === 0xA5) S.timLeft = timCnt(); return;
    case 0x49:
      // M5PM1::setDownloadLock: once locked, only a power cycle unlocks.
      if (R[0x49] & 0x80 && !(v & 0x80)) { toast(T('DL_LOCK 锁定后需断电才能解除', 'DL_LOCK stays set until power is removed')); v |= 0x80; }
      R[0x49] = v; return;
    case 0x50: {
      R[0x50] = v & 0x3F; // REFRESH self-clears
      const n = Math.min(32, v & 63);
      if (v & 0x40) S.neoShown = Array.from({ length: n }, (_, k) => R[0x60 + 2 * k] | (R[0x61 + 2 * k] << 8));
      else if (!n) S.neoShown = [];
      return;
    }
    default: R[a] = v & (WMASK[a] ?? 0xFF);
  }
}

/* Host-side I²C transaction. The first access after idle sleep only wakes the chip. */
function act(fn) {
  if (!D().vbusOk) return toast(T('模组未上电', 'Module has no power'));
  if (S.asleep) { S.asleep = false; toast(T('首帧唤醒 M5PM1（NACK），已重试', 'First frame woke M5PM1 (NACK), retried')); }
  fn();
  S.lastI2c = Date.now(); S.flashI2c = S.lastI2c + 400;
  physics(); render();
}
function phys(fn) { fn(); physics(); render(); }

const W = hostWrite;
const A = {
  setVin(v) { phys(() => { if (S.vin === v) return; S.vin = v; irqSet(0x41, v ? 0 : 1); if (v && S.sys === 'off') { S.lvpLatch = false; powerOn(WK.VIN); } }); },
  setExt(v) {
    if (v && D().boostOn) return toast(T('正在输出 5V，先关闭升压', 'Boost is on, turn it off first'));
    phys(() => { if (S.ext === v) return; S.ext = v; if (!(R[0x06] & 8)) irqSet(0x41, v ? 2 : 3); if (v && S.sys === 'off' && !(R[0x06] & 8)) { S.lvpLatch = false; powerOn(WK.INOUT); } });
  },
  setBat(v) { phys(() => { if (S.bat === v) return; S.bat = v; if (!(R[0x06] & 1)) irqSet(0x41, v ? 4 : 5); }); },
  setVbat(mv) { phys(() => (S.vbat = mv)); },
  setGnd(v) { phys(() => (S.gnd = v)); },
  wr(a, v) { act(() => W(a, v)); },
  bit(a, n, v) { act(() => W(a, v ? R[a] | (1 << n) : R[a] & ~(1 << n))); },
  fld(a, lo, w, v) { const m = ((1 << w) - 1) << lo; act(() => W(a, (R[a] & ~m) | ((v << lo) & m))); },
  gpio(i, k, v) {
    const [a, lo, w] = { func: [...gFuncAt(i), 2], pull: [...gPullAt(i), 2], mode: [0x10, i, 1], out: [0x11, i, 1], drv: [0x13, i, 1] }[k];
    A.fld(a, lo, w, v);
  },
  wake(i, v) {
    // Same rules as M5PM1::gpioSetWakeEnable
    if (i === 1) return toast(T('G1 不支持唤醒', 'G1 cannot wake'));
    const partner = { 0: 2, 2: 0, 3: 4, 4: 3 }[i];
    if (v && G.wake(partner)) return toast(T(`G${partner} 已占用这条唤醒线（G${i}/G${partner} 二选一）`, `G${partner} already uses this wake line (G${i}/G${partner}: pick one)`));
    A.bit(0x18, i, v);
  },
  pwmDuty(ch, pct) {
    const d = Math.floor(pct * 4095 / 100); // same as M5PM1::setPwmDuty
    act(() => { W(0x30 + 2 * ch, d & 0xFF); W(0x31 + 2 * ch, (R[0x31 + 2 * ch] & 0x30) | (d >> 8)); });
  },
  pwmFreq(f) { act(() => { W(0x34, f & 0xFF); W(0x35, f >> 8); }); },
  neo(n, colors) {
    act(() => {
      S.neoRGB = [];
      for (let k = 0; k < n; k++) {
        const c = colors[k % colors.length], v = rgb565(...c);
        S.neoRGB.push(c); W(0x60 + 2 * k, v & 0xFF); W(0x61 + 2 * k, v >> 8);
      }
      W(0x50, n | 0x40);
    });
  },
  neoOff() { act(() => { W(0x50, 0); S.neoRGB = []; }); },
  timer(sec, action) {
    act(() => { [0, 1, 2, 3].forEach(k => W(0x38 + k, (sec >> (8 * k)) & 0xFF)); W(0x3C, action ? 8 | action : 0); });
  },
  sysCmd(c) { act(() => W(0x0C, 0xA0 | c)); },
  clearIrq() { act(() => { W(0x40, 0); W(0x41, 0); W(0x42, 0); W(0x05, 0); }); },
  lvp(mv) { act(() => W(0x08, lvpReg(mv))); },
  readAdc(ch) { act(() => W(0x2A, (ch << 1) | 1)); },
};

const rgb565 = (r, g, b) => ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
const from565 = v => `rgb(${((v >> 11) & 31) * 8},${((v >> 5) & 63) * 4},${(v & 31) * 8})`;

function resetAll() {
  clearTimeout(S.btn.timer);
  Object.assign(S, PHYS_DEF, { ain: [0, 1650, 1200], gext: [null, null, null, null, null], sys: 'none', lastEvt: null });
  S.btn = { down: false, t0: 0, longFired: false, clicks: 0, timer: null };
  physics();
}

let toastT;
function toast(msg) {
  const e = $('#toast'); if (!e) return;
  e.textContent = msg; e.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (e.hidden = true), 2400);
}
