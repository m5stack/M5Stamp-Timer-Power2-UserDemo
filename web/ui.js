/* Stage (pin map), power path, panel, rendering. */
'use strict';
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
};
let SEL = 'OVERVIEW';
const selKey = k => (k === 'SDA' || k === 'SCL' ? 'I2C' : k);

/* ---------- stage: chip.jpg is 550×700, pads at x 18 / 533, y 34 + 47.3k ---------- */
const IMGX = 455, IMGY = 10, PH = 30;
const padY = k => IMGY + 34 + 47.3 * k;
const COL = { wake: [10, 100], func: [116, 100], int: [222, 76], main: [304, 146] };
const PADS = [];

function buildStage() {
  const svg = $('#stageSvg');
  const cp = sv('clipPath', { id: 'chipClip' }, sv('defs', {}, svg));
  sv('rect', { x: IMGX + 6, y: IMGY + 6, width: 538, height: 688, rx: 10 }, cp);
  sv('image', { href: 'chip.jpg', x: IMGX, y: IMGY, width: 550, height: 700, 'clip-path': 'url(#chipClip)' }, svg);
  const hit = sv('rect', { id: 'chipHit', x: IMGX + 50, y: IMGY + 20, width: 450, height: 660, fill: 'transparent' }, svg);
  hit.addEventListener('click', () => select('OVERVIEW'));
  const seen = new Set();
  const addPin = (p, k, side) => {
    const y = padY(k), px = side === 'L' ? IMGX + 18 : IMGX + 533;
    const g = sv('g', { class: 'pill', 'data-key': selKey(p.key), tabindex: 0, role: 'button', 'aria-label': p.label || p.key }, svg);
    if (!seen.has(p.key)) { g.id = 'pin-' + p.key; seen.add(p.key); }
    const [x, w] = side === 'L' ? COL.main : [1025, 150];
    sv('line', { class: 'lead', x1: side === 'L' ? x + w : px, y1: y, x2: side === 'L' ? px : x, y2: y }, g);
    sv('rect', { class: 'base', x, y: y - PH / 2, width: w, height: PH, rx: 5, fill: CLR[p.t], stroke: p.t === 'gnd' ? '#555' : 'none' }, g);
    sv('text', { x: x + w / 2, y, fill: '#fff' }, g).textContent = p.label || p.key;
    PADS.push({ key: p.key, g, pad: sv('circle', { class: 'pad', cx: px, cy: y, r: 11 }, g) });
    sv('circle', { class: 'ring', cx: px, cy: y, r: 16 }, g);
    (p.alt || []).forEach((a, j) => {
      if (!a) return;
      const [ax, aw] = [COL.int, COL.func, COL.wake][j];
      const ag = sv('g', { class: 'alt', 'data-alt': a[1], 'data-pin': p.key }, g);
      sv('rect', { x: ax, y: y - PH / 2, width: aw, height: PH, rx: 5, fill: CLR[a[1]] }, ag);
      sv('text', { x: ax + aw / 2, y, fill: a[1] === 'pwm' ? '#222' : '#fff' }, ag).textContent = a[0];
    });
    const go = () => select(selKey(p.key));
    g.addEventListener('click', go);
    g.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
  };
  LEFT.forEach((p, k) => addPin(p, k, 'L'));
  RIGHT.forEach((p, k) => addPin(p, k, 'R'));
}

function buildLegend() {
  const box = $('#legend'); box.textContent = '';
  [['pwr', T('有电', 'Powered')], ['out', T('5V 输出', '5V out')], ['chg', T('充电', 'Charging')], ['hi', 'HIGH'], ['lo', 'LOW'], ['low', T('拉低', 'Pulled low')]]
    .forEach(([k, lab]) => { const i = el('i'); i.style.background = PADFILL[k]; box.append(el('span', {}, i, lab)); });
}

