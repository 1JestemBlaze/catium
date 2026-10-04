const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s), c = window.catium;
let cfg = {}, insts = [], active = null, session = null, preset = 'balanced', mtype = 'mod';
const t = k => I[cfg.lang || 'pl'][k] ?? I.pl[k] ?? k;
const el = (tag, p = {}) => Object.assign(document.createElement(tag), p);
const chip = (txt, on, fn) => el('button', { className: 'chip' + (on ? ' on' : ''), textContent: txt, onclick: fn });
const save = o => { Object.assign(cfg, o); c.setSettings(o); };
const tabBtn = id => document.querySelector(`nav [data-tab="${id}"]`);
const say = x => $('#status').textContent = x;
const LOADERS = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt' };
const curInst = () => insts.find(i => i.id === active);

$$('nav button').forEach(b => b.onclick = () => { $$('nav button,.tab').forEach(x => x.classList.remove('on')); b.classList.add('on'); $('#' + b.dataset.tab).classList.add('on'); });

/* ---- okienka ---- */
function openModal(title, node) { const d = $('#dlg'); d.onclose = null; $('#dlgt').textContent = title; $('#dlgb').replaceChildren(node); d.showModal(); return d; }
$('#dlgx').onclick = () => $('#dlg').close();

/* ---- wybór wersji ---- */
const majorOf = id => (/^(\d+\.\d+)/.exec(id) || [])[1] || 'Snapshoty';
async function versionPicker() {
  let groups = {}, cur = '';
  const root = el('div', { className: 'vbox' }), M = el('div', { className: 'chips' }), S = el('div', { className: 'chips sub' });
  const sn = el('input', { type: 'checkbox' }), sl = el('label', { className: 'chk' }); sl.append(sn, t('snap'));
  const draw = id => { cur = id; const k = majorOf(id); M.innerHTML = ''; S.innerHTML = '';
    Object.keys(groups).forEach(g => M.append(chip(g, g === k, () => draw(groups[g][0]))));
    groups[k].slice(0, 40).forEach(v => S.append(chip(v, v === id, () => draw(v)))); };
  const load = async () => { const v = await c.versions(sn.checked); groups = {}; v.forEach(id => (groups[majorOf(id)] ||= []).push(id)); draw(v.find(x => /^\d+\.\d+(\.\d+)?$/.test(x)) || v[0]); };
  sn.onchange = load; root.append(M, S, sl); await load(); return { node: root, get: () => cur };
}

/* ---- instancje ---- */
async function loadInsts() {
  cfg = await c.getSettings(); insts = cfg.instances || [];
  active = insts.some(i => i.id === cfg.active) ? cfg.active : insts[0]?.id || null; renderInsts(); renderOpt(); renderInstalled();
}
function renderInsts() {
  const g = $('#insts'); g.innerHTML = '';
  insts.forEach(i => {
    const d = el('div', { className: 'inst' + (i.id === active ? ' on' : ''), onclick: () => { active = i.id; save({ active }); renderInsts(); renderOpt(); renderInstalled(); } });
    d.append(el('b', { textContent: i.name }), el('small', { textContent: `${i.mc} · ${LOADERS[i.loader]}` }),
      el('button', { className: 'x', textContent: '×', onclick: async e => { e.stopPropagation(); if (confirm(t('confirmDel'))) { await c.instDelete(i.id); await loadInsts(); } } }));
    g.append(d);
  });
  g.append(el('button', { className: 'inst add', textContent: '+ ' + t('newInst'), onclick: openNew }));
}
async function openNew() {
  const body = el('div', { className: 'form' }), name = el('input', { className: 'search', placeholder: t('instName') });
  let loader = 'fabric'; const lc = el('div', { className: 'chips' });
  Object.keys(LOADERS).forEach(l => { const b = chip(LOADERS[l], l === loader, () => { loader = l; [...lc.children].forEach(x => x.classList.toggle('on', x === b)); }); lc.append(b); });
  const vp = await versionPicker();
  const go = el('button', { className: 'play', textContent: t('create'), onclick: async () => {
    const i = await c.instCreate({ name: name.value.trim() || `${vp.get()} ${LOADERS[loader]}`, mc: vp.get(), loader }); $('#dlg').close(); await loadInsts(); } });
  body.append(name, el('span', { className: 'cap', textContent: t('loader') }), lc, el('span', { className: 'cap', textContent: t('mcver') }), vp.node, go);
  openModal(t('newInst'), body);
}
function pickInstance() {
  return new Promise(res => {
    if (!insts.length) { openModal(t('pickInst'), el('p', { textContent: t('noInst') })); return res(null); }
    if (insts.length === 1) return res(insts[0]);
    const n = el('div', { className: 'chips' });
    insts.forEach(i => n.append(chip(`${i.name} (${i.mc} ${LOADERS[i.loader]})`, i.id === active, () => { res(i); $('#dlg').close(); })));
    openModal(t('pickInst'), n).onclose = () => res(null);
  });
}

