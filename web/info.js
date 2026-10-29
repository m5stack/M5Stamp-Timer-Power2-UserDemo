/* Pin data and per-pin panel content. */
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
const PINNUM = {}, PINTYPE = { OVERVIEW: 'pwr', I2C: 'i2c' };
[...LEFT, ...RIGHT].forEach(p => { PINNUM[p.key] = (PINNUM[p.key] || []).concat(p.n); PINTYPE[p.key] = p.t; });
const TAG = { pwr: ['电源', 'Power'], gnd: ['地', 'Ground'], i2c: ['I²C', 'I²C'], gpio: ['IO', 'IO'], ctl: ['控制', 'Control'] };

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
  const o = el('span', { class: 'pn rv' });
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

// Why an IRQ pin is being held low: every unmasked pending status bit.
function irqReasons() {
  const out = [];
  const add = (a, m, names) => names.forEach((n, k) => { if ((R[a] >> k & 1) && !(R[m] >> k & 1)) out.push(n); });
  add(0x40, 0x43, [0, 1, 2, 3, 4].map(i => T(`G${i} 电平变化`, `G${i} changed`)));
  add(0x41, 0x44, [T('5V_IN 插入', '5V_IN in'), T('5V_IN 移除', '5V_IN out'), T('EXT 插入', 'EXT in'), T('EXT 移除', 'EXT out'), T('电池插入', 'battery in'), T('电池移除', 'battery out')]);
  add(0x42, 0x45, [T('单击', 'click'), T('开机事件（WAKE_SRC 未清零）', 'wake event (WAKE_SRC not cleared)'), T('双击', 'double click')]);
  return out;
}

/* ---------- GPIO ---------- */
const GPIO_LEDE = {
  0: ['可作 RGB 灯（NeoPixel）输出、中断输出，或唤醒输入（与 G2 二选一）。', 'NeoPixel RGB output, interrupt output, or wake input (shared with G2).'],
  1: ['可作 ADC 输入。不支持唤醒。', 'ADC input. Cannot wake the system.'],
  2: ['可作 ADC 输入、中断输出，或唤醒输入（与 G0 二选一）。', 'ADC input, interrupt output, or wake input (shared with G0).'],
  3: ['可作 PWM 输出、中断输出，或唤醒输入（与 G4 二选一）。', 'PWM output, interrupt output, or wake input (shared with G4).'],
  4: ['可作 PWM 输出、中断输出，或唤醒输入（与 G3 二选一）。', 'PWM output, interrupt output, or wake input (shared with G3).'],
};
const ALT = { 0: 'NeoPixel', 1: 'ADC1', 2: 'ADC2', 3: 'PWM1', 4: 'PWM2' };
const COLORS = { rainbow: [[255, 0, 0], [255, 128, 0], [255, 255, 0], [0, 255, 0], [0, 200, 255], [0, 0, 255], [160, 0, 255], [255, 0, 160]], red: [[255, 0, 0]], green: [[0, 255, 0]], blue: [[0, 0, 255]], white: [[255, 255, 255]] };
let neoN = 8;

