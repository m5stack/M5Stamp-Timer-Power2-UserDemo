/* Stage (photo / schematic), power path, pin panel, register panel, rendering. */
'use strict';
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
};
let SEL = 'OVERVIEW', VIEW = 'photo';
try { VIEW = localStorage.getItem('stp2-view') === 'schem' ? 'schem' : 'photo'; } catch (e) {}
const selKey = k => (k === 'SDA' || k === 'SCL' ? 'I2C' : k);

/* ---------- photo stage: chip.jpg is 550×700, pads at x 18 / 533, y 34 + 47.3k ---------- */
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
    sv('rect', { class: 'hit', x: side === 'L' ? x : px - 20, y: y - 23, width: side === 'L' ? px - x + 20 : x + w - px + 20, height: 46 }, g);
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
      // PWM labels carry the library channel so they match PWM_CH_0 / PWM_CH_1.
      const label = a[1] === 'pwm' ? `${a[0]}·CH${+p.key[1] - 3}` : a[0];
      sv('text', { x: ax + aw / 2, y, fill: a[1] === 'pwm' ? '#222' : '#fff' }, ag).textContent = label;
    });
    const go = () => select(selKey(p.key));
    g.addEventListener('click', go);
    g.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
  };
  LEFT.forEach((p, k) => addPin(p, k, 'L'));
  RIGHT.forEach((p, k) => addPin(p, k, 'R'));
}

