/* Live M5PM1 bridge. Implements the data model expected by regs.js/info.js/ui.js,
 * but all state and operations come from the ESP32 HTTP API. */
'use strict';
const HARDWARE = true;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let LANG = null;
try { LANG = localStorage.getItem('stp2-lang'); } catch (e) {}
if (LANG !== 'zh' && LANG !== 'en') LANG = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const T = (zh, en) => (LANG === 'zh' ? zh : en);
const hex = (v, n = 2) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(n, '0');

const WK = { TIM: 0, VIN: 1, PWRBTN: 2, RSTBTN: 3, CMDRST: 4, EXT: 5, INOUT: 6 };
const VREF = 3300;
const R = new Uint8Array(256);
const HW = {
  connected: false, bus: 'M5_EXTERNAL', sda: -1, scl: -1, speed: 100000, vinMv: 0, vbatMv: 0, extMv: 0,
  powerSource: 3, vref: 3300, gpioIn: 0, btnPressed: false, tempC: 0, lastSeen: 0, error: '',
};
const S = {
  vin: false, bat: false, ext: false, vbat: 0, gnd: false, ain: [0, 0, 0], gext: [null, null, null, null, null],
  sys: 'none', lvpLatch: false, resetUntil: 0, bootLowUntil: 0, asleep: false, lastI2c: 0, flashI2c: 0,
  btn: { down: false, t0: 0, longFired: false, clicks: 0, timer: null }, btnFlag: 0, lastEvt: null,
  adcRes: 0, timLeft: 0, wdtLeft: 0, neoShown: [], neoRGB: [],
};

const bitOf = (a, n) => (R[a] >> n) & 1;
const fld = (a, lo, w) => (R[a] >> lo) & ((1 << w) - 1);
const gFuncAt = i => (i < 4 ? [0x16, 2 * i] : [0x17, 0]);
const gPullAt = i => (i < 4 ? [0x14, 2 * i] : [0x15, 0]);
const G = {
  func: i => fld(...gFuncAt(i), 2), pull: i => fld(...gPullAt(i), 2),
  mode: i => bitOf(0x10, i), out: i => bitOf(0x11, i), drv: i => bitOf(0x13, i),
  wake: i => bitOf(0x18, i), edge: i => bitOf(0x19, i), hold: i => bitOf(0x07, i),
};
const pwm = ch => { const hc = R[0x31 + 2 * ch]; return { duty12: R[0x30 + 2 * ch] | ((hc & 15) << 8), en: (hc >> 4) & 1, pol: (hc >> 5) & 1 }; };
const pwmPct = ch => Math.round(pwm(ch).duty12 * 100 / 4095);
const pwmFreq = () => R[0x34] | (R[0x35] << 8);
const timCnt = () => R[0x38] | (R[0x39] << 8) | (R[0x3A] << 16) | ((R[0x3B] & 0x7F) << 24);
const lvpMv = () => Math.round(2000 + R[0x08] * 7.81);
const lvpReg = mv => Math.floor((mv - 2000) * 100 / 781);
const btnLong = () => [1000, 2000, 3000, 4000][(R[0x49] >> 3) & 3];
const ledState = () => !!(R[0x06] & 0x10);
const irqPending = () => !!((R[0x40] & ~R[0x43] & 0x1F) | (R[0x41] & ~R[0x44] & 0x3F) | (R[0x42] & ~R[0x45] & 0x07));
const pwmActive = ch => G.func(3 + ch) === 3 && pwm(ch).en && G.drv(3 + ch) === 0;
const neoActive = () => G.func(0) === 3 && G.drv(0) === 0 && (R[0x50] & 63) > 0;

function D() {
  const batOk = HW.vbatMv > 2300;
  const boostOn = !!(R[0x06] & 8);
  const extIn = !boostOn && HW.extMv > 2500;
  const int5 = HW.vinMv > 2500 || extIn;
  const vbus = Math.max(HW.vinMv, extIn ? HW.extMv : 0, batOk ? HW.vbatMv : 0);
  const vbusOk = HW.connected && vbus > 2300;
  return {
    now: Date.now(), inReset: false, batOk, boostOn, extIn, int5, vbus, vbusOk,
    py: vbusOk ? 3300 : 0, dcdc: vbusOk && !!(R[0x06] & 2), ldo: vbusOk && !!(R[0x06] & 4),
    chg: int5 && batOk && !!(R[0x06] & 1) && HW.vbatMv < 4180, full: int5 && batOk && !!(R[0x06] & 1) && HW.vbatMv >= 4180,
    ichg: S.gnd ? 650 : 180, running: HW.connected, bootLow: false,
    vext: boostOn ? HW.extMv : (extIn ? HW.extMv : 0), vin: HW.vinMv,
  };
}

