/* Register map with per-field meaning. Source: lib/M5PM1/src/M5PM1.h and the M5PM1 datasheet.
 * Field: [name, hiBit, loBit, describe(value) -> text, writable?]
 * A register without fields is a plain byte / multi-byte value: { n, bytes, fmt }. */
'use strict';
const yes = (zh, en, zh0, en0) => v => (v ? T(zh, en) : T(zh0, en0));
const pick = arr => v => (arr[v] ? T(...arr[v]) : String(v));
const gp = (desc) => [4, 3, 2, 1, 0].map(i => ['G' + i, i, i, desc(i), true]);
const PULLS = [['无上下拉', 'no pull'], ['上拉', 'pull-up'], ['下拉', 'pull-down'], ['保留', 'reserved']];
const FUNCS = (alt) => [['普通 GPIO', 'GPIO'], ['中断输出 IRQ', 'IRQ output'], ['唤醒', 'wake'], alt];
const ALTS = [['NeoPixel', 'NeoPixel'], ['ADC1', 'ADC1'], ['ADC2', 'ADC2'], ['PWM 通道 0', 'PWM channel 0'], ['PWM 通道 1', 'PWM channel 1']];
const MS4 = ['125 ms', '250 ms', '500 ms', '1 s'].map(s => [s, s]);

