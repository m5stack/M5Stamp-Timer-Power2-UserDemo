/* Pin data, register layouts, per-pin content. */
'use strict';
const CLR = { gnd: 'var(--p-gnd)', pwr: 'var(--p-pwr)', i2c: 'var(--p-i2c)', int: 'var(--p-int)', wake: 'var(--p-wake)', gpio: 'var(--p-gpio)', ctl: 'var(--p-ctl)', adc: 'var(--p-adc)', pwm: 'var(--p-pwm)', neo: 'var(--p-neo)' };

// Physical order from the pinmap, top to bottom. Left = pins 1-14, right = pins 15-28.
const LEFT = [
  { n: 1, key: 'CHG_PROG', t: 'ctl' }, { n: 2, key: 'CHRG_STAT', t: 'ctl' }, { n: 3, key: 'PWR_BTN', t: 'ctl' },
  { n: 4, key: 'GND', t: 'gnd' }, { n: 5, key: 'BOOT_OUT', t: 'ctl' }, { n: 6, key: 'LED_PWR_EN', t: 'gpio' },
  { n: 7, key: 'G0', t: 'gpio', alt: [['INT', 'int'], ['NEOPIXEL', 'neo'], ['WAKE(0/2)', 'wake']] },
  { n: 8, key: 'G1', t: 'gpio', alt: [null, ['ADC1', 'adc'], null] },
  { n: 9, key: 'G2', t: 'gpio', alt: [['INT', 'int'], ['ADC2', 'adc'], ['WAKE(0/2)', 'wake']] },
  { n: 10, key: 'G3', t: 'gpio', alt: [['INT', 'int'], ['PWM1', 'pwm'], ['WAKE(3/4)', 'wake']] },
  { n: 11, key: 'G4', t: 'gpio', alt: [['INT', 'int'], ['PWM2', 'pwm'], ['WAKE(3/4)', 'wake']] },
  { n: 12, key: 'SDA', label: 'I2C_SDA', t: 'i2c' }, { n: 13, key: 'SCL', label: 'I2C_SCL', t: 'i2c' }, { n: 14, key: 'GND', t: 'gnd' },
];
const RIGHT = [
  { n: 15, key: 'GND', t: 'gnd' }, { n: 16, key: '5V_IN', t: 'pwr' }, { n: 17, key: 'GND', t: 'gnd' },
  { n: 18, key: 'EXT_5V_INOUT', t: 'pwr' }, { n: 19, key: 'GND', t: 'gnd' }, { n: 20, key: 'VBAT', t: 'pwr' },
  { n: 21, key: 'GND', t: 'gnd' }, { n: 22, key: 'PY_3V3_OUT', t: 'pwr' }, { n: 23, key: 'GND', t: 'gnd' },
  { n: 24, key: 'SYS_VBUS', t: 'pwr' }, { n: 25, key: 'GND', t: 'gnd' }, { n: 26, key: '3V3_DCDC_OUT', t: 'pwr' },
  { n: 27, key: 'GND', t: 'gnd' }, { n: 28, key: '3V3_LDO_OUT', t: 'pwr' },
];
const PINNUM = {};
[...LEFT, ...RIGHT].forEach(p => (PINNUM[p.key] = (PINNUM[p.key] || []).concat(p.n)));
const TAG = { pwr: ['电源', 'Power'], gnd: ['地', 'Ground'], i2c: ['I²C', 'I²C'], gpio: ['IO', 'IO'], ctl: ['控制', 'Control'] };

