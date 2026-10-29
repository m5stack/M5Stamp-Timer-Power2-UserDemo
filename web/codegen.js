/* Arduino code that reproduces the current configuration with the M5PM1 library.
 * Only settings that differ from the power-on defaults are emitted. Function and enum names come from
 * lib/M5PM1/src/M5PM1.h; each line maps to the register it writes. */
'use strict';
const GN = i => `M5PM1_GPIO_NUM_${i}`;
const FUNC_E = ['M5PM1_GPIO_FUNC_GPIO', 'M5PM1_GPIO_FUNC_IRQ', 'M5PM1_GPIO_FUNC_WAKE', 'M5PM1_GPIO_FUNC_OTHER'];
const PULL_E = ['M5PM1_GPIO_PULL_NONE', 'M5PM1_GPIO_PULL_UP', 'M5PM1_GPIO_PULL_DOWN'];
const TIM_E = ['M5PM1_TIM_ACTION_STOP', 'M5PM1_TIM_ACTION_FLAG', 'M5PM1_TIM_ACTION_REBOOT', 'M5PM1_TIM_ACTION_POWERON', 'M5PM1_TIM_ACTION_POWEROFF'];
const MS = ['125MS', '250MS', '500MS', '1000MS'];
const b = v => (v ? 'true' : 'false');