/* ---- zainstalowane (włącz/wyłącz/usuń) ---- */
async function renderInstalled() {
  const i = curInst(), kindOf = { mod: 'mod', resourcepack: 'resourcepack', shader: 'shader', modpack: 'mod' }[mtype];
  for (const [box, kind, onlyCos] of [[$('#instmods'), kindOf, false], [$('#instcos'), 'mod', true]]) {
    box.innerHTML = ''; if (!i) { box.textContent = t('noInst'); continue; }
    let files = await c.instFiles({ id: i.id, kind }); if (onlyCos) files = files.filter(f => f.cosmetic);
    if (!files.length) { box.textContent = t('none'); continue; }
    files.forEach(f => { const r = el('div', { className: 'row' + (f.enabled ? '' : ' off') });
      r.append(el('b', { textContent: f.title, title: f.file }),
        el('button', { textContent: f.enabled ? t('on') : t('off'), onclick: async () => { await c.instToggle({ id: i.id, kind, file: f.file }); renderInstalled(); } }),
        el('button', { textContent: t('remove'), onclick: async () => { await c.instRemove({ id: i.id, kind, file: f.file }); renderInstalled(); } }));
      box.append(r); });
  }
}

/* ---- Modrinth ---- */
function modCard(m, kind, cosmetic) {
  const d = el('div', { className: 'mod' }), tx = el('div');
  tx.append(el('b', { textContent: m.title }), el('small', { textContent: m.desc }));
  const b = el('button', { textContent: t('install') });
  b.onclick = async () => {
    try {
      if (kind === 'modpack') { b.disabled = true; b.textContent = t('installing'); const i = await c.packInstall({ project: m.id, name: m.title }); await loadInsts(); b.textContent = t('installed'); return; }
      const inst = await pickInstance(); if (!inst) return;
      if (kind === 'mod' && inst.loader === 'vanilla') return alert(t('needLoader'));
      b.disabled = true; b.textContent = t('installing');
      await c.install({ id: m.id, instId: inst.id, kind, title: m.title, cosmetic }); b.textContent = t('installed'); renderInstalled();
    } catch (e) { b.textContent = t('err'); b.title = e.message; b.disabled = false; }
  };
  d.append(m.icon ? el('img', { src: m.icon, alt: '' }) : el('span', { className: 'ph' }), tx, b); return d;
}
function browser({ input, list, tab, getType, getCat, cosmetic }) {
  let off = 0, tm, busy = false; const more = el('button', { className: 'chip more', textContent: t('more') });
  async function run(reset) {
    if (busy) return; busy = true; if (reset) { off = 0; list.innerHTML = ''; }
    try {
      const type = getType(), r = await c.search({ query: input.value, type, category: getCat(), offset: off, mc: curInst()?.mc });
      if (!r.mods.length && !off) list.textContent = t('noRes');
      r.mods.forEach(m => list.append(modCard(m, type, cosmetic))); off += r.mods.length; more.remove(); more.textContent = t('more'); if (off < r.total) list.append(more);
    } catch (e) { list.textContent = t('fail') + e.message; }
    busy = false;
  }
  more.onclick = () => run(false); input.oninput = () => { clearTimeout(tm); tm = setTimeout(() => run(true), 300); };
  tabBtn(tab).addEventListener('click', () => run(true)); return run;
}
let cat = '', runMods;
function renderTypes() {
  const T = $('#types'), C = $('#modcats'); T.innerHTML = ''; C.innerHTML = '';
  ['mod', 'resourcepack', 'shader', 'modpack'].forEach(k => { const b = chip(t('type_' + k), k === mtype, () => { mtype = k; renderTypes(); runMods?.(true); renderInstalled(); }); T.append(b); });
  C.hidden = mtype !== 'mod';
  ['', 'optimization', 'technology', 'magic', 'adventure', 'utility', 'decoration', 'worldgen', 'library'].forEach(v => { const b = chip(t('cat_' + (v || 'all')), v === cat, () => { cat = v; renderTypes(); runMods?.(true); }); C.append(b); });
}