function pinLevel(i) {
  const actual = (HW.gpioIn >> i) & 1;
  const f = G.func(i);
  if (f === 0 && G.mode(i) === 1) return G.out(i);
  if (f === 3) {
    if (i === 0 && neoActive()) return 'neo';
    if (i === 3 || i === 4) return pwmActive(i - 3) ? 'pwm' : 'z';
    if (i === 1 || i === 2) return 'adc';
  }
  return actual ? 1 : 0;
}

const from565 = v => `rgb(${((v >> 11) & 31) * 8},${((v >> 5) & 63) * 4},${(v & 31) * 8})`;
const rgb565 = (r, g, b) => ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
function regRead(a) { return R[a] || 0; }
const reg16 = a => regRead(a) | (regRead(a + 1) << 8);

function applyState(j) {
  if (!j || !j.regs) return;
  R.fill(0);
  const raw = j.regs;
  for (let i = 0; i + 1 < raw.length && i / 2 < 256; i += 2) R[i / 2] = parseInt(raw.slice(i, i + 2), 16) || 0;
  HW.connected = !!j.connected; HW.error = j.error || '';
  HW.bus = j.bus || 'M5_EXTERNAL';
  HW.sda = j.sda; HW.scl = j.scl; HW.speed = j.speed;
  HW.vinMv = j.vinMv || 0; HW.vbatMv = j.vbatMv || 0; HW.extMv = j.extMv || 0;
  HW.powerSource = j.powerSource ?? 3; HW.vref = j.vref || 3300;
  HW.gpioIn = j.gpioIn || 0; HW.btnPressed = !!j.btnPressed; HW.tempC = j.tempC || 0;
  HW.lastSeen = Date.now();
  S.vin = HW.vinMv > 2500;
  S.ext = HW.extMv > 2500;
  S.bat = HW.vbatMv > 2300;
  S.vbat = HW.vbatMv;
  S.sys = HW.connected ? 'on' : 'none';
  S.btn.down = HW.btnPressed;
  S.ain = [0, 0, 0];
  S.adcRes = reg16(0x28);
  S.timLeft = timCnt();
  const n = R[0x50] & 63;
  if (!n) S.neoShown = [];
  else if (!S.neoShown.length) S.neoShown = Array(n).fill(0x2104);
  updateHwBar();
}

function updateHwBar() {
  const bar = $('#hwBar'); if (!bar) return;
  bar.hidden = false;
  $('#hwState').textContent = HW.error ? T('M5PM1 通信异常', 'M5PM1 I/O error') : T('M5PM1 实时连接', 'M5PM1 live');
  $('#hwDot').className = 'dot' + (HW.error ? ' off' : '');
  $('#hwPins').innerHTML = `<b>${HW.bus}</b> · SDA <code>${HW.sda}</code> · SCL <code>${HW.scl}</code> · ${HW.speed / 1000}k`;
  const tele = [];
  if (HW.vinMv) tele.push(`5VIN ${(HW.vinMv / 1000).toFixed(2)}V`);
  if (HW.vbatMv) tele.push(`VBAT ${(HW.vbatMv / 1000).toFixed(2)}V`);
  if (HW.extMv) tele.push(`EXT ${(HW.extMv / 1000).toFixed(2)}V`);
  $('#hwTelemetry').textContent = tele.join(' · ');
}

let requestBusy = false, stateInFlight = false, pending = new Map(), seq = 0;
function stateFetch() {
  if (document.hidden || requestBusy || stateInFlight) return;
  stateInFlight = true;
  return fetch('/api/state', {cache: 'no-store'}).then(async r => {
    if (r.status === 409) { location.assign('/'); throw new Error('not connected'); }
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
    applyState(j);
    if (typeof render === 'function') render();
    return j;
  }).catch(e => {
    HW.connected = false; HW.error = e.message; updateHwBar();
    if (e.message !== 'not connected' && typeof toast === 'function') toast(T('连接中断：', 'Connection lost: ') + e.message);
  }).finally(() => { stateInFlight = false; });
}
async function post(fields) {
  while (stateInFlight) await new Promise(resolve => setTimeout(resolve, 30));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch('/api/op', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(fields), signal:ctl.signal});
    if (r.status === 409) { location.assign('/'); throw new Error('not connected'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
    if (j.state) { applyState(j.state); render(); }
    return j;
  } finally { clearTimeout(timer); }
}
function enqueue(fields, coalesceKey, after) {
  const key = coalesceKey || ('seq' + (++seq));
  pending.set(key, {fields, after});
  drain();
}
async function drain() {
  if (requestBusy) return;
  requestBusy = true;
  while (pending.size) {
    const [key, item] = pending.entries().next().value;
    pending.delete(key);
    try {
      await post(item.fields);
      if (item.after) item.after();
    } catch (e) { toast(e.name === 'AbortError' ? T('请求超时', 'Request timed out') : e.message); }
  }
  requestBusy = false;
}