/* Register layouts from lib/M5PM1/src/M5PM1.h. Fields listed bit 7 → bit 0 as [name, width]; '-' = reserved. */
const G5 = [['-', 3], ['G4', 1], ['G3', 1], ['G2', 1], ['G1', 1], ['G0', 1]];
const REGDEF = {
  0x04: { n: 'PWR_SRC', f: [['-', 5], ['BAT', 1], ['INOUT', 1], ['VIN', 1]] },
  0x05: { n: 'WAKE_SRC', f: [['-', 1], ['INOUT', 1], ['EXT', 1], ['CMD', 1], ['RSTBTN', 1], ['PWRBTN', 1], ['VIN', 1], ['TIM', 1]] },
  0x06: { n: 'PWR_CFG', f: [['-', 3], ['LED', 1], ['BOOST', 1], ['LDO', 1], ['DCDC', 1], ['CHG', 1]] },
  0x07: { n: 'HOLD_CFG', f: [['-', 1], ['5V', 1], ['LDO', 1], ['G4', 1], ['G3', 1], ['G2', 1], ['G1', 1], ['G0', 1]] },
  0x08: { n: 'BATT_LVP', fmt: v => `${v} → ${lvpMv()} mV` },
  0x09: { n: 'I2C_CFG', f: [['-', 3], ['SPD', 1], ['SLP_TO', 4]] },
  0x10: { n: 'GPIO_MODE', f: G5 }, 0x11: { n: 'GPIO_OUT', f: G5 }, 0x12: { n: 'GPIO_IN', f: G5 },
  0x13: { n: 'GPIO_DRV', f: [['-', 2], ['LED', 1], ['G4', 1], ['G3', 1], ['G2', 1], ['G1', 1], ['G0', 1]] },
  0x14: { n: 'GPIO_PUPD0', f: [['G3', 2], ['G2', 2], ['G1', 2], ['G0', 2]] },
  0x15: { n: 'GPIO_PUPD1', f: [['-', 6], ['G4', 2]] },
  0x16: { n: 'GPIO_FUNC0', f: [['G3', 2], ['G2', 2], ['G1', 2], ['G0', 2]] },
  0x17: { n: 'GPIO_FUNC1', f: [['-', 6], ['G4', 2]] },
  0x18: { n: 'GPIO_WAKE_EN', f: G5 }, 0x19: { n: 'GPIO_WAKE_CFG', f: G5 },
  0x22: { n: 'VBAT', fmt: v => v + ' mV' }, 0x24: { n: 'VIN', fmt: v => v + ' mV' }, 0x26: { n: '5VINOUT', fmt: v => v + ' mV' },
  0x2A: { n: 'ADC_CTRL', f: [['-', 4], ['CH_SEL', 3], ['START', 1]], g: () => S.adcCh << 1 },
  0x28: { n: 'ADC_RES', fmt: () => String(S.adcRes) , g: () => S.adcRes },
  0x31: { n: 'PWM0_HC', f: [['-', 2], ['POL', 1], ['EN', 1], ['DUTY_H', 4]], g: () => pwmHC(0) },
  0x33: { n: 'PWM1_HC', f: [['-', 2], ['POL', 1], ['EN', 1], ['DUTY_H', 4]], g: () => pwmHC(1) },
  0x34: { n: 'PWM_FREQ', fmt: () => S.r.pwmFreq + ' Hz', g: () => S.r.pwmFreq },
  0x38: { n: 'TIM_CNT', fmt: () => S.r.tim.cnt + ' s', g: () => S.r.tim.cnt },
  0x3C: { n: 'TIM_CFG', f: [['-', 4], ['ARM', 1], ['ACTION', 3]] },
  0x40: { n: 'IRQ_STATUS1', f: G5, g: () => (anyIrqPin() ? S.r.irq1 : 0) },
  0x41: { n: 'IRQ_STATUS2', f: [['-', 2], ['BAT-', 1], ['BAT+', 1], ['IO-', 1], ['IO+', 1], ['VIN-', 1], ['VIN+', 1]] },
  0x42: { n: 'IRQ_STATUS3', f: [['-', 5], ['DOUBLE', 1], ['WAKE', 1], ['CLICK', 1]] },
  0x49: { n: 'BTN_CFG_1', f: [['DL_LOCK', 1], ['DBL', 2], ['LONG', 2], ['CLICK', 2], ['RST_DIS', 1]] },
  0x4A: { n: 'BTN_CFG_2', f: [['-', 7], ['OFF_DIS', 1]] },
  0x50: { n: 'NEO_CFG', f: [['-', 1], ['REFRESH', 1], ['LED_CNT', 6]] },
};
// Human-readable decoders for multi-bit fields: DEC[reg][field](value)
const FUNC = v => ['GPIO', 'IRQ', 'WAKE', 'ALT'][v];
const PULL = v => [T('无', 'none'), T('上拉', 'up'), T('下拉', 'down'), '?'][v];
const MS4 = v => ['125ms', '250ms', '500ms', '1s'][v];
const per5 = (fn, extra = {}) => Object.assign({ G0: fn, G1: fn, G2: fn, G3: fn, G4: fn }, extra);
const DEC = {
  0x10: per5(v => (v ? T('输出', 'out') : T('输入', 'in'))),
  0x11: per5(v => (v ? 'H' : 'L')), 0x12: per5(v => (v ? 'H' : 'L')),
  0x13: per5(v => (v ? T('开漏', 'OD') : T('推挽', 'PP')), { LED: v => (v ? T('开漏', 'OD') : T('推挽', 'PP')) }),
  0x18: per5(v => (v ? T('开', 'on') : T('关', 'off'))),
  0x19: per5(v => (v ? T('上升沿', 'rise') : T('下降沿', 'fall'))),
  0x14: { G0: PULL, G1: PULL, G2: PULL, G3: PULL }, 0x15: { G4: PULL },
  0x16: { G0: v => (v === 3 ? 'NEO' : FUNC(v)), G1: v => (v === 3 ? 'ADC' : FUNC(v)), G2: v => (v === 3 ? 'ADC' : FUNC(v)), G3: v => (v === 3 ? 'PWM' : FUNC(v)) },
  0x17: { G4: v => (v === 3 ? 'PWM' : FUNC(v)) },
  0x09: { SPD: v => (v ? '400k' : '100k'), SLP_TO: v => (v ? v + 's' : T('关', 'off')) },
  0x2A: { CH_SEL: v => ({ 0: '—', 1: 'G1', 2: 'G2', 6: T('温度', 'temp') }[v] ?? v) },
  0x31: { DUTY_H: v => String(v) }, 0x33: { DUTY_H: v => String(v) },
  0x3C: { ACTION: v => TIM_ACT()[v] ?? v },
  0x49: { DBL: MS4, LONG: v => v + 1 + 's', CLICK: MS4 },
  0x50: { LED_CNT: v => String(v) },
};
const pwmHC = ch => { const p = S.r.pwm[ch], d = Math.round(p.duty * 4095 / 100); return ((d >> 8) & 15) | (p.en << 4) | (p.pol << 5); };
const regGet = a => (REGDEF[a].g ? REGDEF[a].g() : regVal(a));