function buildPinList() {
  const box = $('#pinList'); box.textContent = '';
  const seen = new Set();
  [{ key: 'OVERVIEW', t: 'pwr', label: 'M5PM1' }, ...LEFT, ...RIGHT].forEach(p => {
    const k = selKey(p.key); if (seen.has(k)) return; seen.add(k);
    const b = el('button', { type: 'button', 'data-key': k, onclick: () => select(k) }, k === 'I2C' ? 'I2C' : p.label || p.key);
    b.style.background = CLR[p.t]; if (p.t === 'gnd') b.style.border = '1px solid #555';
    box.append(b);
  });
}

const PADFILL = { pwr: '#ff3b30', out: '#ff8a00', chg: '#f5b400', low: '#ff4fd8', led: '#35e05a', i2c: '#3aa0f0', hi: '#ffb020', lo: '#2f86e0', adc: '#11b5ae', pwm: '#ff4fa0' };
function padState(key) {
  const d = D();
  switch (key) {
    case '5V_IN': return S.vin && 'pwr';
    case 'EXT_5V_INOUT': return d.boostOn ? 'out' : d.extIn && 'pwr';
    case 'VBAT': return d.chg ? 'chg' : d.batOk && 'pwr';
    case 'SYS_VBUS': return d.vbusOk && 'pwr';
    case 'PY_3V3_OUT': return d.py > 0 && 'pwr';
    case '3V3_DCDC_OUT': return d.dcdc && 'pwr';
    case '3V3_LDO_OUT': return d.ldo && 'pwr';
    case 'CHG_PROG': return S.gnd && 'low';
    case 'CHRG_STAT': return d.chg && 'low';
    case 'PWR_BTN': return S.btn.down && 'low';
    case 'BOOT_OUT': return d.bootLow && 'low';
    case 'LED_PWR_EN': return ledState() && 'led';
    case 'SDA': case 'SCL': return Date.now() < S.flashI2c && 'i2c';
  }
  if (!/^G\d$/.test(key)) return '';
  const v = pinLevel(+key[1]);
  return v === 1 ? 'hi' : v === 0 ? 'lo' : v === 'z' ? '' : v;
}
function altActive(pin, type) {
  const i = +pin[1], g = S.r.gpio[i];
  return type === 'int' ? g.func === 1 : type === 'wake' ? !!S.r.wake[i] : g.func === 3;
}
function renderStage() {
  PADS.forEach(p => {
    const st = padState(p.key) || '';
    p.pad.setAttribute('class', 'pad' + (st === 'neo' || st === 'pwm' ? ' ' + st : ''));
    p.pad.style.fill = st && st !== 'neo' ? PADFILL[st] : '';
    p.pad.style.fillOpacity = st ? 0.9 : 0;
    p.g.classList.toggle('sel', selKey(p.key) === SEL);
  });
  $$('#stageSvg .alt').forEach(a => a.classList.toggle('act', altActive(a.dataset.pin, a.dataset.alt)));
  $$('#pinList button').forEach(b => b.classList.toggle('sel', b.dataset.key === SEL));
}