/* Each emitter returns { area, lines: [[code, comment]] } or null when nothing differs from default. */
function cgGpio(i) {
  const L = [], f = G.func(i);
  if (f !== 0) L.push([`pm1.gpioSetFunc(${GN(i)}, ${FUNC_E[f]});`, ['', 'IRQ', '', ['NeoPixel', 'ADC1', 'ADC2', 'PWM0', 'PWM1'][i]][f]]);
  if (G.drv(i) === 0) L.push([`pm1.gpioSetDrive(${GN(i)}, M5PM1_GPIO_DRIVE_PUSHPULL);`, '']);
  if (G.pull(i)) L.push([`pm1.gpioSetPull(${GN(i)}, ${PULL_E[G.pull(i)]});`, '']);
  if (f === 0 && G.mode(i)) {
    L.push([`pm1.gpioSetMode(${GN(i)}, M5PM1_GPIO_MODE_OUTPUT);`, '']);
    L.push([`pm1.gpioSetOutput(${GN(i)}, ${G.out(i)});`, '']);
  }
  if (G.wake(i)) {
    L.push([`pm1.gpioSetWakeEnable(${GN(i)}, true);`, '']);
    L.push([`pm1.gpioSetWakeEdge(${GN(i)}, ${G.edge(i) ? 'M5PM1_GPIO_WAKE_RISING' : 'M5PM1_GPIO_WAKE_FALLING'});`, '']);
  }
  if (G.hold(i)) L.push([`pm1.gpioSetPowerHold(${GN(i)}, true);`, T('关机后保持', 'keep after power-off')]);
  if (f === 3 && (i === 1 || i === 2)) L.push([`uint16_t adc${i};`, ''], [`pm1.analogRead(M5PM1_ADC_CH_${i}, &adc${i});`, `${T('当前约', 'now ≈')} ${adcRaw(S.ain[i])}`]);
  if (f === 3 && i >= 3) {
    const ch = i - 3, p = pwm(ch);
    if (pwmFreq() !== 500) L.push([`pm1.setPwmFrequency(${pwmFreq()});`, T('G3/G4 共用', 'shared by G3/G4')]);
    if (p.en || p.duty12) L.push([`pm1.setPwmDuty12bit(M5PM1_PWM_CH_${ch}, ${p.duty12}, ${b(p.pol)}, ${b(p.en)});`, `${pwmPct(ch)}%`]);
  }
  if (i === 0 && (R[0x50] & 63) && S.neoRGB.length) L.push(...cgNeoLines());
  return L.length ? { area: 'G' + i, lines: L } : null;
}
function cgNeoLines() {
  const n = R[0x50] & 63, c = S.neoRGB, same = c.every(x => x.join() === c[0].join());
  if (same) return [[`m5pm1_rgb_t colors[${n}];`, ''], [`for (auto &c : colors) c = {${c[0].join(', ')}};`, ''], [`pm1.setLeds(colors, ${n}, ${n}, true);`, T('数量不能超过数组长度', 'count must not exceed the array size')]];
  return [[`m5pm1_rgb_t colors[${n}] = {${c.map(x => `{${x.join(',')}}`).join(', ')}};`, ''], [`pm1.setLeds(colors, ${n}, ${n}, true);`, '']];
}
function cgPower() {
  const L = [], p = R[0x06];
  if (!(p & 1)) L.push(['pm1.setChargeEnable(false);', '']);
  if (!(p & 2)) L.push(['pm1.setDcdcEnable(false);', T('主控接在这路会断电', 'cuts an MCU on this rail')]);
  if (!(p & 4)) L.push(['pm1.setLdoEnable(false);', '']);
  if (p & 8) L.push(['uint16_t mv;', ''], ['pm1.read5VInOut(&mv);', ''], ['if (mv < 4000) pm1.setBoostEnable(true);', T('口上没有外部电源才开', 'only when nothing drives the port')]);
  if (!(p & 16)) L.push(['pm1.setLedEnLevel(false);', '']);
  if (R[0x07] & 0x20) L.push(['pm1.ldoSetPowerHold(true);', '']);
  if (R[0x07] & 0x40) L.push(['pm1.boostSetPowerHold(true);', '']);
  if (R[0x08] !== 0x40) L.push([`pm1.setBatteryLvp(${2000 + Math.ceil(R[0x08] * 7.81)});`, `BATT_LVP = ${hex(R[0x08])}`]);
  return L.length ? { area: 'power', lines: L } : null;
}
function cgButton() {
  const L = [], c = R[0x49];
  if (((c >> 5) & 3) !== 1) L.push([`pm1.btnSetConfig(M5PM1_BTN_TYPE_DOUBLE, M5PM1_BTN_DOUBLE_CLICK_DELAY_${MS[(c >> 5) & 3]});`, '']);
  if (((c >> 3) & 3) !== 1) L.push([`pm1.btnSetConfig(M5PM1_BTN_TYPE_LONG, M5PM1_BTN_LONG_PRESS_DELAY_${(((c >> 3) & 3) + 1) * 1000}MS);`, '']);
  if (((c >> 1) & 3) !== 1) L.push([`pm1.btnSetConfig(M5PM1_BTN_TYPE_CLICK, M5PM1_BTN_CLICK_DELAY_${MS[(c >> 1) & 3]});`, '']);
  if (c & 1) L.push(['pm1.setSingleResetDisable(true);', T('单击 → 中断', 'click → IRQ')]);
  if (R[0x4A] & 1) L.push(['pm1.setDoubleOffDisable(true);', T('双击 → 中断', 'double → IRQ')]);
  if (c & 0x80) L.push(['pm1.setDownloadLock(true);', T('断电前不能解除', 'until power-off')]);
  return L.length ? { area: 'button', lines: L } : null;
}
function cgI2c() {
  const v = R[0x09];
  return v ? { area: 'i2c', lines: [[`pm1.setI2cConfig(${v & 15}, ${v & 16 ? 'M5PM1_I2C_SPEED_400K' : 'M5PM1_I2C_SPEED_100K'});`, v & 15 ? T(`空闲 ${v & 15}s 休眠`, `sleep after ${v & 15}s idle`) : '']] } : null;
}
function cgTimer() {
  if (!(R[0x3C] & 8)) return null;
  return { area: 'timer', lines: [[`pm1.timerSet(${timCnt()}, ${TIM_E[R[0x3C] & 7]});`, T(`剩余 ${S.timLeft}s`, `${S.timLeft}s left`)]] };
}
function cgWdt() { return R[0x0A] ? { area: 'sys', lines: [[`pm1.wdtSet(${R[0x0A]});`, T('需周期调用 pm1.wdtFeed()', 'call pm1.wdtFeed() periodically')]] } : null; }
function cgIrqMasks() {
  const L = [];
  const SYS = ['5VIN_INSERT', '5VIN_REMOVE', '5VINOUT_INSERT', '5VINOUT_REMOVE', 'BAT_INSERT', 'BAT_REMOVE'];
  const BTN = ['CLICK', 'WAKE', 'DOUBLE'];
  for (let k = 0; k < 5; k++) if (R[0x43] >> k & 1) L.push([`pm1.irqSetGpioMask(M5PM1_IRQ_GPIO${k}, M5PM1_IRQ_MASK_ENABLE);`, '']);
  for (let k = 0; k < 6; k++) if (R[0x44] >> k & 1) L.push([`pm1.irqSetSysMask(M5PM1_IRQ_SYS_${SYS[k]}, M5PM1_IRQ_MASK_ENABLE);`, '']);
  for (let k = 0; k < 3; k++) if (R[0x45] >> k & 1) L.push([`pm1.irqSetBtnMask(M5PM1_IRQ_BTN_${BTN[k]}, M5PM1_IRQ_MASK_ENABLE);`, '']);
  return L.length ? { area: 'irq', lines: L } : null;
}