/* ---------- small DOM helpers ---------- */
let BINDS = [];
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  kids.flat().forEach(k => k != null && k !== false && e.append(k.nodeType ? k : document.createTextNode(k)));
  return e;
};
const bind = fn => BINDS.push(fn);
function txt(fn, cls) { const e = el('span', cls ? { class: cls } : {}); bind(() => { const t = fn(); if (e.textContent !== t) e.textContent = t; }); return e; }
function tg(id, label, get, set) {
  const i = el('input', { type: 'checkbox', id, onchange: () => set(i.checked) });
  bind(() => (i.checked = !!get()));
  return el('label', { class: 'tg', for: id }, i, el('span', { class: 'sw' }), el('span', {}, label));
}
function seg(id, opts, get, set) {
  const w = el('div', { class: 'seg', id });
  opts.forEach(([v, lab]) => w.append(el('button', { id: `${id}-${v}`, type: 'button', onclick: () => set(v) }, lab)));
  bind(() => { const cur = get(); [...w.children].forEach((b, k) => b.setAttribute('aria-pressed', String(opts[k][0] === cur))); });
  return w;
}
function rng(id, min, max, step, get, set, fmt) {
  const i = el('input', { type: 'range', id, min, max, step });
  const o = el('span', { class: 'pn' });
  i.addEventListener('input', () => { set(+i.value); o.textContent = fmt(+i.value); });
  bind(() => { if (document.activeElement !== i) i.value = get(); o.textContent = fmt(+i.value); });
  return [i, o];
}
const bt = (id, label, fn) => el('button', { id, class: 'btn', type: 'button', onclick: fn }, label);
const row = (label, ...c) => el('div', { class: 'row' }, label != null ? el('span', { class: 'l' }, label) : null, ...c);
const sec = (title, ...c) => el('div', { class: 'sec' }, title ? el('h3', {}, title) : null, ...c);
function warn(cond, msg) { const e = el('div', { class: 'note' }, msg); bind(() => (e.hidden = !cond())); return e; }
function big(fn, sub) { return el('div', { class: 'big' }, txt(fn), sub ? txt(sub, 'small') : null); }
const lv = v => (v === 1 ? 'HIGH' : v === 0 ? 'LOW' : '—');
const volts = mv => (mv ? (mv / 1000).toFixed(2) + ' V' : '0 V');

function sysState() {
  const d = D();
  if (S.sys === 'none') return [T('未上电', 'No power'), '#888'];
  if (d.inReset) return [T('复位中', 'Resetting'), '#f5b400'];
  if (S.sys === 'dl') return [T('下载模式', 'Download mode'), '#a51f7c'];
  if (S.sys === 'off') return [S.lvpLatch ? T('低压关机', 'Off (low battery)') : T('关机', 'Off'), '#d23030'];
  if (S.asleep) return [T('休眠', 'Asleep'), '#2f86e0'];
  return [T('开机', 'On'), '#1fae4f'];
}
function stateView() {
  const dot = el('i'), t = el('span');
  bind(() => { const [s, c] = sysState(); t.textContent = s; dot.style.background = c; });
  return el('span', { class: 'state' }, dot, t);
}

/* ---------- GPIO ---------- */
const GPIO_LEDE = {
  0: ['可作 RGB 灯（NeoPixel）输出、中断输出，或唤醒输入（与 G2 二选一）。', 'NeoPixel RGB output, interrupt output, or wake input (shared with G2).'],
  1: ['可作 ADC 输入。不支持唤醒。', 'ADC input. Cannot wake the system.'],
  2: ['可作 ADC 输入、中断输出，或唤醒输入（与 G0 二选一）。', 'ADC input, interrupt output, or wake input (shared with G0).'],
  3: ['可作 PWM 输出、中断输出，或唤醒输入（与 G4 二选一）。', 'PWM output, interrupt output, or wake input (shared with G4).'],
  4: ['可作 PWM 输出、中断输出，或唤醒输入（与 G3 二选一）。', 'PWM output, interrupt output, or wake input (shared with G3).'],
};
const ALT = { 0: 'NeoPixel', 1: 'ADC', 2: 'ADC', 3: 'PWM', 4: 'PWM' };
const COLORS = { rainbow: [[255, 0, 0], [255, 128, 0], [255, 255, 0], [0, 255, 0], [0, 200, 255], [0, 0, 255], [160, 0, 255], [255, 0, 160]], red: [[255, 0, 0]], green: [[0, 255, 0]], blue: [[0, 0, 255]], white: [[255, 255, 255]] };
let neoN = 8;
S.adcCh = 0; S.adcRes = 0;