function pwmWave(ch) {
  const wave = el('div');
  bind(() => {
    const p = pwm(ch), on = pwmActive(ch), W = 340, H = 56, per = 85, top = 6, bot = H - 6;
    const [hiY, loY] = p.pol ? [bot, top] : [top, bot];
    const hi = Math.round(per * p.duty12 / 4095);
    let d;
    if (!on) d = `M0 ${bot} H${W}`;
    else if (hi <= 0) d = `M0 ${loY} H${W}`;
    else if (hi >= per) d = `M0 ${hiY} H${W}`;
    else { d = `M0 ${hiY}`; for (let k = 0; k < 4; k++) { const x = k * per; d += ` H${x + hi} V${loY} H${x + per}` + (k < 3 ? ` V${hiY}` : ''); } }
    if (wave.dataset.k === d + on) return;
    wave.dataset.k = d + on;
    wave.innerHTML = `<svg class="wave" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${on ? '#e0362f' : '#999'}" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
  });
  return wave;
}

function gpioControls(i) {
  const out = [];
  const funcs = [[0, 'GPIO']];
  if (i !== 1) funcs.push([1, T('中断', 'IRQ')]);
  funcs.push([3, ALT[i]]);
  out.push(row(T('功能', 'Function'), seg(`c-func-${i}`, funcs, () => G.func(i), v => { A.gpio(i, 'func', v); buildPanel(); regAutoGroup(); })));
  out.push(row(T('输出', 'Drive'), seg(`c-drv-${i}`, [[1, T('开漏', 'Open-drain')], [0, T('推挽', 'Push-pull')]], () => G.drv(i), v => A.gpio(i, 'drv', v))));
  out.push(row(T('上下拉', 'Pull'), seg(`c-pull-${i}`, [[0, T('无', 'None')], [1, T('上拉', 'Up')], [2, T('下拉', 'Down')]], () => G.pull(i), v => A.gpio(i, 'pull', v))));
  const f = G.func(i);
  if (f === 0) {
    out.push(row(T('方向', 'Direction'), seg(`c-mode-${i}`, [[0, T('输入', 'Input')], [1, T('输出', 'Output')]], () => G.mode(i), v => { A.gpio(i, 'mode', v); buildPanel(); })));
    if (G.mode(i)) out.push(row(T('写入', 'Write'), seg(`c-out-${i}`, [[0, 'LOW'], [1, 'HIGH']], () => G.out(i), v => A.gpio(i, 'out', v))));
    else out.push(row(T('外部信号', 'External'), seg(`c-ext-${i}`, [['n', T('悬空', 'Float')], [0, 'LOW'], [1, 'HIGH']], () => (S.gext[i] == null ? 'n' : S.gext[i]), v => phys(() => setExt(i, v === 'n' ? null : v)))));
    out.push(row(T('引脚', 'Pin'), txt(() => lv(pinLevel(i)), 'big')));
    out.push(warn(() => G.mode(i) && G.out(i) && G.drv(i) && !G.pull(i) && S.gext[i] == null, T('开漏输出高电平需要上拉电阻', 'Open-drain high needs a pull-up')));
  }
  if (f === 1) {
    out.push(row(T('引脚', 'Pin'), txt(() => (irqPending() ? 'LOW' : 'HIGH'), 'big'), bt(`c-irqclr-${i}`, T('全部清除', 'Clear all'), () => A.clearIrq())));
    out.push(row(T('原因', 'Cause'), txt(() => irqReasons().join(T('、', ', ')) || T('无，引脚已释放', 'none, pin released'))));
    out.push(el('div', { class: 'pn' }, T('拔插 5V、电池或按 PWR_BTN 都会触发', 'Plugging 5V or the battery, or pressing PWR_BTN, triggers it')));
  }
  if (f === 3 && i === 0) {
    const strip = el('div', { class: 'strip' });
    bind(() => {
      const n = Math.max(neoN, S.neoShown.length);
      if (strip.children.length !== n) { strip.textContent = ''; for (let k = 0; k < n; k++) strip.append(el('i')); }
      const on = neoActive();
      [...strip.children].forEach((c, k) => { const v = S.neoShown[k], lit = on && v; c.style.background = lit ? from565(v) : '#333'; c.style.boxShadow = lit ? `0 0 6px ${from565(v)}` : 'none'; });
    });
    out.push(sec('NeoPixel',
      row(T('数量', 'Count'), ...rng('c-neocnt', 1, 32, 1, () => neoN, v => { neoN = v; }, v => String(v))),
      row(null, ...Object.keys(COLORS).map(p => bt(`c-neo-${p}`, { rainbow: T('彩虹', 'Rainbow'), red: T('红', 'Red'), green: T('绿', 'Green'), blue: T('蓝', 'Blue'), white: T('白', 'White') }[p], () => A.neo(neoN, COLORS[p]))), bt('c-neo-off', T('关', 'Off'), () => A.neoOff())),
      strip,
      warn(() => G.drv(0) === 1, T('开漏输出时灯珠收不到数据，请改为推挽', 'LEDs get no data in open-drain mode; use push-pull'))));
  }
  if (f === 3 && (i === 1 || i === 2)) {
    const mine = () => ((R[0x2A] >> 1) & 7) === i;
    out.push(sec(ALT[i],
      row(T('输入', 'Input'), ...rng(`c-ain-${i}`, 0, 3300, 10, () => S.ain[i], v => { S.ain[i] = v; A.readAdc(i); }, v => v + ' mV')),
      row(T('读数', 'Reading'), big(() => (mine() ? String(S.adcRes) : '—'), () => (mine() ? `× ${VREF} / 4096 = ${Math.round(S.adcRes * VREF / 4096)} mV` : ''))),
      el('div', { class: 'pn' }, T('拖动滑块即读取一次。输入不超过 3.3V', 'Moving the slider reads once. Max 3.3 V input'))));
  }
  if (f === 3 && i >= 3) {
    const ch = i - 3;
    out.push(sec(`${ALT[i]} · CH${ch}`,
      row(null, tg(`c-pwmen-${i}`, T('输出', 'Enable'), () => pwm(ch).en, v => A.bit(0x31 + 2 * ch, 4, v)), tg(`c-pwmpol-${i}`, T('反相', 'Invert'), () => pwm(ch).pol, v => A.bit(0x31 + 2 * ch, 5, v))),
      row(T('占空比', 'Duty'), ...rng(`c-duty-${i}`, 0, 100, 1, () => pwmPct(ch), v => A.pwmDuty(ch, v), v => v + '%')),
      row(T('频率', 'Freq'), seg(`c-freq-${i}`, [[500, '500Hz'], [1000, '1k'], [5000, '5k'], [20000, '20k']], pwmFreq, v => A.pwmFreq(v))),
      pwmWave(ch),
      warn(() => G.drv(i) === 1, T('开漏输出时没有波形，请改为推挽', 'No waveform in open-drain mode; use push-pull')),
      el('div', { class: 'pn' }, T('G3、G4 共用同一个频率', 'G3 and G4 share one frequency'))));
  }
  if (i !== 1) {
    out.push(sec(T('唤醒', 'Wake'),
      row(null, tg(`c-wake-${i}`, T('唤醒开机', 'Wake on edge'), () => G.wake(i), v => A.wake(i, v)), seg(`c-edge-${i}`, [[0, T('下降沿', 'Falling')], [1, T('上升沿', 'Rising')]], () => G.edge(i), v => A.bit(0x19, i, v))),
      row(null, tg(`c-ghold-${i}`, T('关机后保持 IO 状态', 'Keep IO state after power-off'), () => G.hold(i), v => A.bit(0x07, i, v))),
      row(null, bt(`c-off-${i}`, T('关机', 'Power off'), () => A.sysCmd(1)), stateView())));
  }
  return out;
}
function gpioRegs(i) {
  const g = 'G' + i, f = G.func(i);
  const r = [[i < 4 ? 0x16 : 0x17, [g]], [0x13, [g]], [i < 4 ? 0x14 : 0x15, [g]], [0x10, [g]], [0x11, [g]], [0x12, [g]]];
  if (i !== 1) r.push([0x18, [g]], [0x19, [g]], [0x07, [g]]);
  if (f === 1) r.push([0x40], [0x41], [0x42]);
  if (f === 3) r.push(...(i === 0 ? [[0x50]] : i < 3 ? [[0x2A], [0x28]] : [[0x30 + 2 * (i - 3)], [0x31 + 2 * (i - 3)], [0x34]]));
  return r;
}
const gpioGroup = i => { const f = G.func(i); return f === 1 ? 'irq' : f === 3 ? (i === 0 ? 'neo' : i < 3 ? 'adc' : 'pwm') : 'gpio'; };

/* ---------- per-pin content ---------- */
let timSec = 10, timAct = 3;
const INFO = {
  OVERVIEW: {
    name: 'M5PM1',
    lede: () => T('电源管理芯片：管理 5V 与电池供电、充电，控制 3.3V / 5V 输出，支持定时开关机。点击引脚查看。', 'Power management IC: handles 5V and battery input, charging, the 3.3V / 5V outputs and timed power on/off. Click a pin to explore.'),
    facts: () => [['I²C', '0x6E · 100k / 400k'], [T('关机', 'Off'), 'DC 4.2V@6.72µA'], [T('休眠', 'Sleep'), 'DC 4.2V@12.27µA'], [T('尺寸', 'Size'), '18.0 × 14.0 × 2.2 mm']],
    controls: () => [
      row(T('状态', 'State'), stateView(), bt('c-cmd-off', T('关机', 'Off'), () => A.sysCmd(1)), bt('c-cmd-rst', T('重启', 'Reboot'), () => A.sysCmd(2))),
      sec(T('定时器', 'Timer'),
        row(T('时间', 'After'), seg('c-tsec', [[5, '5s'], [10, '10s'], [30, '30s']], () => timSec, v => { timSec = v; BINDS.forEach(f => f()); })),
        row(T('动作', 'Action'), seg('c-tact', [[3, T('开机', 'Power on')], [4, T('关机', 'Power off')], [2, T('重启', 'Reboot')]], () => timAct, v => { timAct = v; BINDS.forEach(f => f()); })),
        row(null, bt('c-tstart', T('开始', 'Start'), () => A.timer(timSec, timAct)), bt('c-tstop', T('取消', 'Cancel'), () => A.timer(0, 0)),
          txt(() => (R[0x3C] & 8 ? `${S.timLeft}s → ${TIM_ACT()[R[0x3C] & 7]}` : ''), 'timer')),
        el('div', { class: 'pn' }, T('设好“开机”后关机，到时自动开机', 'Arm “Power on”, then power off: it comes back by itself'))),
    ],
    regs: () => [[0x05], [0x3C], [0x38], [0x0C]], group: () => 'tim',
  },
  '5V_IN': {
    lede: () => T('5V 主输入。接入后优先由 5V 供电，同时给电池充电。', 'Main 5V input. Takes priority over the battery and charges it.'),
    facts: () => [[T('插入', 'Plug-in'), T('关机时自动开机', 'powers the system on')]],
    controls: () => [row(null, tg('c-vin', T('接入', 'Connected'), () => S.vin, v => A.setVin(v)), big(() => volts(D().vin)))],
    regs: () => [[0x04, ['5VIN']], [0x24], [0x05, ['VIN']], [0x41, ['VIN_IN', 'VIN_RM']]], group: () => 'pwr',
  },
  EXT_5V_INOUT: {
    lede: () => T('双向 5V 口：接电源时作输入；打开升压后对外输出 5V。', 'Bidirectional 5V: an input when a supply is attached, a 5V output when the boost is on.'),
    facts: () => [[T('输出能力', 'Output'), 'DC 5V@1A']],
    controls: () => [
      row(null, tg('c-ext', T('外接 5V 电源', 'External 5V attached'), () => S.ext, v => A.setExt(v))),
      row(null, tg('c-boost', T('升压输出', 'Boost output'), () => R[0x06] & 8, v => A.bit(0x06, 3, v))),
      row(null, tg('c-bhold', T('关机后保持输出', 'Keep on after power-off'), () => R[0x07] & 0x40, v => A.bit(0x07, 6, v))),
      row(null, big(() => volts(D().vext), () => { const d = D(); return d.boostOn ? T('输出', 'out') : S.ext ? T('输入', 'in') : ''; }))],
    regs: () => [[0x06, ['BOOST']], [0x07, ['5V']], [0x26], [0x04, ['5VINOUT']]], group: () => 'pwr',
  },
  VBAT: {
    lede: () => T('3.7V 锂电池。拔掉 5V 时无缝切到电池；电压过低自动关机。', '3.7V Li-ion battery. Takes over seamlessly when 5V is removed; shuts down when too low.'),
    facts: () => [[T('恢复开机', 'Restart'), T('高于阈值 100 mV 或插入 5V', '100 mV above cut-off, or 5V plugged in')]],
    controls: () => [
      row(null, tg('c-bat', T('接入', 'Connected'), () => S.bat, v => A.setBat(v)), big(() => volts(regValue(RBY[0x22])), () => (D().chg ? T('充电中', 'charging') : S.lvpLatch ? T('低压关机', 'cut off') : ''))),
      row(T('电压', 'Voltage'), ...rng('c-vbat', 2200, 4250, 10, () => S.vbat, v => A.setVbat(v), v => v + ' mV')),
      row(T('关机阈值', 'Cut-off'), seg('c-lvp', [[2500, '2.5V'], [2600, '2.6V'], [2800, '2.8V'], [3000, '3.0V']], () => [2500, 2600, 2800, 3000].find(m => lvpReg(m) === R[0x08]), v => A.lvp(v)))],
    regs: () => [[0x08], [0x22], [0x04, ['BAT']], [0x06, ['CHG']]], group: () => 'pwr',
  },
  SYS_VBUS: {
    lede: () => T('系统总线：5V 和电池合并后的电源，所有输出都从这里取电。', 'System bus: 5V and battery merged here. Every output draws from it.'),
    controls: () => [row(null, big(() => volts(D().vbus), () => { const d = D(); return d.int5 ? '← 5V' : d.batOk ? '← VBAT' : ''; }))],
    regs: () => [[0x04]], group: () => 'pwr',
  },
  PY_3V3_OUT: {
    lede: () => T('常开 3.3V，同时给 M5PM1 自己供电，不能关闭。关机后定时器和唤醒照常工作。', 'Always-on 3.3V that also powers the M5PM1. It cannot be turned off, so the timer and wake work while the system is off.'),
    facts: () => [[T('输出能力', 'Output'), 'DC 3.3V@0.4A']],
    controls: () => [row(null, big(() => volts(D().py)))],
    regs: () => [[0x00], [0x01], [0x02], [0x03]], group: () => 'sys',
  },
  '3V3_DCDC_OUT': {
    lede: () => T('3.3V 降压输出，效率高，一般给主控供电。关机时断开。', 'Efficient 3.3V buck output, usually for the MCU. Off when the system is off.'),
    facts: () => [[T('输出能力', 'Output'), 'DC 3.3V@0.6A']],
    controls: () => [row(null, tg('c-dcdc', T('输出', 'Enable'), () => R[0x06] & 2, v => A.bit(0x06, 1, v)), big(() => volts(D().dcdc ? 3300 : 0))), warn(() => !(R[0x06] & 2) && S.sys === 'on', T('主控接在这路时会直接断电', 'An MCU on this rail loses power'))],
    regs: () => [[0x06, ['DCDC']]], group: () => 'pwr',
  },
  '3V3_LDO_OUT': {
    lede: () => T('3.3V LDO 输出，静态电流 0.8µA。可在关机后保持，给常开外设供电。', '3.3V LDO output, 0.8 µA quiescent. Can stay on after power-off for always-on peripherals.'),
    facts: () => [[T('输出能力', 'Output'), 'DC 3.3V@0.4A']],
    controls: () => [row(null, tg('c-ldo', T('输出', 'Enable'), () => R[0x06] & 4, v => A.bit(0x06, 2, v)), big(() => volts(D().ldo ? 3300 : 0))), row(null, tg('c-lhold', T('关机后保持输出', 'Keep on after power-off'), () => R[0x07] & 0x20, v => A.bit(0x07, 5, v)))],
    regs: () => [[0x06, ['LDO']], [0x07, ['LDO']]], group: () => 'pwr',
  },
  CHG_PROG: {
    lede: () => T('选择充电电流：悬空 180mA，接地 650mA。', 'Charge current: floating = 180 mA, grounded = 650 mA.'),
    controls: () => [row(null, seg('c-prog', [[false, T('悬空', 'Float')], [true, T('接地', 'GND')]], () => S.gnd, v => A.setGnd(v)), big(() => { const d = D(); return d.chg ? d.ichg + ' mA' : d.full ? T('已充满', 'Full') : '—'; }))],
    regs: () => [],
  },
  CHRG_STAT: {
    lede: () => T('充电状态：充电中为低，充满或未充电为高。', 'Charge status: low while charging, high when full or idle.'),
    controls: () => [row(null, tg('c-chg', T('允许充电', 'Charging enabled'), () => R[0x06] & 1, v => A.bit(0x06, 0, v)), big(() => (D().py ? (D().chg ? 'LOW' : 'HIGH') : '—')))],
    regs: () => [[0x06, ['CHG']]], group: () => 'pwr',
  },
  PWR_BTN: {
    lede: () => T('电源按键，按下接地。', 'Power button, active low.'),
    controls: () => {
      const b = el('button', { class: 'btnPress', id: 'c-press', type: 'button' }, 'PWR');
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); phys(btnDown); });
      const up = () => { b.classList.remove('down'); phys(btnUp); };
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', () => S.btn.down && up());
      const res = { on: T('开机', 'Power on'), reset: T('复位', 'Reset'), off: T('关机', 'Power off'), dl: T('下载模式', 'Download mode'), irq: T('中断', 'IRQ'), locked: T('已锁定', 'Locked') };
      const g = el('div', { class: 'gest' });
      const line = (k, lab, fn) => { const a = txt(lab), v = el('span'); g.append(a, v); bind(() => { v.textContent = fn(); const hit = S.lastEvt && S.lastEvt[0] === k; a.className = v.className = hit ? 'hit' : ''; }); };
      line('click', () => T('单击', 'Click'), () => (S.sys === 'off' ? res.on : R[0x49] & 1 ? res.irq : res.reset));
      line('double', () => T('双击', 'Double'), () => (S.sys === 'off' ? res.on : R[0x4A] & 1 ? res.irq : res.off));
      line('long', () => T(`长按 ${btnLong() / 1000}s`, `Hold ${btnLong() / 1000}s`), () => (S.sys === 'off' ? res.on : R[0x49] & 0x80 ? res.locked : res.dl));
      return [
        row(null, b, el('div', {}, g, el('div', { style: 'margin-top:6px' }, stateView()))),
        row(T('双击间隔', 'Double gap'), seg('c-dblt', [[0, '125'], [1, '250'], [2, '500'], [3, '1000 ms']], () => fld(0x49, 5, 2), v => A.fld(0x49, 5, 2, v))),
        row(T('长按', 'Hold'), seg('c-longt', [[0, '1s'], [1, '2s'], [2, '3s'], [3, '4s']], () => fld(0x49, 3, 2), v => A.fld(0x49, 3, 2, v))),
        row(null, tg('c-srd', T('单击改为中断', 'Click → IRQ'), () => R[0x49] & 1, v => A.bit(0x49, 0, v)), tg('c-dpd', T('双击改为中断', 'Double → IRQ'), () => R[0x4A] & 1, v => A.bit(0x4A, 0, v)))];
    },
    regs: () => [[0x49, ['DBL', 'LONG', 'RST_DIS']], [0x4A], [0x48], [0x42, ['CLICK', 'DOUBLE']], [0x05, ['PWRBTN', 'RSTBTN']]], group: () => 'btn',
  },
  BOOT_OUT: {
    lede: () => T('接主控 BOOT 脚。拉低后重启主控，主控进入下载模式。', 'Goes to the MCU BOOT pin. Held low while the MCU restarts, so it boots into download mode.'),
    controls: () => [
      row(null, bt('c-dlcmd', T('进入下载模式', 'Enter download mode'), () => A.sysCmd(3)), bt('c-dlexit', T('重启', 'Reboot'), () => A.sysCmd(2))),
      row(null, big(() => (D().bootLow ? 'LOW' : 'HIGH')), stateView()),
      row(null, tg('c-dllock', T('禁止下载模式', 'Lock download mode'), () => R[0x49] & 0x80, v => A.bit(0x49, 7, v))),
      el('div', { class: 'pn' }, T('长按 PWR_BTN 也能进入。锁定后要断电才能解除', 'Holding PWR_BTN does the same. The lock stays until power is removed'))],
    regs: () => [[0x49, ['DL_LOCK']], [0x0C]], group: () => 'btn',
  },
  LED_PWR_EN: {
    lede: () => T('电源指示灯。复位时闪一下，下载模式下 500ms 闪烁。', 'Power LED. Blinks once on reset and every 500 ms in download mode.'),
    controls: () => [row(null, tg('c-led', T('点亮', 'On'), () => R[0x06] & 0x10, v => A.bit(0x06, 4, v)), big(() => (ledState() ? T('亮', 'ON') : T('灭', 'OFF'))))],
    regs: () => [[0x06, ['LED']], [0x13, ['LED_EN']]], group: () => 'pwr',
  },
  I2C: {
    name: 'I2C_SDA / SCL',
    lede: () => T('I²C 接口，地址 0x6E，需外部上拉。', 'I²C interface at 0x6E. Needs external pull-ups.'),
    facts: () => [[T('空闲休眠', 'Idle sleep'), T('首次通信只唤醒，需重试', 'first access only wakes it; retry')]],
    controls: () => [
      row(T('速率', 'Speed'), seg('c-spd', [[0, '100k'], [1, '400k']], () => fld(0x09, 4, 1), v => A.bit(0x09, 4, v))),
      row(T('空闲休眠', 'Idle sleep'), seg('c-slp', [[0, T('关', 'Off')], [3, '3s'], [5, '5s'], [10, '10s']], () => fld(0x09, 0, 4), v => A.fld(0x09, 0, 4, v))),
      row(null, bt('c-ping', T('读一次', 'Read once'), () => act(() => {})), stateView())],
    regs: () => [[0x09]], group: () => 'sys',
  },
  GND: { lede: () => T('地。', 'Ground.'), controls: () => [], regs: () => [] },
};
for (let i = 0; i < 5; i++) {
  INFO['G' + i] = {
    lede: () => T(...GPIO_LEDE[i]),
    facts: () => [[T('默认', 'Default'), T('输入，开漏', 'input, open-drain')]],
    controls: () => gpioControls(i), regs: () => gpioRegs(i), group: () => gpioGroup(i),
  };
}