/* ---------- power path ---------- */
const TN = {
  vin: [20, 22, 160, 52, '5V_IN', '5V_IN'],
  ext: [20, 102, 160, 52, 'EXT_5V_INOUT', 'EXT_5V_INOUT'],
  bat: [20, 182, 160, 52, 'VBAT', 'VBAT'],
  chg: [250, 182, 130, 52, 'LGS4056HDA', 'CHG_PROG'],
  sys: [470, 78, 150, 100, 'SYS_VBUS', 'SYS_VBUS'],
  dout: [760, 8, 210, 50, '3V3_DCDC_OUT', '3V3_DCDC_OUT'],
  lout: [760, 72, 210, 50, '3V3_LDO_OUT', '3V3_LDO_OUT'],
  pout: [760, 136, 210, 50, 'PY_3V3_OUT', 'PY_3V3_OUT'],
  eout: [760, 200, 210, 50, 'EXT_5V_INOUT', 'EXT_5V_INOUT'],
};
const TE = {
  vin: 'M180 48 H420', ext: 'M180 128 H420', int5: 'M420 48 V128 M420 113 H470', int5chg: 'M420 128 V208 H380',
  chgbat: 'M250 208 H180', batsys: 'M100 234 V262 H440 V143 H470',
  dout: 'M620 128 H690 V33 H760', lout: 'M690 97 H760', pout: 'M620 128 H690 V161 H760', eout: 'M690 161 V225 H760',
};
const TREF = {};
function buildTree() {
  const svg = $('#treeSvg'); svg.textContent = '';
  svg.setAttribute('viewBox', '0 0 990 272');
  for (const [id, d] of Object.entries(TE)) TREF['e' + id] = sv('path', { class: 'ed', d }, svg);
  for (const [id, [x, y, w, h, t1, pin]] of Object.entries(TN)) {
    const g = sv('g', { class: 'tn' }, svg);
    sv('rect', { x, y, width: w, height: h, rx: 8 }, g);
    sv('text', { class: 't1', x: x + w / 2, y: y + h / 2 - 4 }, g).textContent = t1;
    TREF['v' + id] = sv('text', { class: 't2', x: x + w / 2, y: y + h / 2 + 14 }, g);
    TREF['n' + id] = g;
    g.addEventListener('click', () => select(pin));
  }
}
function renderTree() {
  const d = D();
  const E = { vin: S.vin, ext: d.extIn, int5: d.int5, int5chg: d.int5 && S.bat, chgbat: d.chg && 'chg', batsys: !d.int5 && d.batOk, dout: d.dcdc, lout: d.ldo, pout: d.py > 0, eout: d.boostOn };
  for (const [id, v] of Object.entries(E)) TREF['e' + id].setAttribute('class', 'ed' + (v === 'chg' ? ' chg' : v ? ' on' : ''));
  const V = {
    vin: S.vin ? '5.00 V' : '—', ext: d.extIn ? '5.00 V' : '—', bat: S.bat ? volts(S.vbat) : '—',
    chg: d.chg ? d.ichg + ' mA' : d.full ? T('已充满', 'full') : '—', sys: d.vbusOk ? volts(d.vbus) : '—',
    dout: d.dcdc ? '3.30 V' : '—', lout: d.ldo ? '3.30 V' : '—', pout: d.py ? '3.30 V' : '—', eout: d.boostOn ? T('输出 5.05 V', 'out 5.05 V') : '—',
  };
  const ON = { vin: S.vin, ext: d.extIn, bat: d.batOk, chg: d.chg, sys: d.vbusOk, dout: d.dcdc, lout: d.ldo, pout: d.py > 0, eout: d.boostOn };
  for (const id of Object.keys(TN)) {
    if (TREF['v' + id].textContent !== V[id]) TREF['v' + id].textContent = V[id];
    const g = TREF['n' + id];
    g.classList.toggle('on', !!ON[id] && id !== 'chg');
    g.classList.toggle('chg', id === 'chg' && d.chg);
    g.classList.toggle('hl', TN[id][5] === SEL || (SEL === 'CHRG_STAT' && id === 'chg'));
  }
}

/* ---------- header power sources ---------- */
const SRC_BINDS = [];
function buildSources() {
  const box = $('#sources'); box.textContent = ''; SRC_BINDS.length = 0;
  box.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
  const src = (id, label, get, set) => {
    const b = el('button', { class: 'src', id, type: 'button', onclick: () => set(!get()) }, label);
    SRC_BINDS.push(() => b.setAttribute('aria-pressed', String(!!get())));
    box.append(b);
  };
  src('src-vin', '5V_IN', () => S.vin, v => A.setVin(v));
  src('src-bat', T('电池', 'Battery'), () => S.bat, v => A.setBat(v));
  src('src-ext', 'EXT 5V', () => S.ext, v => A.setExt(v));
}