function gpioControls(i) {
  const g = () => S.r.gpio[i];
  const out = [];
  const funcs = [[0, 'GPIO']];
  if (i !== 1) funcs.push([1, T('中断', 'IRQ')]);
  funcs.push([3, ALT[i]]);
  out.push(row(T('功能', 'Function'), seg(`c-func-${i}`, funcs, () => g().func, v => { A.gpio(i, 'func', v); buildPanel(); })));
  out.push(row(T('输出', 'Drive'), seg(`c-drv-${i}`, [[1, T('开漏', 'Open-drain')], [0, T('推挽', 'Push-pull')]], () => g().drv, v => A.gpio(i, 'drv', v))));
  out.push(row(T('上下拉', 'Pull'), seg(`c-pull-${i}`, [[0, T('无', 'None')], [1, T('上拉', 'Up')], [2, T('下拉', 'Down')]], () => g().pull, v => A.gpio(i, 'pull', v))));
  const f = g().func;
  if (f === 0) {
    out.push(row(T('方向', 'Direction'), seg(`c-mode-${i}`, [[0, T('输入', 'Input')], [1, T('输出', 'Output')]], () => g().mode, v => { A.gpio(i, 'mode', v); buildPanel(); })));
    if (g().mode === 1) out.push(row(T('写入', 'Write'), seg(`c-out-${i}`, [[0, 'LOW'], [1, 'HIGH']], () => g().out, v => A.gpio(i, 'out', v))));
    else out.push(row(T('外部信号', 'External'), seg(`c-ext-${i}`, [['n', T('悬空', 'Float')], [0, 'LOW'], [1, 'HIGH']], () => (S.gext[i] == null ? 'n' : S.gext[i]), v => phys(() => setExt(i, v === 'n' ? null : v)))));
    out.push(row(T('引脚', 'Pin'), txt(() => lv(pinLevel(i)), 'big')));
    out.push(warn(() => g().mode === 1 && g().out === 1 && g().drv === 1 && g().pull === 0, T('开漏输出高电平需要上拉电阻', 'Open-drain high needs a pull-up')));
  }
  if (f === 1) {
    out.push(row(T('引脚', 'Pin'), txt(() => (irqActive() ? T('LOW · 有中断', 'LOW · pending') : 'HIGH'), 'big'), bt(`c-irqclr-${i}`, T('清除中断', 'Clear'), () => { A.clearIrq(); A.clearWake(); })));
    out.push(el('div', { class: 'pn' }, T('试试：拔插 5V、电池，或按 PWR_BTN', 'Try: unplug 5V or the battery, or press PWR_BTN')));
  }
  if (f === 3 && i === 0) {
    const strip = el('div', { class: 'strip' });
    bind(() => {
      const n = Math.max(neoN, S.r.neoCnt);
      if (strip.children.length !== n) { strip.textContent = ''; for (let k = 0; k < n; k++) strip.append(el('i')); }
      const on = neoActive();
      [...strip.children].forEach((c, k) => { const lit = on && k < S.r.neoCnt && S.r.neo[k]; c.style.background = lit ? from565(S.r.neo[k]) : '#333'; c.style.boxShadow = lit ? `0 0 6px ${from565(S.r.neo[k])}` : 'none'; });
    });
    const send = p => A.neo(neoN, COLORS[p].map(c => rgb565(...c)));
    out.push(sec('NeoPixel',
      row(T('数量', 'Count'), ...rng('c-neocnt', 1, 32, 1, () => neoN, v => { neoN = v; BINDS.forEach(f => f()); }, v => String(v))),
      row(null, ...Object.keys(COLORS).map(p => bt(`c-neo-${p}`, { rainbow: T('彩虹', 'Rainbow'), red: T('红', 'Red'), green: T('绿', 'Green'), blue: T('蓝', 'Blue'), white: T('白', 'White') }[p], () => send(p))), bt('c-neo-off', T('关', 'Off'), () => A.neo(neoN, [0]))),
      strip,
      warn(() => g().drv === 1, T('开漏输出时灯珠收不到数据，请改为推挽', 'LEDs get no data in open-drain mode; use push-pull'))));
  }
  if (f === 3 && (i === 1 || i === 2)) {
    const read = () => act(() => { S.adcCh = i; S.adcRes = adcRaw(S.ain[i]); });
    out.push(sec('ADC',
      row(T('输入', 'Input'), ...rng(`c-ain-${i}`, 0, 3300, 10, () => S.ain[i], v => (S.ain[i] = v), v => v + ' mV')),
      row(null, bt(`c-adc-${i}`, T('读取', 'Read'), read), big(() => (S.adcCh === i ? String(S.adcRes) : '—'), () => (S.adcCh === i ? `= ${Math.round(S.adcRes * VREF / 4096)} mV` : ''))),
      el('div', { class: 'pn' }, T('电压 = 读数 × VREF / 4096，输入不超过 3.3V', 'mV = reading × VREF / 4096, max 3.3 V input'))));
  }
  if (f === 3 && i >= 3) {
    const ch = i - 3, wave = el('div');
    bind(() => {
      const p = S.r.pwm[ch], on = pwmActive(ch), W = 340, H = 56, per = 85;
      let d = `M0 ${H - 6}`;
      if (on) for (let k = 0; k < 4; k++) {
        const x0 = k * per, hi = per * p.duty / 100, [a, b] = p.pol ? [H - 6, 6] : [6, H - 6];
        d += ` L${x0} ${a} L${x0 + hi} ${a} L${x0 + hi} ${b} L${x0 + per} ${b}`;
      } else d += ` L${W} ${H - 6}`;
      wave.innerHTML = `<svg class="wave" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${on ? '#e0362f' : '#999'}" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
    });
    out.push(sec('PWM',
      row(null, tg(`c-pwmen-${i}`, T('输出', 'Enable'), () => S.r.pwm[ch].en, v => A.pwm(ch, 'en', v ? 1 : 0)), tg(`c-pwmpol-${i}`, T('反相', 'Invert'), () => S.r.pwm[ch].pol, v => A.pwm(ch, 'pol', v ? 1 : 0))),
      row(T('占空比', 'Duty'), ...rng(`c-duty-${i}`, 0, 100, 1, () => S.r.pwm[ch].duty, v => A.pwm(ch, 'duty', v), v => v + '%')),
      row(T('频率', 'Freq'), seg(`c-freq-${i}`, [[500, '500Hz'], [1000, '1k'], [5000, '5k'], [20000, '20k']], () => S.r.pwmFreq, v => A.pwmFreq(v))),
      wave,
      warn(() => g().drv === 1, T('开漏输出时没有波形，请改为推挽', 'No waveform in open-drain mode; use push-pull')),
      el('div', { class: 'pn' }, T('G3、G4 共用同一个频率', 'G3 and G4 share one frequency'))));
  }
  if (i !== 1) {
    out.push(sec(T('唤醒', 'Wake'),
      row(null, tg(`c-wake-${i}`, T('唤醒开机', 'Wake on edge'), () => S.r.wake[i], v => A.wake(i, v)), seg(`c-edge-${i}`, [[0, T('下降沿', 'Falling')], [1, T('上升沿', 'Rising')]], () => S.r.edge[i], v => A.edge(i, v))),
      row(null, tg(`c-ghold-${i}`, T('关机后保持 IO 状态', 'Keep IO state after power-off'), () => S.r.hold & (1 << i), v => A.holdBit(1 << i, v))),
      row(null, bt(`c-off-${i}`, T('关机', 'Power off'), () => A.sysCmd(1)), stateView())));
  }
  return out;
}
function gpioRegs(i) {
  const g = S.r.gpio[i], G = 'G' + i, hi = i === 4;
  const r = [[hi ? 0x17 : 0x16, [G]], [0x13, [G]], [hi ? 0x15 : 0x14, [G]]];
  if (g.func === 0) r.push([0x10, [G]], [0x11, [G]], [0x12, [G]]);
  if (g.func === 1) r.push([0x41, []], [0x42, []]);
  if (g.func === 3) r.push(...(i === 0 ? [[0x50, ['LED_CNT', 'REFRESH']]] : i < 3 ? [[0x2A, ['CH_SEL']], [0x28]] : [[0x31 + 2 * (i - 3), ['EN', 'POL', 'DUTY_H']], [0x34]]));
  if (i !== 1) r.push([0x18, [G]], [0x19, [G]]);
  return r;
}
function gpioCode(i) {
  const N = `M5PM1_GPIO_NUM_${i}`;
  const alt = {
    0: `pm1.gpioSetFunc(${N}, M5PM1_GPIO_FUNC_OTHER);\npm1.gpioSetDrive(${N}, M5PM1_GPIO_DRIVE_PUSHPULL);\nm5pm1_rgb_t red = {255, 0, 0};\npm1.setLeds(&red, 1, 8, true);`,
    1: `pm1.gpioSetFunc(${N}, M5PM1_GPIO_FUNC_OTHER);\nuint16_t raw, vref;\npm1.analogRead(M5PM1_ADC_CH_1, &raw);\npm1.readVref(&vref);\nuint16_t mv = raw * vref / 4096;`,
    2: `pm1.gpioSetFunc(${N}, M5PM1_GPIO_FUNC_OTHER);\nuint16_t raw;\npm1.analogRead(M5PM1_ADC_CH_2, &raw);`,
    3: `pm1.gpioSetFunc(${N}, M5PM1_GPIO_FUNC_OTHER);\npm1.gpioSetDrive(${N}, M5PM1_GPIO_DRIVE_PUSHPULL);\npm1.setPwmFrequency(1000);\npm1.setPwmDuty(M5PM1_PWM_CH_0, 50, false, true);`,
    4: `pm1.gpioSetFunc(${N}, M5PM1_GPIO_FUNC_OTHER);\npm1.gpioSetDrive(${N}, M5PM1_GPIO_DRIVE_PUSHPULL);\npm1.setPwmDuty(M5PM1_PWM_CH_1, 25, false, true);`,
  }[i];
  const wake = i === 1 ? '' : `\n\npm1.gpioSetMode(${N}, M5PM1_GPIO_MODE_INPUT);\npm1.gpioSetPull(${N}, M5PM1_GPIO_PULL_UP);\npm1.gpioSetWakeEnable(${N}, true);\npm1.gpioSetWakeEdge(${N}, M5PM1_GPIO_WAKE_FALLING);`;
  return alt + wake;
}

/* ---------- per-pin content ---------- */
let timSec = 10, timAct = 3;
const INFO = {
  OVERVIEW: {
    name: 'M5PM1', t: 'pwr',
    lede: () => T('电源管理芯片：管理 5V 与电池供电、充电，控制 3.3V / 5V 输出，支持定时开关机。点击引脚查看。', 'Power management IC: handles 5V and battery input, charging, the 3.3V / 5V outputs and timed power on/off. Click a pin to explore.'),
    facts: () => [['I²C', '0x6E · 100k / 400k'], [T('关机', 'Off'), 'DC 4.2V@6.72µA'], [T('休眠', 'Sleep'), 'DC 4.2V@12.27µA'], [T('尺寸', 'Size'), '18.0 × 14.0 × 2.2 mm']],
    controls: () => [
      row(T('状态', 'State'), stateView(), bt('c-cmd-off', T('关机', 'Off'), () => A.sysCmd(1)), bt('c-cmd-rst', T('重启', 'Reboot'), () => A.sysCmd(2))),
      sec(T('定时器', 'Timer'),
        row(T('时间', 'After'), seg('c-tsec', [[5, '5s'], [10, '10s'], [30, '30s']], () => timSec, v => { timSec = v; BINDS.forEach(f => f()); })),
        row(T('动作', 'Action'), seg('c-tact', [[3, T('开机', 'Power on')], [4, T('关机', 'Power off')], [2, T('重启', 'Reboot')]], () => timAct, v => { timAct = v; BINDS.forEach(f => f()); })),
        row(null, bt('c-tstart', T('开始', 'Start'), () => A.timer(timSec, timAct)), bt('c-tstop', T('取消', 'Cancel'), () => A.timer(0, 0)),
          txt(() => (S.r.tim.arm ? `${S.r.tim.cnt}s → ${TIM_ACT()[S.r.tim.act]}` : ''), 'timer')),
        el('div', { class: 'pn' }, T('设好“开机”后关机，到时自动开机', 'Arm “Power on”, then power off: it comes back by itself'))),
    ],
    regs: () => [[0x05, []], [0x3C, ['ARM', 'ACTION']], [0x38]],
    code: () => `pm1.begin(&Wire, 0x6E, SDA_PIN, SCL_PIN, M5PM1_I2C_FREQ_100K);\npm1.timerSet(10, M5PM1_TIM_ACTION_POWERON);\npm1.shutdown();`,
  },
  '5V_IN': {
    t: 'pwr',
    lede: () => T('5V 主输入。接入后优先由 5V 供电，同时给电池充电。', 'Main 5V input. Takes priority over the battery and charges it.'),
    facts: () => [[T('插入', 'Plug-in'), T('关机时自动开机', 'powers the system on')]],
    controls: () => [row(null, tg('c-vin', T('接入', 'Connected'), () => S.vin, v => A.setVin(v)), big(() => volts(regVal(0x24))))],
    regs: () => [[0x04, ['VIN']], [0x24]],
    code: () => `uint16_t mv;\npm1.readVin(&mv);`,
  },
  EXT_5V_INOUT: {
    t: 'pwr',
    lede: () => T('双向 5V 口：接电源时作输入；打开升压后对外输出 5V。', 'Bidirectional 5V: an input when a supply is attached, a 5V output when the boost is on.'),
    facts: () => [[T('输出能力', 'Output'), 'DC 5V@1A']],
    controls: () => [
      row(null, tg('c-ext', T('外接 5V 电源', 'External 5V attached'), () => S.ext, v => A.setExt(v))),
      row(null, tg('c-boost', T('升压输出', 'Boost output'), () => S.r.pwr & 8, v => A.pwrBit(8, v))),
      row(null, tg('c-bhold', T('关机后保持输出', 'Keep on after power-off'), () => S.r.hold & 0x40, v => A.holdBit(0x40, v))),
      row(null, big(() => volts(D().vext), () => { const d = D(); return d.boostOn ? T('输出', 'out') : S.ext ? T('输入', 'in') : ''; }))],
    regs: () => [[0x06, ['BOOST']], [0x07, ['5V']], [0x26]],
    code: () => `uint16_t mv;\npm1.read5VInOut(&mv);\nif (mv < 4000) pm1.setBoostEnable(true);`,
  },
  VBAT: {
    t: 'pwr',
    lede: () => T('3.7V 锂电池。拔掉 5V 时无缝切到电池；电压过低自动关机。', '3.7V Li-ion battery. Takes over seamlessly when 5V is removed; shuts down when too low.'),
    facts: () => [[T('低压关机', 'Cut-off'), '2000 mV + n × 7.81 mV'], [T('恢复开机', 'Restart'), T('高于阈值 100 mV 或插入 5V', '100 mV above cut-off, or 5V plugged in')]],
    controls: () => [
      row(null, tg('c-bat', T('接入', 'Connected'), () => S.bat, v => A.setBat(v)), big(() => volts(regVal(0x22)), () => (D().chg ? T('充电中', 'charging') : S.lvpLatch ? T('低压关机', 'cut off') : ''))),
      row(T('电压', 'Voltage'), ...rng('c-vbat', 2200, 4250, 10, () => S.vbat, v => A.setVbat(v), v => v + ' mV')),
      row(T('关机阈值', 'Cut-off'), seg('c-lvp', [[0x40, '2.5V'], [0x4D, '2.6V'], [0x66, '2.8V'], [0x80, '3.0V']], () => S.r.lvp, v => A.setLvp(v)))],
    regs: () => [[0x08], [0x22], [0x04, ['BAT']]],
    code: () => `uint16_t mv;\npm1.readVbat(&mv);\npm1.setBatteryLvp(3000);`,
  },
  SYS_VBUS: {
    t: 'pwr',
    lede: () => T('系统总线：5V 和电池合并后的电源，所有输出都从这里取电。', 'System bus: 5V and battery merged here. Every output draws from it.'),
    controls: () => [row(null, big(() => volts(D().vbus), () => { const d = D(); return d.int5 ? '← 5V' : d.batOk ? '← VBAT' : ''; }))],
    regs: () => [[0x04, ['VIN', 'INOUT', 'BAT']]],
    code: () => `m5pm1_pwr_src_t src;\npm1.getPowerSource(&src);`,
  },
  PY_3V3_OUT: {
    t: 'pwr',
    lede: () => T('常开 3.3V，同时给 M5PM1 自己供电，不能关闭。关机后定时器和唤醒照常工作。', 'Always-on 3.3V that also powers the M5PM1. It cannot be turned off, so the timer and wake work while the system is off.'),
    facts: () => [[T('输出能力', 'Output'), 'DC 3.3V@0.4A']],
    controls: () => [row(null, big(() => volts(D().py)))],
    regs: () => [], code: null,
  },
  '3V3_DCDC_OUT': {
    t: 'pwr',
    lede: () => T('3.3V 降压输出，效率高，一般给主控供电。关机时断开。', 'Efficient 3.3V buck output, usually for the MCU. Off when the system is off.'),
    facts: () => [[T('输出能力', 'Output'), 'DC 3.3V@0.6A']],
    controls: () => [row(null, tg('c-dcdc', T('输出', 'Enable'), () => S.r.pwr & 2, v => A.pwrBit(2, v)), big(() => volts(D().dcdc ? 3300 : 0))), warn(() => !(S.r.pwr & 2) && S.sys === 'on', T('主控接在这路时会直接断电', 'An MCU on this rail loses power'))],
    regs: () => [[0x06, ['DCDC']]],
    code: () => `pm1.setDcdcEnable(true);`,
  },
  '3V3_LDO_OUT': {
    t: 'pwr',
    lede: () => T('3.3V LDO 输出，静态电流 0.8µA。可在关机后保持，给常开外设供电。', '3.3V LDO output, 0.8 µA quiescent. Can stay on after power-off for always-on peripherals.'),
    facts: () => [[T('输出能力', 'Output'), 'DC 3.3V@0.4A']],
    controls: () => [row(null, tg('c-ldo', T('输出', 'Enable'), () => S.r.pwr & 4, v => A.pwrBit(4, v)), big(() => volts(D().ldo ? 3300 : 0))), row(null, tg('c-lhold', T('关机后保持输出', 'Keep on after power-off'), () => S.r.hold & 0x20, v => A.holdBit(0x20, v)))],
    regs: () => [[0x06, ['LDO']], [0x07, ['LDO']]],
    code: () => `pm1.setLdoEnable(true);\npm1.ldoSetPowerHold(true);`,
  },
  CHG_PROG: {
    t: 'ctl',
    lede: () => T('选择充电电流：悬空 180mA，接地 650mA。', 'Charge current: floating = 180 mA, grounded = 650 mA.'),
    controls: () => [row(null, seg('c-prog', [[false, T('悬空', 'Float')], [true, T('接地', 'GND')]], () => S.gnd, v => A.setGnd(v)), big(() => { const d = D(); return d.chg ? d.ichg + ' mA' : d.full ? T('已充满', 'Full') : '—'; }))],
    regs: () => [], code: null,
  },
  CHRG_STAT: {
    t: 'ctl',
    lede: () => T('充电状态：充电中为低，充满或未充电为高。', 'Charge status: low while charging, high when full or idle.'),
    controls: () => [row(null, tg('c-chg', T('允许充电', 'Charging enabled'), () => S.r.pwr & 1, v => A.pwrBit(1, v)), big(() => (D().py ? (D().chg ? 'LOW' : 'HIGH') : '—')))],
    regs: () => [[0x06, ['CHG']]],
    code: () => `pm1.setChargeEnable(true);`,
  },
  PWR_BTN: {
    t: 'ctl',
    lede: () => T('电源按键，按下接地。', 'Power button, active low.'),
    controls: () => {
      const b = el('button', { class: 'btnPress', id: 'c-press', type: 'button' }, 'PWR');
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); phys(btnDown); });
      const up = () => { b.classList.remove('down'); phys(btnUp); };
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', () => S.btn.down && up());
      const res = { on: T('开机', 'Power on'), reset: T('复位', 'Reset'), off: T('关机', 'Power off'), dl: T('下载模式', 'Download mode'), irq: T('中断', 'IRQ'), locked: T('已锁定', 'Locked'), none: '—' };
      const g = el('div', { class: 'gest' });
      const line = (k, lab, fn) => { const a = el('span', {}, lab), v = el('span'); g.append(a, v); bind(() => { v.textContent = fn(); const hit = S.lastEvt && S.lastEvt[0] === k; a.className = v.className = hit ? 'hit' : ''; }); };
      line('click', T('单击', 'Click'), () => (S.sys === 'off' ? res.on : S.r.btn1 & 1 ? res.irq : res.reset));
      line('double', T('双击', 'Double'), () => (S.sys === 'off' ? res.on : S.r.btn2 & 1 ? res.irq : res.off));
      line('long', T(`长按 ${btnLong() / 1000}s`, `Hold ${btnLong() / 1000}s`), () => (S.sys === 'off' ? res.on : S.r.btn1 & 0x80 ? res.locked : res.dl));
      return [
        row(null, b, el('div', {}, g, el('div', { style: 'margin-top:6px' }, stateView()))),
        row(T('双击间隔', 'Double gap'), seg('c-dblt', [[0, '125'], [1, '250'], [2, '500'], [3, '1000 ms']], () => (S.r.btn1 >> 5) & 3, v => A.btn(1, (S.r.btn1 & ~0x60) | (v << 5)))),
        row(T('长按', 'Hold'), seg('c-longt', [[0, '1s'], [1, '2s'], [2, '3s'], [3, '4s']], () => (S.r.btn1 >> 3) & 3, v => { A.btn(1, (S.r.btn1 & ~0x18) | (v << 3)); buildPanel(); })),
        row(null, tg('c-srd', T('单击改为中断', 'Click → IRQ'), () => S.r.btn1 & 1, v => A.btn(1, v ? S.r.btn1 | 1 : S.r.btn1 & ~1)), tg('c-dpd', T('双击改为中断', 'Double → IRQ'), () => S.r.btn2 & 1, v => A.btn(2, v ? 1 : 0)))];
    },
    regs: () => [[0x49, ['DBL', 'LONG', 'RST_DIS']], [0x4A, ['OFF_DIS']], [0x05, ['PWRBTN', 'RSTBTN']]],
    code: () => `pm1.btnSetConfig(M5PM1_BTN_TYPE_DOUBLE, M5PM1_BTN_DOUBLE_CLICK_DELAY_500MS);\npm1.setSingleResetDisable(true);\npm1.setDoubleOffDisable(true);`,
  },
  BOOT_OUT: {
    t: 'ctl',
    lede: () => T('接主控 BOOT 脚。拉低后重启主控，主控进入下载模式。', 'Goes to the MCU BOOT pin. Held low while the MCU restarts, so it boots into download mode.'),
    controls: () => [
      row(null, bt('c-dlcmd', T('进入下载模式', 'Enter download mode'), () => A.sysCmd(3)), bt('c-dlexit', T('重启', 'Reboot'), () => A.sysCmd(2))),
      row(null, big(() => (D().bootLow ? 'LOW' : 'HIGH')), stateView()),
      row(null, tg('c-dllock', T('禁止下载模式', 'Lock download mode'), () => S.r.btn1 & 0x80, v => A.btn(1, v ? S.r.btn1 | 0x80 : S.r.btn1 & ~0x80))),
      el('div', { class: 'pn' }, T('也可以长按 PWR_BTN 进入', 'Holding PWR_BTN does the same'))],
    regs: () => [[0x49, ['DL_LOCK']]],
    code: () => `pm1.enterDownloadMode();\npm1.setDownloadLock(true);`,
  },
  LED_PWR_EN: {
    t: 'gpio',
    lede: () => T('电源指示灯。复位时闪一下，下载模式下 500ms 闪烁。', 'Power LED. Blinks once on reset and every 500 ms in download mode.'),
    controls: () => [row(null, tg('c-led', T('点亮', 'On'), () => S.r.pwr & 0x10, v => A.pwrBit(0x10, v)), big(() => (ledState() ? T('亮', 'ON') : T('灭', 'OFF'))))],
    regs: () => [[0x06, ['LED']]],
    code: () => `pm1.setLedEnLevel(false);`,
  },
  I2C: {
    t: 'i2c', name: 'I2C_SDA / SCL',
    lede: () => T('I²C 接口，地址 0x6E，需外部上拉。', 'I²C interface at 0x6E. Needs external pull-ups.'),
    facts: () => [[T('空闲休眠', 'Idle sleep'), T('首次通信只唤醒，需重试', 'first access only wakes it; retry')]],
    controls: () => [
      row(T('速率', 'Speed'), seg('c-spd', [[0, '100k'], [1, '400k']], () => (S.r.i2c >> 4) & 1, v => A.i2c((S.r.i2c & 0x0f) | (v << 4)))),
      row(T('空闲休眠', 'Idle sleep'), seg('c-slp', [[0, T('关', 'Off')], [3, '3s'], [5, '5s'], [10, '10s']], () => S.r.i2c & 0x0f, v => A.i2c((S.r.i2c & 0x10) | v))),
      row(null, bt('c-ping', T('读一次', 'Read once'), () => act(() => {})), stateView())],
    regs: () => [[0x09, ['SPD', 'SLP_TO']]],
    code: () => `pm1.begin(&Wire, 0x6E, SDA_PIN, SCL_PIN, M5PM1_I2C_FREQ_400K);\npm1.setI2cConfig(5, M5PM1_I2C_SPEED_400K);`,
  },
  GND: { t: 'gnd', lede: () => T('地。', 'Ground.'), controls: () => [], regs: () => [], code: null },
};
for (let i = 0; i < 5; i++) {
  INFO['G' + i] = {
    t: 'gpio', lede: () => T(...GPIO_LEDE[i]),
    facts: () => [[T('默认', 'Default'), T('输入，开漏', 'input, open-drain')]],
    controls: () => gpioControls(i), regs: () => gpioRegs(i), code: () => gpioCode(i),
  };
}