// Four pad states only. Charging blinks the VBAT pad instead of using a separate colour.
const PADFILL = { pwr: '#ff3b30', out: '#ff8a00', hi: '#2ec45a', lo: '#8a96a3' };
function padState(key) {
  const d = D();
  switch (key) {
    case '5V_IN': return S.vin && 'pwr';
    case 'EXT_5V_INOUT': return d.boostOn ? 'out' : d.extIn && 'pwr';
    case 'VBAT': return d.batOk && (d.chg ? 'chg' : 'pwr');
    case 'SYS_VBUS': return d.vbusOk && 'pwr';
    case 'PY_3V3_OUT': return d.py > 0 && 'pwr';
    case '3V3_DCDC_OUT': return d.dcdc && 'pwr';
    case '3V3_LDO_OUT': return d.ldo && 'pwr';
    case 'CHG_PROG': return S.gnd && 'lo';
    case 'CHRG_STAT': return d.py ? (d.chg ? 'lo' : 'hi') : '';
    case 'PWR_BTN': return d.vbusOk && (S.btn.down ? 'lo' : 'hi');
    case 'BOOT_OUT': return d.vbusOk && (d.bootLow ? 'lo' : 'hi');
    case 'LED_PWR_EN': return d.vbusOk && (ledState() ? 'hi' : 'lo');
    case 'SDA': case 'SCL': return Date.now() < S.flashI2c ? 'act' : '';
  }
  if (!/^G\d$/.test(key)) return '';
  const v = pinLevel(+key[1]);
  return v === 1 ? 'hi' : v === 0 ? 'lo' : v === 'z' || v === 'adc' ? '' : v;
}
const altActive = (pin, type) => { const i = +pin[1]; return type === 'int' ? G.func(i) === 1 : type === 'wake' ? !!G.wake(i) : G.func(i) === 3; };
function renderStage() {
  PADS.forEach(p => {
    const st = padState(p.key) || '';
    const anim = st === 'neo' || st === 'pwm' || st === 'chg' || st === 'act' ? ' ' + st : '';
    p.pad.setAttribute('class', 'pad' + anim);
    p.pad.style.fill = st === 'chg' ? PADFILL.pwr : PADFILL[st] || '';
    p.pad.style.fillOpacity = st ? 0.92 : 0;
    p.g.classList.toggle('sel', selKey(p.key) === SEL);
  });
  $$('#stageSvg .alt').forEach(a => a.classList.toggle('act', altActive(a.dataset.pin, a.dataset.alt)));
}
function buildLegend() {
  const box = $('#legend'); box.textContent = '';
  const item = (cls, color, lab) => { const i = el('i', { class: cls }); if (color) i.style.background = color; box.append(el('span', {}, i, lab)); };
  item('', PADFILL.pwr, T('有电', 'Powered'));
  item('blink', PADFILL.pwr, T('充电', 'Charging'));
  item('', PADFILL.out, T('5V 输出', '5V out'));
  item('', PADFILL.hi, 'HIGH');
  item('', PADFILL.lo, 'LOW');
}
// Narrow screens hide the alternate-function labels, so crop them out of the viewBox to enlarge the chip.
const NARROW = window.matchMedia('(max-width:760px)');
function fitStage() { $('#stageSvg').setAttribute('viewBox', NARROW.matches ? '296 0 894 720' : '0 0 1190 720'); }
NARROW.addEventListener('change', fitStage);
function setView(v) {
  VIEW = v; try { localStorage.setItem('stp2-view', v); } catch (e) {}
  $('#viewPhoto').hidden = v !== 'photo'; $('#viewSchem').hidden = v !== 'schem';
  $$('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  render();
}

/* ---------- power path (compact strip) ---------- */
const TN = {
  vin: [10, 8, 150, 40, '5V_IN', '5V_IN'], ext: [10, 58, 150, 40, 'EXT_5V_INOUT', 'EXT_5V_INOUT'], bat: [10, 108, 150, 40, 'VBAT', 'VBAT'],
  chg: [215, 108, 130, 40, 'LGS4056HDA', 'CHG_PROG'], sys: [400, 46, 150, 64, 'SYS_VBUS', 'SYS_VBUS'],
  dout: [630, 0, 190, 34, '3V3_DCDC_OUT', '3V3_DCDC_OUT'], lout: [630, 40, 190, 34, '3V3_LDO_OUT', '3V3_LDO_OUT'],
  pout: [630, 80, 190, 34, 'PY_3V3_OUT', 'PY_3V3_OUT'], eout: [630, 120, 190, 34, 'EXT_5V_INOUT', 'EXT_5V_INOUT'],
};
const TE = {
  vin: 'M160 28 H360', ext: 'M160 78 H360', int5: 'M360 28 V78 M360 70 H400', int5chg: 'M360 78 V128 H345', chgbat: 'M215 128 H160',
  batsys: 'M85 148 V156 H380 V96 H400', dout: 'M550 78 H590 V17 H630', lout: 'M590 57 H630', pout: 'M550 78 H590 V97 H630', eout: 'M590 97 V137 H630',
};
const TREF = {};
function buildTree() {
  const svg = $('#treeSvg'); svg.textContent = '';
  svg.setAttribute('viewBox', '0 0 830 160');
  for (const [id, d] of Object.entries(TE)) TREF['e' + id] = sv('path', { class: 'ed', d }, svg);
  for (const [id, [x, y, w, h, t1, pin]] of Object.entries(TN)) {
    const g = sv('g', { class: 'tn', tabindex: 0, role: 'button' }, svg);
    sv('rect', { x, y, width: w, height: h, rx: 7 }, g);
    sv('text', { class: 't1', x: x + 10, y: y + h / 2 + 4 }, g).textContent = t1;
    TREF['v' + id] = sv('text', { class: 't2', x: x + w - 10, y: y + h / 2 + 4 }, g);
    TREF['n' + id] = g;
    g.addEventListener('click', () => select(pin));
  }
}
function renderTree() {
  const d = D();
  const E = { vin: S.vin, ext: d.extIn, int5: d.int5, int5chg: d.int5 && S.bat, chgbat: d.chg && 'chg', batsys: !d.int5 && d.batOk, dout: d.dcdc, lout: d.ldo, pout: d.py > 0, eout: d.boostOn };
  for (const [id, v] of Object.entries(E)) TREF['e' + id].setAttribute('class', 'ed' + (v === 'chg' ? ' chg' : v ? ' on' : ''));
  const V = {
    vin: S.vin ? '5.00V' : '', ext: d.extIn ? '5.00V' : '', bat: S.bat ? (S.vbat / 1000).toFixed(2) + 'V' : '',
    chg: d.chg ? d.ichg + 'mA' : d.full ? T('满', 'full') : '', sys: d.vbusOk ? (d.vbus / 1000).toFixed(2) + 'V' : '',
    dout: d.dcdc ? '3.30V' : '', lout: d.ldo ? '3.30V' : '', pout: d.py ? '3.30V' : '', eout: d.boostOn ? '5.05V' : '',
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

/* ---------- header ---------- */
const SRC_BINDS = [];
function buildSources() {
  const box = $('#sources'); box.textContent = ''; SRC_BINDS.length = 0;
  box.append(el('span', { class: 'pn' }, T('供电', 'Supply')));
  const src = (id, label, get, set) => {
    const b = el('button', { class: 'src', id, type: 'button', onclick: () => set(!get()) }, label);
    SRC_BINDS.push(() => b.setAttribute('aria-pressed', String(!!get())));
    box.append(b);
  };
  src('src-vin', '5V_IN', () => S.vin, v => A.setVin(v));
  src('src-bat', 'VBAT', () => S.bat, v => A.setBat(v));
  src('src-ext', 'EXT_5V_INOUT', () => S.ext, v => A.setExt(v));
}

/* ---------- pin panel ---------- */
let codeOpen = true, lastCode = '';
function buildPanel() {
  BINDS = [];
  const box = $('#panel'), keep = box.scrollTop; box.textContent = '';
  const info = INFO[SEL] || INFO.OVERVIEW;
  const t = PINTYPE[SEL] || 'pwr';
  const nums = SEL === 'I2C' ? [12, 13] : PINNUM[SEL];
  const tag = el('span', { class: 'tag' }, T(...TAG[t]));
  tag.style.background = CLR[t];
  box.append(el('div', { class: 'ph' }, el('h2', {}, info.name || SEL), tag,
    nums ? el('span', { class: 'pn' }, '#' + nums.join(', #')) : null,
    SEL !== 'OVERVIEW' ? el('button', { class: 'back', type: 'button', onclick: () => select('OVERVIEW') }, '← M5PM1') : null));
  box.append(el('p', { class: 'lede' }, info.lede()));
  const facts = info.facts ? info.facts() : [];
  if (facts.length) box.append(el('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));
  const ctl = info.controls();
  if (ctl.length) box.append(el('div', { class: 'sec' }, ...ctl));
  const regs = info.regs();
  if (regs.length) {
    const chips = el('div', { class: 'rlinks' }, ...regs.map(([a]) => el('button', { type: 'button', class: 'rlink', onclick: () => regJump(a) }, hex(a) + ' ' + RBY[a].n)));
    box.append(sec(T('寄存器', 'Registers'), chips));
  }
  if (SEL !== 'GND' && SEL !== 'CHG_PROG') box.append(codeBlock());
  BINDS.forEach(f => f());
  box.scrollTop = keep;
}
function codeBlock() {
  const pre = el('pre', { class: 'code' });
  const d = el('details', { class: 'sec code-sec' }, el('summary', {}, 'Arduino'), pre,
    el('div', { class: 'row' }, bt('c-copy', T('复制完整 setup()', 'Copy full setup()'), copySketch), txt(() => (cgAll().length ? T(`共 ${cgAll().length} 组改动`, `${cgAll().length} changed blocks`) : T('默认配置', 'defaults')), 'pn')));
  d.open = codeOpen;
  d.addEventListener('toggle', () => (codeOpen = d.open));
  let prev = null;
  bind(() => {
    const { lines, read } = cgFor(SEL);
    const src = lines.length ? lines : read ? read.map(([c, n]) => [c, typeof n === 'function' ? n() : n]) : [];
    const key = JSON.stringify(src);
    if (key === pre.dataset.k) return;
    pre.dataset.k = key;
    pre.textContent = '';
    if (!src.length) { pre.append(el('span', { class: 'cm' }, T('// 当前为默认配置，改一下设置看看', '// Default configuration. Change a setting to see code'))); prev = []; return; }
    if (!lines.length) pre.append(el('span', { class: 'ln cm' }, T('// 读取当前状态', '// Read the current state')));
    src.forEach(([c, n]) => {
      const ln = el('span', { class: 'ln' }, c, n ? el('span', { class: 'cm' }, '  // ' + n) : null);
      if (prev && !prev.includes(c)) ln.classList.add('new');
      pre.append(ln);
    });
    prev = src.map(x => x[0]);
  });
  return d;
}
function copySketch() {
  const s = cgSketch();
  const done = () => toast(T('已复制', 'Copied'));
  try { navigator.clipboard.writeText(s).then(done, () => fallbackCopy(s, done)); } catch (e) { fallbackCopy(s, done); }
}
function fallbackCopy(s, done) {
  const t = el('textarea', { style: 'position:fixed;opacity:0' }); t.value = s; document.body.append(t); t.select();
  try { document.execCommand('copy'); done(); } catch (e) {}
  t.remove();
}

/* ---------- register panel ---------- */
let RGRP = 'pwr', ROPEN = null;
const RROWS = [];
function buildRegPanel() {
  const tabs = $('#regTabs'); tabs.textContent = '';
  GROUPS.forEach(([g, lab]) => tabs.append(el('button', { type: 'button', 'data-g': g, onclick: () => { RGRP = g; renderRegTabs(); buildRegRows(); } }, T(...lab))));
  renderRegTabs(); buildRegRows();
}
function renderRegTabs() { $$('#regTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === RGRP))); }
function relevant() {
  const info = INFO[SEL]; if (!info) return {};
  const o = {}; info.regs().forEach(([a, f]) => (o[a] = f || null)); return o;
}
function buildRegRows() {
  const box = $('#regRows'); box.textContent = ''; RROWS.length = 0;
  const rel = relevant();
  RMAP.filter(r => r.grp === RGRP).forEach(r => {
    const rowEl = el('div', { class: 'rr' + (r.a in rel ? ' rel' : ''), id: 'reg-' + r.a });
    const head = el('div', { class: 'rr-h' },
      el('span', { class: 'rr-a' }, hex(r.a) + (r.bytes ? '–' + hex(r.a + r.bytes - 1).slice(2) : '')),
      el('span', { class: 'rr-n' }, r.n, r.ro ? el('em', {}, 'R') : r.wo ? el('em', {}, 'W') : null),
      el('span', { class: 'rr-d' }, T(...r.desc)));
    const val = el('span', { class: 'rr-v' });
    head.append(val);
    rowEl.append(head);
    const bits = el('div', { class: 'bits8' });
    const cells = [];
    if (r.wo) {
      bits.append(el('div', { class: 'wo' }, ...(r.cmds || []).map(([v, lab]) => el('button', { type: 'button', class: 'btn', onclick: () => A.wr(r.a, v) }, `${hex(v)} · ${T(...lab)}`)), el('span', { class: 'pn' }, T('只写', 'write-only'))));
    } else if (r.f) {
      // Bit 7 → 0. Reserved bits are drawn as greyed single cells.
      const byBit = {};
      r.f.forEach(f => (byBit[f[1]] = f));
      for (let b = 7; b >= 0;) {
        const f = byBit[b];
        if (!f) { bits.append(el('div', { class: 'cell res', style: 'grid-column:span 1' }, el('i', {}, b), el('b', {}, '–'))); b--; continue; }
        const [name, hi, lo, , wr] = f, w = hi - lo + 1;
        const relF = rel[r.a] === null || (rel[r.a] || []).includes(name);
        const c = el('button', { type: 'button', class: 'cell' + (wr ? ' wr' : ' ro') + (r.a in rel && relF ? ' mine' : ''), style: `grid-column:span ${w}`, title: name },
          el('i', {}, w > 1 ? `${hi}:${lo}` : hi), el('span', { class: 'fn' }, name), el('b'));
        c.addEventListener('click', () => { ROPEN = ROPEN && ROPEN[0] === r.a && ROPEN[1] === name ? null : [r.a, name]; renderRegDetail(); });
        bits.append(c); cells.push({ c, f }); b = lo - 1;
      }
    } else {
      // Plain value: show each byte, then the combined value.
      // Plain value: one cell per byte (high byte first); writable single bytes are edited in place.
      const n = r.bytes || 1;
      for (let k = n - 1; k >= 0; k--) bits.append(el('div', { class: 'byte', 'data-k': k }, el('i', {}, hex(r.a + k)), el('b')));
      if (!r.ro && n === 1) {
        const inp = el('input', { type: 'number', min: 0, max: 255, class: 'rin', 'aria-label': r.n, title: T('写入新值 (0–255)', 'Write a new value (0–255)') });
        inp.addEventListener('change', () => A.wr(r.a, Math.max(0, Math.min(255, +inp.value | 0))));
        bits.append(el('label', { class: 'rin-w' }, el('span', { class: 'pn' }, T('写入', 'Write')), inp));
        RROWS.push({ r, inp });
      }
    }
    rowEl.append(bits);
    const det = el('div', { class: 'rr-det', hidden: '' });
    rowEl.append(det);
    box.append(rowEl);
    RROWS.push({ r, rowEl, val, cells, bits, det });
  });
  renderRegs(true);
}
function renderRegDetail() {
  RROWS.forEach(({ r, det, cells }) => {
    if (!det) return;
    const open = ROPEN && ROPEN[0] === r.a && cells.find(x => x.f[0] === ROPEN[1]);
    det.hidden = !open;
    cells.forEach(({ c, f }) => c.classList.toggle('open', !!open && f[0] === ROPEN[1]));
    if (!open) return;
    const [name, hi, lo, desc, wr] = open.f, w = hi - lo + 1;
    const v = (regValue(r) >> lo) & ((1 << w) - 1);
    det.textContent = '';
    det.append(el('div', {}, el('b', {}, `${name} `), el('span', { class: 'pn' }, `bit ${w > 1 ? hi + ':' + lo : hi} = ${w > 1 ? v + ' (0b' + v.toString(2).padStart(w, '0') + ')' : v}`)),
      el('div', { class: 'det-now' }, desc(v)));
    if (!wr || r.ro) { det.append(el('div', { class: 'pn' }, T('只读', 'Read-only'))); return; }
    const opts = el('div', { class: 'row' });
    if (CLEAR_ONLY.has(r.a)) {
      if (v) opts.append(bt('rd-flip', T('写 0 清除', 'Write 0 to clear'), () => A.fld(r.a, lo, 1, 0)));
      opts.append(el('span', { class: 'pn' }, T('由芯片置 1，主机只能写 0 清除', 'Set by the chip; the host can only clear it')));
      det.append(opts); return;
    }
    if (w === 1) opts.append(bt('rd-flip', v ? T('写 0', 'Write 0') : T('写 1', 'Write 1'), () => A.fld(r.a, lo, 1, v ^ 1)), el('span', { class: 'pn' }, '→ ' + desc(v ^ 1)));
    else if (w <= 3) for (let k = 0; k < 1 << w; k++) opts.append(el('button', { type: 'button', class: 'btn' + (k === v ? ' cur' : ''), onclick: () => A.fld(r.a, lo, w, k) }, `${k} · ${desc(k)}`));
    else { const inp = el('input', { type: 'number', min: 0, max: (1 << w) - 1, value: v, class: 'rin' }); inp.addEventListener('change', () => A.fld(r.a, lo, w, +inp.value | 0)); opts.append(inp, el('span', { class: 'pn' }, `0–${(1 << w) - 1}`)); }
    det.append(opts);
  });
}
const RPREV = {};
function renderRegs(force) {
  RROWS.forEach(x => {
    const { r } = x;
    if (x.inp) { if (document.activeElement !== x.inp) x.inp.value = regRead(r.a); return; }
    const v = regValue(r);
    const n = r.bytes || 1;
    const t = r.fmt ? `${hex(v, 2 * n)} · ${r.fmt(v)}` : hex(v, 2 * n);
    if (x.val.textContent !== t) {
      x.val.textContent = t;
      if (!force && RPREV[r.a] !== undefined && RPREV[r.a] !== v) { x.rowEl.classList.remove('flash'); void x.rowEl.offsetWidth; x.rowEl.classList.add('flash'); }
    }
    RPREV[r.a] = v;
    x.cells.forEach(({ c, f }) => {
      const [, hi, lo] = f, w = hi - lo + 1, fv = (v >> lo) & ((1 << w) - 1);
      const s = w === 1 ? String(fv) : w <= 3 ? fv.toString(2).padStart(w, '0') : String(fv);
      const b = c.lastChild; if (b.textContent !== s) b.textContent = s;
      c.classList.toggle('one', fv !== 0);
    });
    $$('.byte', x.bits).forEach(bEl => { const s = hex(regRead(r.a + +bEl.dataset.k)); if (bEl.lastChild.textContent !== s) bEl.lastChild.textContent = s; });
  });
  if (ROPEN) renderRegDetail();
}
function regAutoGroup() {
  const info = INFO[SEL];
  const g = info && info.group ? info.group() : null;
  if (g && g !== RGRP) { RGRP = g; renderRegTabs(); }
  ROPEN = null; buildRegRows();
}
function regJump(a) {
  const r = RBY[a]; if (!r) return;
  if (r.grp !== RGRP) { RGRP = r.grp; renderRegTabs(); }
  ROPEN = null; buildRegRows();
  const row = $('#reg-' + a);
  if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
}

/* ---------- glue ---------- */
function render() {
  if (!PADS.length) return;
  irqHousekeeping();
  if (VIEW === 'photo') renderStage(); else renderSchem();
  renderTree(); renderRegs();
  SRC_BINDS.forEach(f => f());
  BINDS.forEach(f => f());
}
function select(k) { SEL = k || 'OVERVIEW'; buildPanel(); regAutoGroup(); render(); }
function setLang(l) {
  LANG = l; try { localStorage.setItem('stp2-lang', l); } catch (e) {}
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  $$('#langSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
  $$('[data-zh]').forEach(e => (e.textContent = l === 'zh' ? e.dataset.zh : e.dataset.en));
  buildSources(); buildLegend(); buildTree(); buildRegPanel(); buildPanel(); render();
}
function resetDemo() { resetAll(); neoN = 8; timSec = 10; timAct = 3; ROPEN = null; select('OVERVIEW'); toast(T('已恢复默认', 'Reset to defaults')); }

let lastT = Date.now();
function tick() {
  const now = Date.now(), dt = now - lastT; lastT = now;
  btnTick(); secTick(dt); sleepCheck(); physics(); render();
}

buildStage(); buildSchem(); fitStage();
$$('#langSeg button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.l)));
$$('#viewSeg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));
$('#resetBtn').addEventListener('click', resetDemo);
physics();
setLang(LANG);
setView(VIEW);
setInterval(tick, 100);