/* ---- optymalizacja ---- */
function renderOpt() {
  const i = curInst(); $('#optinst').textContent = i ? `${i.name} (${i.mc} ${LOADERS[i.loader]})` : '-';
  const P = $('#presets'); P.innerHTML = '';
  ['balanced', 'max', 'potato'].forEach(k => P.append(chip(t('p_' + k), k === preset, () => { preset = k; renderOpt(); })));
  $('#presetd').textContent = t('d_' + preset);
}
$('#pack').onclick = async () => {
  if (!active) return $('#packout').textContent = t('noInst'); const b = $('#pack'); b.disabled = true; $('#packout').textContent = t('installing');
  try { const r = await c.installPack({ instId: active, preset }); $('#packout').textContent = t('opt_done').replace('{n}', r.done.length) + (r.failed.length ? ' ' + t('skipped') + r.failed.join('; ') : ''); renderInstalled(); }
  catch (e) { $('#packout').textContent = e.message; } b.disabled = false;
};
$('#autoram').onclick = async () => { const g = await c.totalRam(), r = g >= 24 ? 8 : g >= 16 ? 6 : g >= 8 ? 4 : 3; $('#ram').value = r; $('#ram').oninput({ target: $('#ram') }); };

/* ---- skiny i peleryny ---- */
let skinB64 = null, variant = 'classic';
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const skinMsg = x => $('#skinmsg').textContent = x;
function drawSkin(cv, img) {
  const x = cv.getContext('2d'), m = img.height >= 64; x.clearRect(0, 0, 16, 32); x.imageSmoothingEnabled = false;
  const part = (sx, sy, w, h, dx, dy, flip) => { x.save(); if (flip) { x.translate(dx + w, dy); x.scale(-1, 1); x.drawImage(img, sx, sy, w, h, 0, 0, w, h); } else x.drawImage(img, sx, sy, w, h, dx, dy, w, h); x.restore(); };
  part(8, 8, 8, 8, 4, 0); part(20, 20, 8, 12, 4, 8); part(44, 20, 4, 12, 0, 8); part(m ? 36 : 44, m ? 52 : 20, 4, 12, 12, 8, !m);
  part(4, 20, 4, 12, 4, 20); part(m ? 20 : 4, m ? 52 : 20, 4, 12, 8, 20, !m); part(40, 8, 8, 8, 4, 0);
}
async function showSkin() {
  if (session !== 'ms') return skinMsg(t('skin_login'));
  try { const s = await c.skinGet(); if (s.url) drawSkin($('#cur'), await loadImg(s.url.replace('http:', 'https:'))); skinMsg('');
    const C = $('#capes'); C.innerHTML = ''; C.append(chip(t('cape_none'), !s.capes.some(x => x.active), async () => { await c.capeSet(null); showSkin(); }));
    s.capes.forEach(k => C.append(chip(k.alias, k.active, async () => { await c.capeSet(k.id); showSkin(); }))); }
  catch (e) { skinMsg(e.message); }
}
tabBtn('skins').addEventListener('click', showSkin);
$('#pick').onclick = () => $('#skinfile').click();
$('#skinfile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return; const img = await loadImg(URL.createObjectURL(f));
  if (img.width !== 64 || ![32, 64].includes(img.height)) return skinMsg(t('skin_bad')); drawSkin($('#nw'), img);
  const fr = new FileReader(); fr.onload = () => { skinB64 = String(fr.result).split(',')[1]; $('#skinapply').disabled = false; skinMsg(''); }; fr.readAsDataURL(f);
};
$$('[data-v]').forEach(b => b.onclick = () => { variant = b.dataset.v; $$('[data-v]').forEach(x => x.classList.toggle('on', x === b)); });
$('#skinapply').onclick = async () => { if (session !== 'ms') return skinMsg(t('skin_login')); try { await c.skinSet({ b64: skinB64, variant }); skinMsg(t('skin_ok')); showSkin(); } catch (e) { skinMsg(e.message); } };

/* ---- konsola ---- */
const logNode = document.createTextNode(''); $('#log').append(logNode);
c.on('log', s => { const p = $('#log'), bottom = p.scrollTop + p.clientHeight >= p.scrollHeight - 40; logNode.appendData(s.endsWith('\n') ? s : s + '\n');
  if (logNode.length > 300000) logNode.deleteData(0, 100000); if (bottom) p.scrollTop = p.scrollHeight; });
$('#logclear').onclick = () => logNode.data = ''; $('#logcopy').onclick = () => navigator.clipboard.writeText(logNode.data);