const RMAP = [
  { grp: 'sys', a: 0x00, n: 'Device_ID', ro: 1, desc: ['设备类型', 'Device type'] },
  { grp: 'sys', a: 0x01, n: 'Device_Model', ro: 1, desc: ['设备型号', 'Device model'] },
  { grp: 'sys', a: 0x02, n: 'HW_REV', ro: 1, desc: ['硬件版本', 'Hardware revision'] },
  { grp: 'sys', a: 0x03, n: 'SW_REV', ro: 1, desc: ['固件版本', 'Firmware revision'] },
  { grp: 'pwr', a: 0x04, n: 'PWR_SRC', ro: 1, desc: ['当前有电的电源', 'Which supplies are present'], f: [
    ['BAT', 2, 2, yes('电池有效', 'battery present', '无电池', 'no battery')],
    ['5VINOUT', 1, 1, yes('EXT_5V_INOUT 有输入', 'EXT_5V_INOUT input present', '无输入（或正在升压输出）', 'no input (or boosting)')],
    ['5VIN', 0, 0, yes('5V_IN 有输入', '5V_IN present', '5V_IN 无输入', '5V_IN absent')]] },
  { grp: 'pwr', a: 0x05, n: 'WAKE_SRC', desc: ['本次开机原因，写 0 清除', 'Why it powered on; write 0 to clear'], f: [
    ['5VINOUT', 6, 6, yes('EXT_5V_INOUT 插入开机', 'EXT_5V_INOUT plug-in', '—', '—'), true],
    ['EXT_WAKE', 5, 5, yes('GPIO 唤醒开机', 'GPIO wake', '—', '—'), true],
    ['CMD_RST', 4, 4, yes('SYS_CMD 命令重启', 'SYS_CMD reboot', '—', '—'), true],
    ['RSTBTN', 3, 3, yes('按键复位', 'button reset', '—', '—'), true],
    ['PWRBTN', 2, 2, yes('按键开机', 'button power-on', '—', '—'), true],
    ['VIN', 1, 1, yes('5V_IN 插入开机', '5V_IN plug-in', '—', '—'), true],
    ['TIM', 0, 0, yes('定时器开机', 'timer', '—', '—'), true]] },
  { grp: 'pwr', a: 0x06, n: 'PWR_CFG', desc: ['电源开关', 'Power switches'], f: [
    ['LED', 4, 4, yes('LED_PWR_EN 高，指示灯亮', 'LED_PWR_EN high, LED on', 'LED_PWR_EN 低，指示灯灭', 'LED_PWR_EN low, LED off'), true],
    ['BOOST', 3, 3, yes('5V 升压开，EXT_5V_INOUT 输出', 'boost on, EXT_5V_INOUT outputs', '升压关，EXT_5V_INOUT 可作输入', 'boost off, EXT_5V_INOUT is an input'), true],
    ['LDO', 2, 2, yes('3V3_LDO_OUT 开', '3V3_LDO_OUT on', '3V3_LDO_OUT 关', '3V3_LDO_OUT off'), true],
    ['DCDC', 1, 1, yes('3V3_DCDC_OUT 开', '3V3_DCDC_OUT on', '3V3_DCDC_OUT 关', '3V3_DCDC_OUT off'), true],
    ['CHG', 0, 0, yes('允许充电', 'charging enabled', '禁止充电', 'charging disabled'), true]] },
  { grp: 'pwr', a: 0x07, n: 'HOLD_CFG', desc: ['关机后保持的输出；复位/下载模式清零', 'Kept on after power-off; cleared on reset/download'], f: [
    ['5V', 6, 6, yes('关机后 5V 输出保持', '5V out kept after power-off', '关机后 5V 输出关闭', '5V out off after power-off'), true],
    ['LDO', 5, 5, yes('关机后 LDO 保持', 'LDO kept after power-off', '关机后 LDO 关闭', 'LDO off after power-off'), true],
    ...[4, 3, 2, 1, 0].map(i => ['G' + i, i, i, yes(`关机后 G${i} 保持当前状态`, `G${i} keeps its state`, `关机后 G${i} 恢复默认`, `G${i} returns to default`), true])] },
  { grp: 'pwr', a: 0x08, n: 'BATT_LVP', desc: ['电池低压关机阈值 = 2000 mV + n × 7.81 mV', 'Low-battery cut-off = 2000 mV + n × 7.81 mV'], fmt: v => `${v} → ${Math.round(2000 + v * 7.81)} mV` },
  { grp: 'sys', a: 0x09, n: 'I2C_CFG', desc: ['I²C 速率与空闲休眠', 'I²C speed and idle sleep'], f: [
    ['SPD', 4, 4, pick([['100 kHz', '100 kHz'], ['400 kHz', '400 kHz']]), true],
    ['SLP_TO', 3, 0, v => (v ? T(`空闲 ${v}s 后休眠`, `sleep after ${v}s idle`) : T('不休眠', 'never sleep')), true]] },
  { grp: 'sys', a: 0x0A, n: 'WDT_CNT', desc: ['看门狗超时（秒），0 = 关闭', 'Watchdog timeout (s), 0 = off'], fmt: v => (v ? v + ' s' : T('关闭', 'off')) },
  { grp: 'sys', a: 0x0B, n: 'WDT_KEY', wo: 1, desc: ['写 0xA5 喂狗', 'Write 0xA5 to feed'], cmds: [[0xA5, ['喂狗', 'Feed']]] },
  { grp: 'sys', a: 0x0C, n: 'SYS_CMD', wo: 1, desc: ['高 4 位固定 0xA，低 2 位为命令', 'Upper nibble 0xA, low 2 bits = command'], cmds: [[0xA1, ['关机', 'Power off']], [0xA2, ['重启', 'Reboot']], [0xA3, ['下载模式', 'Download mode']]] },

  { grp: 'gpio', a: 0x10, n: 'GPIO_MODE', desc: ['方向（功能为 GPIO 时有效）', 'Direction (when function = GPIO)'], f: gp(i => yes('输出', 'output', '输入', 'input')) },
  { grp: 'gpio', a: 0x11, n: 'GPIO_OUT', desc: ['输出电平', 'Output level'], f: gp(i => pick([['低', 'low'], ['高', 'high']])) },
  { grp: 'gpio', a: 0x12, n: 'GPIO_IN', ro: 1, desc: ['引脚实际电平', 'Actual pin level'], f: gp(i => pick([['低', 'low'], ['高', 'high']])).map(f => (f[4] = false, f)) },
  { grp: 'gpio', a: 0x13, n: 'GPIO_DRV', desc: ['输出类型，默认开漏', 'Output type, open-drain by default'], f: [
    ['LED_EN', 5, 5, yes('LED_PWR_EN 开漏', 'LED_PWR_EN open-drain', 'LED_PWR_EN 推挽', 'LED_PWR_EN push-pull'), true],
    ...gp(i => yes('开漏（需上拉）', 'open-drain (needs pull-up)', '推挽', 'push-pull'))] },
  { grp: 'gpio', a: 0x14, n: 'GPIO_PUPD0', desc: ['G0–G3 上下拉', 'G0–G3 pull'], f: [3, 2, 1, 0].map(i => ['G' + i, 2 * i + 1, 2 * i, pick(PULLS), true]) },
  { grp: 'gpio', a: 0x15, n: 'GPIO_PUPD1', desc: ['G4 上下拉', 'G4 pull'], f: [['G4', 1, 0, pick(PULLS), true]] },
  { grp: 'gpio', a: 0x16, n: 'GPIO_FUNC0', desc: ['G0–G3 功能', 'G0–G3 function'], f: [3, 2, 1, 0].map(i => ['G' + i, 2 * i + 1, 2 * i, pick(FUNCS(ALTS[i])), true]) },
  { grp: 'gpio', a: 0x17, n: 'GPIO_FUNC1', desc: ['G4 功能', 'G4 function'], f: [['G4', 1, 0, pick(FUNCS(ALTS[4])), true]] },
  { grp: 'gpio', a: 0x18, n: 'GPIO_WAKE_EN', desc: ['唤醒使能；G0/G2、G3/G4 二选一，G1 不支持', 'Wake enable; G0/G2 and G3/G4 pick one, G1 unsupported'], f: gp(i => (i === 1 ? () => T('不支持', 'unsupported') : yes('关机时可唤醒', 'wakes from off', '不唤醒', 'no wake'))).map(f => (f[0] === 'G1' && (f[4] = false), f)) },
  { grp: 'gpio', a: 0x19, n: 'GPIO_WAKE_CFG', desc: ['唤醒边沿', 'Wake edge'], f: gp(i => (i === 1 ? () => T('不支持', 'unsupported') : pick([['下降沿', 'falling'], ['上升沿', 'rising']]))).map(f => (f[0] === 'G1' && (f[4] = false), f)) },

  { grp: 'adc', a: 0x20, n: 'VREF', ro: 1, bytes: 2, desc: ['ADC 参考电压', 'ADC reference'], fmt: v => v + ' mV' },
  { grp: 'adc', a: 0x22, n: 'VBAT', ro: 1, bytes: 2, desc: ['电池电压', 'Battery voltage'], fmt: v => v + ' mV' },
  { grp: 'adc', a: 0x24, n: 'VIN', ro: 1, bytes: 2, desc: ['5V_IN 电压', '5V_IN voltage'], fmt: v => v + ' mV' },
  { grp: 'adc', a: 0x26, n: '5VINOUT', ro: 1, bytes: 2, desc: ['EXT_5V_INOUT 电压', 'EXT_5V_INOUT voltage'], fmt: v => v + ' mV' },
  { grp: 'adc', a: 0x28, n: 'ADC_RES', ro: 1, bytes: 2, desc: ['转换结果（12 位）；温度通道单位 ℃', 'Conversion result (12-bit); °C for the temperature channel'], fmt: v => String(v) },
  { grp: 'adc', a: 0x2A, n: 'ADC_CTRL', desc: ['选择通道并启动', 'Pick a channel and start'], f: [
    ['CH_SEL', 3, 1, v => ({ 0: T('未选择', 'none'), 1: 'G1 (ADC1)', 2: 'G2 (ADC2)', 6: T('芯片温度', 'chip temperature') }[v] ?? T('无效', 'invalid')), true],
    ['START', 0, 0, yes('转换中', 'converting', '空闲（写 1 启动）', 'idle (write 1 to start)'), true]] },

  { grp: 'pwm', a: 0x30, n: 'PWM0_L', desc: ['通道 0 (G3) 占空比低 8 位', 'Channel 0 (G3) duty, low 8 bits'], fmt: v => String(v) },
  { grp: 'pwm', a: 0x31, n: 'PWM0_HC', desc: ['通道 0 (G3) 控制', 'Channel 0 (G3) control'], f: [
    ['POL', 5, 5, yes('反相', 'inverted', '正常', 'normal'), true], ['EN', 4, 4, yes('输出', 'running', '停止', 'stopped'), true],
    ['DUTY_H', 3, 0, v => T(`占空比高 4 位 → 合计 ${pwm(0).duty12}/4095 (${pwmPct(0)}%)`, `duty high 4 bits → ${pwm(0).duty12}/4095 (${pwmPct(0)}%)`), true]] },
  { grp: 'pwm', a: 0x32, n: 'PWM1_L', desc: ['通道 1 (G4) 占空比低 8 位', 'Channel 1 (G4) duty, low 8 bits'], fmt: v => String(v) },
  { grp: 'pwm', a: 0x33, n: 'PWM1_HC', desc: ['通道 1 (G4) 控制', 'Channel 1 (G4) control'], f: [
    ['POL', 5, 5, yes('反相', 'inverted', '正常', 'normal'), true], ['EN', 4, 4, yes('输出', 'running', '停止', 'stopped'), true],
    ['DUTY_H', 3, 0, v => T(`占空比高 4 位 → 合计 ${pwm(1).duty12}/4095 (${pwmPct(1)}%)`, `duty high 4 bits → ${pwm(1).duty12}/4095 (${pwmPct(1)}%)`), true]] },
  { grp: 'pwm', a: 0x34, n: 'PWM_FREQ', bytes: 2, desc: ['两个通道共用的频率', 'Frequency shared by both channels'], fmt: v => v + ' Hz' },

  { grp: 'tim', a: 0x38, n: 'TIM_CNT', bytes: 4, desc: ['定时秒数（31 位）', 'Timer seconds (31-bit)'], fmt: v => v + ' s' },
  { grp: 'tim', a: 0x3C, n: 'TIM_CFG', desc: ['定时器；到时执行一次后清零', 'Timer; clears itself after firing'], f: [
    ['ARM', 3, 3, yes('计时中', 'counting', '未启动', 'idle'), true],
    ['ACTION', 2, 0, v => TIM_ACT()[v] ?? T('无效', 'invalid'), true]] },
  { grp: 'tim', a: 0x3D, n: 'TIM_KEY', wo: 1, desc: ['写 0xA5 重新装载', 'Write 0xA5 to reload'], cmds: [[0xA5, ['重新装载', 'Reload']]] },

  { grp: 'irq', a: 0x40, n: 'IRQ_STATUS1', desc: ['输入 GPIO 电平变化；写 0 清除', 'Input GPIO changed; write 0 to clear'], f: gp(i => yes('有变化', 'changed', '—', '—')) },
  { grp: 'irq', a: 0x41, n: 'IRQ_STATUS2', desc: ['电源插拔事件；写 0 清除', 'Power plug events; write 0 to clear'], f: [
    ['BAT_RM', 5, 5, yes('电池移除', 'battery removed', '—', '—'), true], ['BAT_IN', 4, 4, yes('电池插入', 'battery inserted', '—', '—'), true],
    ['INOUT_RM', 3, 3, yes('EXT_5V_INOUT 移除', 'EXT_5V_INOUT removed', '—', '—'), true], ['INOUT_IN', 2, 2, yes('EXT_5V_INOUT 插入', 'EXT_5V_INOUT inserted', '—', '—'), true],
    ['VIN_RM', 1, 1, yes('5V_IN 移除', '5V_IN removed', '—', '—'), true], ['VIN_IN', 0, 0, yes('5V_IN 插入', '5V_IN inserted', '—', '—'), true]] },
  { grp: 'irq', a: 0x42, n: 'IRQ_STATUS3', desc: ['按键与开机事件；写 0 清除', 'Button and wake events; write 0 to clear'], f: [
    ['DOUBLE', 2, 2, yes('双击（双击关机已屏蔽）', 'double click (power-off masked)', '—', '—'), true],
    ['WAKEUP', 1, 1, yes('开机事件；WAKE_SRC 非零时一直为 1', 'wake event; stays 1 while WAKE_SRC ≠ 0', '—', '—'), true],
    ['CLICK', 0, 0, yes('单击（单击复位已屏蔽）', 'click (reset masked)', '—', '—'), true]] },
  { grp: 'irq', a: 0x43, n: 'IRQ1_MASK', desc: ['1 = 屏蔽', '1 = masked'], f: gp(i => yes('屏蔽', 'masked', '允许', 'enabled')) },
  { grp: 'irq', a: 0x44, n: 'IRQ2_MASK', desc: ['1 = 屏蔽', '1 = masked'], f: [['BAT_RM', 5], ['BAT_IN', 4], ['INOUT_RM', 3], ['INOUT_IN', 2], ['VIN_RM', 1], ['VIN_IN', 0]].map(([n, b]) => [n, b, b, yes('屏蔽', 'masked', '允许', 'enabled'), true]) },
  { grp: 'irq', a: 0x45, n: 'IRQ3_MASK', desc: ['1 = 屏蔽', '1 = masked'], f: [['DOUBLE', 2], ['WAKEUP', 1], ['CLICK', 0]].map(([n, b]) => [n, b, b, yes('屏蔽', 'masked', '允许', 'enabled'), true]) },

  { grp: 'btn', a: 0x48, n: 'BTN_STATUS', ro: 1, desc: ['按键状态', 'Button state'], f: [
    ['BTN_FLAG', 7, 7, yes('按过（读后清零）', 'was pressed (clears on read)', '没按过', 'not pressed')],
    ['BTN_STATE', 0, 0, yes('按下', 'pressed', '松开', 'released')]] },
  { grp: 'btn', a: 0x49, n: 'BTN_CFG_1', desc: ['按键时间与行为', 'Button timing and behaviour'], f: [
    ['DL_LOCK', 7, 7, yes('禁止下载模式（断电前不能解除）', 'download mode locked (until power-off)', '允许下载模式', 'download mode allowed'), true],
    ['DBL', 6, 5, pick(MS4), true], ['LONG', 4, 3, v => v + 1 + ' s', true], ['CLICK', 2, 1, pick(MS4), true],
    ['RST_DIS', 0, 0, yes('单击 → 中断', 'click → IRQ', '单击 → 复位', 'click → reset'), true]] },
  { grp: 'btn', a: 0x4A, n: 'BTN_CFG_2', desc: ['双击行为', 'Double-click behaviour'], f: [
    ['OFF_DIS', 0, 0, yes('双击 → 中断', 'double → IRQ', '双击 → 关机', 'double → power off'), true]] },

  { grp: 'neo', a: 0x50, n: 'NEO_CFG', desc: ['G0 上的 NeoPixel', 'NeoPixel on G0'], f: [
    ['REFRESH', 6, 6, yes('刷新中', 'refreshing', '空闲（写 1 把缓冲区发到灯）', 'idle (write 1 to send the buffer)'), true],
    ['LED_CNT', 5, 0, v => (v ? T(`${v} 颗`, `${v} LEDs`) : T('关闭', 'off')), true]] },
];
const RBY = Object.fromEntries(RMAP.map(r => [r.a, r]));
// Status registers where writing 1 has no effect and writing 0 clears the bit.
const CLEAR_ONLY = new Set([0x05, 0x40, 0x41, 0x42]);
const GROUPS = [['pwr', ['电源', 'Power']], ['gpio', ['GPIO', 'GPIO']], ['adc', ['ADC', 'ADC']], ['pwm', ['PWM', 'PWM']], ['tim', ['定时器', 'Timer']], ['irq', ['中断', 'IRQ']], ['btn', ['按键', 'Button']], ['neo', ['RGB', 'RGB']], ['sys', ['系统', 'System']]];

function regValue(r) {
  const n = r.bytes || 1;
  let v = 0;
  for (let k = 0; k < n; k++) v |= regRead(r.a + k) << (8 * k);
  return n === 4 ? v & 0x7FFFFFFF : v;
}