/* ---------- register bitfield ---------- */
function regView(a, mine = []) {
  const def = REGDEF[a];
  const head = el('div', { class: 'rh' }, el('span', { class: 'a' }, hex(a)), el('b', {}, def.n));
  const box = el('div', { class: 'reg' }, head);
  if (!def.f) {
    head.append(txt(() => def.fmt(regGet(a)), 'v'));
    return box;
  }
  head.append(txt(() => hex(regGet(a)), 'v'));
  // Named fields only; 1-bit flags light up when set, multi-bit fields show their decoded value.
  const bf = el('div', { class: 'bf' });
  const dec = DEC[a] || {};
  let hiBit = 7;
  const cells = [];
  def.f.forEach(([name, w]) => {
    const lo = hiBit - w + 1; hiBit = lo - 1;
    if (name === '-' || (mine.length && !mine.includes(name))) return;
    const flag = w === 1 && !dec[name];
    const c = el('div', { class: 'c' + (flag ? ' flag' : ' multi'), title: `bit ${w > 1 ? `${lo + w - 1}:${lo}` : lo}` },
      el('span', { class: 'n' }, name), flag ? null : el('span', { class: 'b' }));
    bf.append(c);
    cells.push({ c, lo, w, name, flag });
  });
  bind(() => {
    const v = regGet(a);
    cells.forEach(({ c, lo, w, name, flag }) => {
      const f = (v >> lo) & ((1 << w) - 1);
      c.classList.toggle('one', flag && f === 1);
      if (!flag) { const t = dec[name] ? dec[name](f) : String(f); if (c.lastChild.textContent !== t) c.lastChild.textContent = t; }
    });
  });
  box.append(bf);
  return box;
}

/* ---------- panel ---------- */
function buildPanel() {
  BINDS = [];
  const box = $('#panel'), keep = box.scrollTop; box.textContent = '';
  const info = INFO[SEL] || INFO.OVERVIEW;
  const nums = SEL === 'I2C' ? [12, 13] : PINNUM[SEL];
  const tag = el('span', { class: 'tag' }, T(...TAG[info.t]));
  tag.style.background = CLR[info.t];
  box.append(el('div', { class: 'ph' }, el('h2', {}, info.name || SEL), tag,
    nums ? el('span', { class: 'pn' }, '#' + nums.join(', #')) : null,
    SEL !== 'OVERVIEW' ? el('button', { class: 'back', type: 'button', onclick: () => select('OVERVIEW') }, '← M5PM1') : null));
  box.append(el('p', { class: 'lede' }, info.lede()));
  const facts = info.facts ? info.facts() : [];
  if (facts.length) box.append(el('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));
  const ctl = info.controls();
  if (ctl.length) box.append(el('div', { class: 'sec' }, ...ctl));
  const regs = info.regs();
  if (regs.length) box.append(sec(T('寄存器', 'Registers'), ...regs.map(([a, mine]) => regView(a, mine))));
  if (info.code) {
    const code = info.code();
    box.append(el('details', { class: 'sec' }, el('summary', {}, 'Arduino'), el('pre', { class: 'code' }, el('code', {}, code))));
  }
  BINDS.forEach(f => f());
  box.scrollTop = keep;
}

/* ---------- glue ---------- */
function render() {
  if (!PADS.length) return;
  renderStage(); renderTree();
  SRC_BINDS.forEach(f => f());
  BINDS.forEach(f => f());
}
function select(k) { SEL = k || 'OVERVIEW'; buildPanel(); render(); }
function setLang(l) {
  LANG = l; try { localStorage.setItem('stp2-lang', l); } catch (e) {}
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  $$('#langSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
  buildSources(); buildLegend(); buildTree(); buildPinList(); buildPanel(); render();
}

let lastT = Date.now();
function tick() {
  const now = Date.now(), dt = now - lastT; lastT = now;
  btnTick(); timerTick(dt); sleepCheck(); physics(); render();
}

buildStage();
$$('#langSeg button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.l)));
physics();
setLang(LANG);
setInterval(tick, 100);