/* ---- ustawienia ---- */
const PRESETS_C = ['#ff8a3d', '#4c8dff', '#b69cff', '#4ade80', '#f472b6', '#f87171', '#22d3ee'];
function setAccent(h) {
  const r = document.documentElement.style, [R, G, B] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  r.setProperty('--accent', h); r.setProperty('--on', (R * 299 + G * 587 + B * 114) / 1000 > 150 ? '#0b1220' : '#ffffff');
  $('#accent').value = h; $$('.sw').forEach(b => b.classList.toggle('on', b.dataset.c === h));
}
PRESETS_C.forEach(h => { const b = el('button', { className: 'sw', title: h, onclick: () => { setAccent(h); save({ accent: h }); } }); b.dataset.c = h; b.style.background = h; $('#swatches').append(b); });
$('#accent').oninput = e => { setAccent(e.target.value); save({ accent: e.target.value }); };
$('#dc').onchange = e => save({ discord: e.target.checked }); $('#dcid').oninput = e => save({ discordId: e.target.value });
function renderSettings() {
  const O = $('#onlaunch'); O.innerHTML = '';
  [['keep', 'ol_keep'], ['minimize', 'ol_min'], ['hide', 'ol_hide']].forEach(([v, k]) => O.append(chip(t(k), v === (cfg.onLaunch || 'keep'), () => { save({ onLaunch: v }); renderSettings(); })));
  const L = $('#langs'); L.innerHTML = ''; [['pl', 'Polski'], ['en', 'English']].forEach(([v, n]) => L.append(chip(n, v === (cfg.lang || 'pl'), () => { save({ lang: v }); applyLang(); })));
}
function applyLang() {
  document.documentElement.lang = cfg.lang || 'pl';
  $$('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n)); $$('[data-ph]').forEach(e => e.placeholder = t(e.dataset.ph));
  $('#play').textContent = t('play'); $('#pack').textContent = t('opt_install'); $('#autoram').textContent = t('auto_ram'); $('#updb').textContent = t('upd_btn');
  if (!session) { $('#login').textContent = t('login_ms'); } $('#offline').textContent = t('login_off');
  renderSettings(); renderInsts(); renderOpt(); renderTypes(); renderInstalled();
}

/* ---- logowanie, gra, aktualizacje ---- */
const loggedIn = (name, kind) => { session = kind; $('#login').textContent = name; $('#login').classList.add('in'); if (kind === 'offline') $('#login').classList.remove('in'); };
$('#login').onclick = async () => { try { loggedIn(await c.login(), 'ms'); } catch (e) { say(t('loginFail') + e.message); } };
$('#offline').onclick = () => {
  const n = el('input', { className: 'search', placeholder: 'Nick', maxLength: 16 }), err = el('p', { className: 'status' });
  const ok = el('button', { className: 'play', textContent: t('ok'), onclick: async () => { try { loggedIn(await c.offline(n.value), 'offline'); $('#dlg').close(); } catch (e) { err.textContent = e.message; } } });
  openModal(t('login_off'), el('div')).querySelector('#dlgb').append(el('p', { className: 'hint', textContent: t('offline_hint') }), n, ok, err);
};
$('#ram').oninput = e => { $('#ramv').textContent = e.target.value + ' GB'; save({ ram: +e.target.value }); };
$('#play').onclick = async () => {
  if (!active) return say(t('noInst')); if (!session) return say(t('needLogin'));
  $('#play').disabled = true; say(t('preparing'));
  try { await c.play({ instId: active, ram: +$('#ram').value, jvm: $('#jvm').checked }); } catch (e) { say(e.message); } $('#play').disabled = false;
};
c.on('progress', e => { if (e.total) $('#barfill').style.width = (e.task / e.total * 100) + '%'; });
c.on('status', x => { const o = $('#opt').classList.contains('on') ? $('#packout') : $('#status'); o.textContent = String(x).slice(0, 140); });
c.on('update', u => { $('#upd').hidden = false;
  $('#updt').textContent = u.state === 'available' ? t('upd_avail').replace('{v}', u.version) : u.state === 'downloading' ? t('upd_dl').replace('{p}', u.percent) : t('upd_ready').replace('{v}', u.version);
  $('#updb').hidden = u.state !== 'ready'; });
$('#updb').onclick = () => c.installUpdate();

(async () => {
  cfg = await c.getSettings(); setAccent(cfg.accent || '#ff8a3d');
  $('#ram').value = cfg.ram || 4; $('#ramv').textContent = (cfg.ram || 4) + ' GB'; $('#dc').checked = !!cfg.discord; $('#dcid').value = cfg.discordId || '';
  c.appVersion().then(v => $('#appver').textContent = 'Catium ' + v);
  runMods = browser({ input: $('#q'), list: $('#modlist'), tab: 'mods', getType: () => mtype, getCat: () => mtype === 'mod' ? cat : '' });
  browser({ input: $('#qc'), list: $('#coslist'), tab: 'cos', getType: () => 'mod', getCat: () => 'cosmetic', cosmetic: true });
  applyLang(); await loadInsts();
  if (!insts.length) openNew();
})();
