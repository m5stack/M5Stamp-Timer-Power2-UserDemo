/* Schematic view: U7 (PY32_PMIC) from S021 schematic V0.7.1, "Logic Control" block.
 * Each pin: [chip pin no., chip pin name, net name, panel key, kind, level()]
 * kind: out (PMIC drives it), in (PMIC reads it), io, adc, pwr */
'use strict';
const U7_LEFT = [
  [14, 'DCDC3V3_EN_PP', '3V3_DCDC_EN', '3V3_DCDC_OUT', 'out', () => D().dcdc],
  [18, 'LDO3V3_EN_PP', '3V3_LDO_EN', '3V3_LDO_OUT', 'out', () => D().ldo],
  [10, 'BOOST5V_EN_PP', 'EXT_5V_EN', 'EXT_5V_INOUT', 'out', () => D().boostOn],
  [2, 'CHG_EN_PP', 'CHG_EN', 'CHRG_STAT', 'out', () => D().vbusOk && !!(R[0x06] & 1)],
  null,
  [19, '5VOUT_ADC_IN', 'EXT_5V_ADC', 'EXT_5V_INOUT', 'adc', () => D().vext > 2400, () => volts(D().vext)],
  [16, '5VIN_ADC_IN', 'VIN_DETECT', '5V_IN', 'adc', () => S.vin, () => volts(D().vin)],
  null,
  [11, 'BAT_ADC_IN', 'BAT_ADC', 'VBAT', 'adc', () => D().batOk, () => volts(D().batOk ? S.vbat : 0)],
  [1, 'BAT_ADC_EN_OD', 'VBAT_ADC_EN', 'VBAT', 'out', () => D().running],
  null,
  [3, 'G0_WAKEin_IRQout_NEOPIXEL', 'G0_WAKE(0/2)_NEOPIXEL', 'G0', 'io', null],
  [20, 'G2_WAKEin_IRQout_ADC', 'G2_WAKE(0/2)_ADC', 'G2', 'io', null],
  null,
  [12, 'G4_WAKEin_IRQout_PWM', 'G4_WAKE(3/4)_PWM', 'G4', 'io', null],
  [13, 'G3_WAKEin_IRQout_PWM', 'G3_WAKE(3/4)_PWM', 'G3', 'io', null],
  null,
  [17, 'G1_IRQout_ADC', 'G1_ADC_IO', 'G1', 'io', null],
  null,
  [5, 'LED_EN_PP', 'LED_PWR_EN', 'LED_PWR_EN', 'out', () => ledState()],
  null,
  [15, 'BOOT_OUT_OD', 'BOOT_OUT', 'BOOT_OUT', 'out', () => !D().bootLow],
  [7, 'BTN_PU', 'PWR_BTN', 'PWR_BTN', 'in', () => !S.btn.down],
];
const U7_RIGHT = [
  [9, 'I2C_SCL_OD', 'I2C_SCL', 'I2C', 'io', null],
  [8, 'I2C_SDA_OD', 'I2C_SDA', 'I2C', 'io', null],
  null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
  [6, 'VCC', 'PY_3V3', 'PY_3V3_OUT', 'pwr', () => D().py > 0],
  null,
  [4, 'GND', 'GND', 'GND', 'pwr', null],
  ['', 'GND', 'GND', 'GND', 'pwr', null], // second GND pin number is not legible on V0.7.1
];
const NOT_ON_U7 = new Set(['CHG_PROG', 'SYS_VBUS']);