const A = {
  setVin() { toast(T('5V_IN 是物理输入，不能由网页切换', '5V_IN is a physical input and cannot be toggled from the page')); },
  setExt() { toast(T('EXT_5V_INOUT 的输入状态来自实际测量', 'EXT_5V_INOUT input state comes from the hardware')); },
  setBat() { toast(T('电池接入状态来自实际测量', 'Battery presence comes from the hardware')); },
  setVbat() { toast(T('电池电压是实测值，不能由网页设置', 'Battery voltage is measured and cannot be set from the page')); },
  setGnd() { toast(T('CHG_PROG 是模组引脚的实际接线', 'CHG_PROG is determined by the module wiring')); },
  wr(a, v) {
    if (a === 0x0C && (v === 0xA1 || v === 0xA3) && !confirm(v === 0xA1 ? T('确认让 M5PM1 关机？控制台将断开。', 'Power off M5PM1? The console will disconnect.') : T('确认让主控进入下载模式？', 'Enter MCU download mode?'))) return;
    if (a === 0x49 && (v & 0x80) && !(R[0x49] & 0x80) && !confirm(T('锁定后将无法进入下载模式，必须断电才能解除。继续？', 'After locking, download mode is disabled until power is removed. Continue?'))) return;
    enqueue({op:'write', reg:a, value:v});
  },
  bit(a, n, v) {
    if (a === 0x49 && n === 7 && v && !confirm(T('锁定后将无法进入下载模式，必须断电才能解除。继续？', 'After locking, download mode is disabled until power is removed. Continue?'))) return;
    if (a === 0x06 && n === 1 && !v && !confirm(T('关闭 DCDC 可能让主控立即断电。继续？', 'Disabling DCDC may remove MCU power immediately. Continue?'))) return;
    const mask = 1 << n; enqueue({op:'field', reg:a, mask, value:v ? mask : 0});
  },
  fld(a, lo, w, v) {
    const mask = ((1 << w) - 1) << lo;
    const value = (v << lo) & mask;
    if (a === 0x06 && (mask & 0x02) && (R[0x06] & 0x02) && !(value & 0x02) && !confirm(T('关闭 DCDC 可能让主控立即断电。继续？', 'Disabling DCDC may remove MCU power immediately. Continue?'))) return;
    if (a === 0x49 && (mask & 0x80) && (value & 0x80) && !(R[0x49] & 0x80) && !confirm(T('锁定后将无法进入下载模式，必须断电才能解除。继续？', 'After locking, download mode is disabled until power is removed. Continue?'))) return;
    enqueue({op:'field', reg:a, mask, value});
  },
  gpio(i, k, v) {
    const after = k === 'func' || k === 'mode' ? () => { if (typeof buildPanel === 'function') { buildPanel(); if (typeof regAutoGroup === 'function') regAutoGroup(); } } : null;
    enqueue({op:'gpio', pin:i, kind:k, value:v}, null, after);
  },
  wake(i, v) { enqueue({op:'wake', pin:i, value:v ? 1 : 0}); },
  pwmDuty(ch, pct) { enqueue({op:'pwm_duty', ch, value:pct}, 'pwm_duty_' + ch); },
  pwmFreq(f) { enqueue({op:'pwm_freq', value:f}, 'pwm_freq'); },
  neo(n, colors) {
    const rgb = colors.map(c => c.join(',')).join(';');
    enqueue({op:'neo', count:n, colors:rgb});
  },
  neoOff() { enqueue({op:'neo_off'}); },
  timer(sec, action) {
    if (action === 4 && sec > 0 && !confirm(T('定时关机将让 M5PM1 在倒计时结束后断电。继续？', 'Timed power-off will cut M5PM1 power when the countdown ends. Continue?'))) return;
    enqueue({op:'timer', sec, action});
  },
  sysCmd(c) {
    const danger = c === 1 || c === 3;
    if (danger && !confirm(c === 1 ? T('确认让 M5PM1 关机？控制台将断开。', 'Power off M5PM1? The console will disconnect.') : T('确认让主控进入下载模式？', 'Enter MCU download mode?'))) return;
    enqueue({op:'sys', cmd:c});
  },
  clearIrq() { enqueue({op:'clear_irq'}); },
  lvp(mv) { enqueue({op:'lvp', value:mv}); },
  readAdc(ch) { enqueue({op:'adc', ch}); },
};

function act() { enqueue({op:'ping'}); }
function phys() {}
function physics() {}
function irqHousekeeping() {}
function btnTick() {}
function secTick() {}
function sleepCheck() {}
function btnDown() {}
function btnUp() {}
function resetAll() { stateFetch(); }
function hostWrite() { toast(T('请使用控制台中的操作', 'Use a control in the console')); }

let toastT;
function toast(msg) {
  const e = $('#toast'); if (!e) return;
  e.textContent = msg; e.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (e.hidden = true), 2800);
}

// Prefer an immediately useful bar before the first poll completes.
const initial = new URLSearchParams(location.search);
if (initial.has('sda')) { HW.sda = +initial.get('sda'); HW.scl = +initial.get('scl'); updateHwBar(); }
stateFetch();
setInterval(stateFetch, 1100);