// Per-pin read-out example shown when nothing is configured yet, so the panel is never empty.
const CG_READ = {
  '5V_IN': [['uint16_t mv;', ''], ['pm1.readVin(&mv);', () => `${D().vin} mV`]],
  EXT_5V_INOUT: [['uint16_t mv;', ''], ['pm1.read5VInOut(&mv);', () => `${D().vext} mV`]],
  VBAT: [['uint16_t mv;', ''], ['pm1.readVbat(&mv);', () => `${regValue(RBY[0x22])} mV`]],
  SYS_VBUS: [['m5pm1_pwr_src_t src;', ''], ['pm1.getPowerSource(&src);', () => hex(regRead(0x04))]],
  OVERVIEW: [['uint8_t src;', ''], ['pm1.getWakeSource(&src);', () => hex(R[0x05])]],
  PY_3V3_OUT: [['uint8_t id, sw;', ''], ['pm1.getDeviceId(&id);', () => '0x50'], ['pm1.getSwVersion(&sw);', () => '0x06']],
  PWR_BTN: [['bool pressed;', ''], ['pm1.btnGetState(&pressed);', () => b(S.btn.down)]],
  I2C: [['uint8_t id;', ''], ['pm1.getDeviceId(&id);', () => '0x50']],
  BOOT_OUT: [['pm1.enterDownloadMode();', 'SYS_CMD 0xA3']],
};
const AREA_OF = { '5V_IN': 'power', EXT_5V_INOUT: 'power', VBAT: 'power', SYS_VBUS: 'power', '3V3_DCDC_OUT': 'power', '3V3_LDO_OUT': 'power', CHRG_STAT: 'power', LED_PWR_EN: 'power', PWR_BTN: 'button', BOOT_OUT: 'button', I2C: 'i2c', OVERVIEW: 'timer' };

function cgAll() {
  return [cgPower(), ...[0, 1, 2, 3, 4].map(cgGpio), cgButton(), cgTimer(), cgI2c(), cgWdt(), cgIrqMasks()].filter(Boolean);
}
// Within a shared area, only the lines that belong to the selected pin.
const PIN_FILTER = { '5V_IN': /^$/, SYS_VBUS: /^$/, '3V3_DCDC_OUT': /Dcdc/, '3V3_LDO_OUT': /Ldo/, EXT_5V_INOUT: /Boost|5VInOut|\bmv\b/, VBAT: /Lvp|Charge/, CHRG_STAT: /Charge/, LED_PWR_EN: /LedEn/, BOOT_OUT: /DownloadLock/ };
function cgFor(sel) {
  const want = /^G\d$/.test(sel) ? sel : AREA_OF[sel];
  const blk = cgAll().find(x => x.area === want);
  let lines = blk ? blk.lines.slice() : [];
  if (PIN_FILTER[sel]) lines = lines.filter(([c]) => PIN_FILTER[sel].test(c));
  if (sel === 'OVERVIEW') { const w = cgWdt(); if (w) lines.push(...w.lines); }
  return { lines, read: lines.length ? null : CG_READ[sel] || null };
}
function cgSketch() {
  const all = cgAll();
  const body = all.length ? all.map(x => x.lines.map(([c, n]) => '  ' + c + (n ? `  // ${n}` : '')).join('\n')).join('\n\n') : '  // ' + T('当前为默认配置', 'Default configuration');
  return `#include <M5PM1.h>

M5PM1 pm1;

void setup() {
  pm1.begin(&Wire, M5PM1_DEFAULT_ADDR, SDA_PIN, SCL_PIN, M5PM1_I2C_FREQ_100K);

${body}
}

void loop() {}
`;
}