const SCH = { x0: 350, y0: 40, w: 420, wire: 130, step: 26, pins: [] };
function buildSchem() {
  const svg = $('#schemSvg'); svg.textContent = ''; SCH.pins = [];
  const rows = Math.max(U7_LEFT.length, U7_RIGHT.length);
  const H = SCH.y0 * 2 + rows * SCH.step + 10;
  svg.setAttribute('viewBox', `0 0 1040 ${H}`);
  const bx = SCH.x0, bw = SCH.w, by = SCH.y0 - 14, bh = rows * SCH.step + 16;
  sv('rect', { class: 'u7', x: bx, y: by, width: bw, height: bh, rx: 4 }, svg).addEventListener('click', () => select('OVERVIEW'));
  sv('text', { class: 'u7t', x: bx, y: by - 8 }, svg).textContent = 'U7';
  sv('text', { class: 'u7t', x: bx, y: by + bh + 18 }, svg).textContent = 'PY32_PMIC · M5PM1';
  const add = (p, k, side) => {
    if (!p) return;
    const [no, cname, net, key, kind] = p;
    const y = SCH.y0 + k * SCH.step + 6;
    const g = sv('g', { class: 'sp', 'data-key': key, tabindex: 0, role: 'button', 'aria-label': `${net} (U7 pin ${no})` }, svg);
    const xIn = side === 'L' ? bx : bx + bw, xOut = side === 'L' ? bx - SCH.wire : bx + bw + SCH.wire;
    sv('line', { class: 'sw-wire', x1: xOut, y1: y, x2: xIn, y2: y }, g);
    sv('rect', { class: 'sp-hit', x: side === 'L' ? xOut - 190 : xIn, y: y - 12, width: SCH.wire + 190, height: 24 }, g);
    sv('text', { class: 'sp-no', x: side === 'L' ? xIn - 8 : xIn + 8, y: y - 5, 'text-anchor': side === 'L' ? 'end' : 'start' }, g).textContent = no;
    sv('text', { class: 'sp-cn', x: side === 'L' ? xIn + 8 : xIn - 8, y: y + 4, 'text-anchor': side === 'L' ? 'start' : 'end' }, g).textContent = cname;
    sv('text', { class: 'sp-net', x: side === 'L' ? xOut - 8 : xOut + 8, y: y + 4, 'text-anchor': side === 'L' ? 'end' : 'start' }, g).textContent = net;
    const dot = sv('circle', { class: 'sp-dot', cx: xOut, cy: y, r: 6 }, g);
    const st = sv('text', { class: 'sp-st', x: side === 'L' ? xOut + 10 : xOut - 10, y: y - 5, 'text-anchor': side === 'L' ? 'start' : 'end' }, g);
    SCH.pins.push({ p, g, dot, st });
    const go = () => select(key);
    g.addEventListener('click', go);
    g.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
  };
  U7_LEFT.forEach((p, k) => add(p, k, 'L'));
  U7_RIGHT.forEach((p, k) => add(p, k, 'R'));
  SCH.pins.forEach(({ p, g }) => g.classList.add('k-' + p[4]));
}

function schemLevel(p) {
  const [, , , key, kind, fn, vfn] = p;
  if (/^G\d$/.test(key)) {
    const v = pinLevel(+key[1]);
    return { on: v === 1, cls: v === 1 ? 'hi' : v === 0 ? 'lo' : v === 'pwm' ? 'pwm' : v === 'neo' ? 'neo' : '', txt: v === 1 ? 'HIGH' : v === 0 ? 'LOW' : v === 'pwm' ? 'PWM' : v === 'neo' ? 'RGB' : v === 'adc' ? 'ADC' : '' };
  }
  if (key === 'I2C') return { on: false, cls: Date.now() < S.flashI2c ? 'i2c' : '', txt: '' };
  if (!fn) return { on: false, cls: '', txt: '' };
  const v = !!fn();
  if (kind === 'adc') return { on: v, cls: v ? 'pwr' : '', txt: vfn() };
  if (kind === 'pwr') return { on: v, cls: v ? 'pwr' : '', txt: v ? '3.3 V' : '' };
  return { on: v, cls: v ? 'hi' : 'lo', txt: v ? 'HIGH' : 'LOW' };
}
function renderSchem() {
  SCH.pins.forEach(({ p, g, dot, st }) => {
    const s = schemLevel(p);
    dot.setAttribute('class', 'sp-dot' + (s.cls ? ' ' + s.cls : ''));
    if (st.textContent !== s.txt) st.textContent = s.txt;
    g.classList.toggle('sel', p[3] === SEL);
  });
  const note = $('#schemNote');
  const off = NOT_ON_U7.has(SEL);
  note.hidden = !off;
  if (off) note.textContent = T(`${SEL} 不接 M5PM1，在原理图其他位置`, `${SEL} does not connect to the M5PM1; it lives elsewhere on the schematic`);
}
