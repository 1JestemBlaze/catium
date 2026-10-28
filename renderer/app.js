const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s), c = window.catium;
let cfg = {}, insts = [], active = null, session = null, preset = 'balanced', mtype = 'mod';
const t = k => I[cfg.lang || 'pl'][k] ?? I.pl[k] ?? k;
const el = (tag, p = {}) => Object.assign(document.createElement(tag), p);
const chip = (txt, on, fn) => el('button', { className: 'chip' + (on ? ' on' : ''), textContent: txt, onclick: fn });
const save = o => { Object.assign(cfg, o); c.setSettings(o); };
const tabBtn = id => document.querySelector(`nav [data-tab="${id}"]`);
const say = x => $('#status').textContent = x;
const LOADERS = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt' };
const fmtPlay = s => !s ? '' : s < 60 ? '<1 ' + t('min') : `${Math.floor(s / 3600)} ${t('hr')} ${Math.floor(s % 3600 / 60)} ${t('min')}`;
let tick = null, gStart = 0;
const updNow = () => { const d = Math.floor((Date.now() - gStart) / 1000), p = n => String(n).padStart(2, '0'); $('#nowt').textContent = `${t('playing')} ${p(Math.floor(d / 3600))}:${p(Math.floor(d % 3600 / 60))}:${p(d % 60)}`; };
c.on('game', g => { clearInterval(tick); if (g.running) { gStart = g.start; $('#now').hidden = false; updNow(); tick = setInterval(updNow, 1000); } else { $('#now').hidden = true; loadInsts(); } });
const curInst = () => insts.find(i => i.id === active);

$$('nav button').forEach(b => b.onclick = () => { $$('nav button,.tab').forEach(x => x.classList.remove('on')); b.classList.add('on'); $('#' + b.dataset.tab).classList.add('on'); if (b.dataset.tab === 'inst') showView('list'); });

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

/* ---- instalacje ---- */
async function loadInsts() {
  cfg = await c.getSettings(); insts = cfg.instances || [];
  active = insts.some(i => i.id === cfg.active) ? cfg.active : insts[0]?.id || null; renderInsts(); renderOpt(); renderInstalled(); renderMig();
  if (view === 'detail') { if (!curInst()) showView('list'); else $('#dettitle').textContent = instLabel(curInst()); }
}
function renderInsts() {
  const g = $('#insts'); g.innerHTML = '';
  insts.forEach(i => {
    const d = el('div', { className: 'inst' + (i.id === active ? ' on' : ''), onclick: () => { active = i.id; save({ active }); renderInsts(); renderOpt(); renderInstalled(); renderMig(); } });
    d.append(el('b', { textContent: i.name }), el('small', { textContent: `${i.mc} · ${LOADERS[i.loader]}` }), el('small', { textContent: fmtPlay(i.playtime) }), instBtns(i),
      el('button', { className: 'x', textContent: '×', onclick: async e => { e.stopPropagation(); if (confirm(t('confirmDel'))) { await c.instDelete(i.id); await loadInsts(); } } }));
    g.append(d);
  });
  g.append(el('button', { className: 'inst add', textContent: '+ ' + t('newInst'), onclick: openNew }), el('button', { className: 'inst add', textContent: '+ ' + t('mp_new'), onclick: () => { showView('packs'); runPacks?.(true); } }));
  const q = $('#quick'); q.innerHTML = ''; insts.forEach(i => q.append(chip(i.name, i.id === active, () => { active = i.id; save({ active }); renderInsts(); renderOpt(); renderInstalled(); })));
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
  const i = curInst(), kindOf = { mod: 'mod', resourcepack: 'resourcepack', shader: 'shader', modpack: 'mod' }[mtype] || 'mod';
  for (const [box, kind, onlyCos] of [[$('#instmods'), kindOf, false], [$('#instcos'), 'mod', true]]) {
    box.innerHTML = ''; if (!i) { box.textContent = t('noInst'); continue; }
    let files = await c.instFiles({ id: i.id, kind }); if (onlyCos) files = files.filter(f => f.cosmetic);
    if (!onlyCos) { $('#instcount').textContent = t('count').replace('{a}', files.filter(f => f.enabled).length).replace('{b}', files.length); const q = $('#instfilter').value.trim().toLowerCase(); if (q) files = files.filter(f => f.title.toLowerCase().includes(q)); }
    if (!files.length) { box.textContent = t('none'); continue; }
    files.forEach(f => { const r = el('div', { className: 'row' + (f.enabled ? '' : ' off') });
      r.append(el('b', { textContent: f.title, title: f.file }),
        el('button', { textContent: f.enabled ? t('on') : t('off'), onclick: async () => { await c.instToggle({ id: i.id, kind, file: f.file }); renderInstalled(); } }),
        el('button', { textContent: t('remove'), onclick: async () => { await c.instRemove({ id: i.id, kind, file: f.file }); renderInstalled(); } }));
      box.append(r); });
  }
}

$('#instfilter').oninput = () => renderInstalled();
const kindNow = () => ({ mod: 'mod', resourcepack: 'resourcepack', shader: 'shader', modpack: 'mod' }[mtype]);
$('#addown').onclick = async () => { if (active && await c.instAdd({ id: active, kind: kindNow() })) renderInstalled(); };
$('#openf').onclick = () => active && c.instOpen({ id: active, kind: kindNow() });

let migFrom = null, migTo = null, migStep = 1, migBusy = false;
const instLabel = i => `${i.name} (${i.mc} ${LOADERS[i.loader]})`;
function migCards(onPick, exclude, selected) {
  const g = el('div', { className: 'insts' });
  insts.filter(i => i.id !== exclude).forEach(i => { const d = el('button', { className: 'inst' + (i.id === selected ? ' on' : ''), onclick: () => onPick(i.id) });
    d.append(el('b', { textContent: i.name }), el('small', { textContent: `${i.mc} · ${LOADERS[i.loader]}` })); g.append(d); });
  return g;
}
function renderMig() {
  const B = $('#migbox'); B.innerHTML = '';
  if (insts.length < 2) { B.append(el('p', { className: 'hint', textContent: t('mig_need2') })); return; }
  if (!insts.some(i => i.id === migFrom)) { migFrom = null; migStep = 1; } if (!insts.some(i => i.id === migTo) || migTo === migFrom) migTo = null;
  B.append(el('span', { className: 'cap', textContent: t('mig_step').replace('{n}', migStep) }));
  if (migStep === 1) {
    B.append(el('h2', { textContent: t('mig_q1') }), migCards(id => { migFrom = id; migTo = null; migStep = 2; $('#migmsg').textContent = ''; $('#migres').innerHTML = ''; renderMig(); }, null, migFrom));
    return;
  }
  const src = insts.find(i => i.id === migFrom);
  B.append(el('h2', { textContent: t('mig_q2') }), el('p', { className: 'hint', textContent: t('mig_from') + ': ' + instLabel(src) }), migCards(id => { migTo = id; renderMig(); }, migFrom, migTo));
  const row = el('div', { className: 'chips own' });
  row.append(el('button', { className: 'chip', textContent: t('mig_back'), onclick: () => { migStep = 1; renderMig(); } }),
    el('button', { className: 'play', id: 'migrun', textContent: migTo ? t('mig_run') : t('mig_pickto'), disabled: !migTo || migBusy, onclick: runMig })); B.append(row);
  if (migTo) B.append(el('p', { className: 'hint', textContent: instLabel(src) + ' → ' + instLabel(insts.find(i => i.id === migTo)) }));
}
async function runMig() {
  const msg = $('#migmsg'), box = $('#migres'); box.innerHTML = ''; msg.textContent = t('installing'); migBusy = true; renderMig();
  try { const r = await c.migrate({ from: migFrom, to: migTo }); msg.textContent = t('mig_done').replace('{n}', r.done);
    [['mig_missing', r.missing], ['mig_unknown', r.unknown]].forEach(([k, l]) => { if (l.length) { const d = el('div', { className: 'row' }); d.append(el('b', { textContent: t(k) + ': ' + l.join(', '), title: l.join(', ') })); box.append(d); } });
    if (migTo === active) renderInstalled(); }
  catch (e) { msg.textContent = e.message; }
  migBusy = false; renderMig();
}
const TILE_ICONS = { mod: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5"/>', resourcepack: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M3 17l5-5 4 4 3-3 6 6"/>',
  shader: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>' };
const instBtns = i => { const r = el('div', { className: 'instbtns' });
  [['mod', 'b_mods'], ['resourcepack', 'b_res'], ['shader', 'b_shader'], ['world', 'b_world']].forEach(([k, l]) => { const b = el('button', { className: 'tilebtn', onclick: e => { e.stopPropagation(); openDetail(i.id, k); } });
    b.innerHTML = '<svg viewBox="0 0 24 24">' + TILE_ICONS[k] + '</svg><span></span>'; b.querySelector('span').textContent = t(l); r.append(b); }); return r; };
let view = 'list';
function showView(v) { view = v; $('#instlist').hidden = v !== 'list'; $('#instdetail').hidden = v !== 'detail'; $('#packview').hidden = v !== 'packs'; }
function openDetail(id, type) {
  active = id; save({ active }); mtype = type; cat = ''; migFrom = id; migTo = null; migStep = 2;
  showView('detail'); $('#dettitle').textContent = instLabel(curInst()); renderInsts(); renderOpt(); renderTypes(); $('#instdetail .subtabs [data-sub=browse]').click(); renderMig(); renderInstalled();
  if (type === 'world') renderWorlds(); else runMods?.(true);
}
$('#backinst').onclick = () => showView('list'); $('#backpacks').onclick = () => showView('list');
const fmtSize = b => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
async function renderWorlds() {
  const L = $('#worldlist'); L.innerHTML = ''; const i = curInst(); if (!i) return;
  const ws = await c.worldList({ id: i.id }); if (!ws.length) { L.textContent = t('world_none'); return; }
  ws.forEach(w => { const r = el('div', { className: 'row' });
    r.append(el('b', { textContent: w.name, title: w.name }), el('small', { textContent: `${fmtSize(w.size)} · ${new Date(w.mtime).toLocaleDateString(cfg.lang === 'en' ? 'en-GB' : 'pl-PL')}` }),
      el('button', { textContent: t('world_backup'), onclick: async () => { try { await c.worldBackup({ id: i.id, name: w.name }); } catch (e) { alert(e.message); } } }),
      el('button', { textContent: t('remove'), onclick: async () => { if (!confirm(t('world_del_confirm').replace('{n}', w.name))) return; await c.worldDelete({ id: i.id, name: w.name }); renderWorlds(); } })); L.append(r); });
}
$('#worldadd').onclick = async () => { try { if (await c.worldImport({ id: active })) renderWorlds(); } catch (e) { alert(e.message); } };
$('#worldopen').onclick = () => active && c.instOpen({ id: active, kind: 'world' });

$$('.subtabs').forEach(bar => { const sec = bar.parentElement; bar.querySelectorAll('button').forEach(b => b.onclick = () => {
  bar.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  sec.querySelectorAll(':scope > .subpanel').forEach(p => p.classList.toggle('on', p.dataset.sub === b.dataset.sub));
  if (b.dataset.sub === 'installed' || b.dataset.sub === 'mine') renderInstalled(); if (b.dataset.sub === 'move') renderMig(); if (b.dataset.sub === 'browse' && view === 'detail' && mtype !== 'world') runMods?.(true); }); });

/* ---- Modrinth ---- */
const fmtNum = n => n >= 1e6 ? (n / 1e6).toFixed(1) + ' ' + t('m') : n >= 1e3 ? Math.round(n / 1e3) + ' ' + t('k') : String(n);
function modCard(m, kind, cosmetic, opts = {}) {
  const d = el('div', { className: 'mod' }), tx = el('div');
  tx.append(el('b', { textContent: m.title }), el('small', { textContent: m.desc }), el('small', { className: 'meta', textContent: [m.author, m.downloads != null ? fmtNum(m.downloads) + ' ' + t('dl') : ''].filter(Boolean).join(' · ') }));
  const b = el('button', { textContent: opts.installed ? '✓ ' + t('installed') : t('install'), className: opts.installed ? 'done' : '', disabled: !!opts.installed });
  const markDone = () => { b.textContent = '✓ ' + t('installed'); b.className = 'done'; b.disabled = true; };
  b.onclick = async () => {
    try {
      if (kind === 'modpack') { b.disabled = true; b.textContent = t('installing'); await c.packInstall({ project: m.id, name: m.title }); await loadInsts(); markDone(); return; }
      const inst = opts.fixedId ? insts.find(i => i.id === opts.fixedId) : await pickInstance(); if (!inst) return;
      if (kind === 'mod' && inst.loader === 'vanilla') return alert(t('needLoader'));
      b.disabled = true; b.textContent = t('installing');
      if ((await c.instProjects({ id: inst.id, kind })).includes(m.id)) { markDone(); return; }
      await c.install({ id: m.id, instId: inst.id, kind, title: m.title, cosmetic }); markDone(); renderInstalled();
    } catch (e) { b.textContent = t('err'); b.title = e.message; b.disabled = false; }
  };
  d.append(m.icon ? el('img', { src: m.icon, alt: '' }) : el('span', { className: 'ph' }), tx, b); return d;
}
function browser({ input, list, getType, getCat, cosmetic, getFixed }) {
  let off = 0, tm, busy = false; const more = el('button', { className: 'chip more', textContent: t('more') });
  async function run(reset) {
    if (busy) return; busy = true; if (reset) { off = 0; list.innerHTML = ''; }
    try {
      const type = getType(), r = await c.search({ query: input.value, type, category: getCat(), offset: off, mc: curInst()?.mc });
      if (!r.mods.length && !off) list.textContent = t('noRes');
      const fixed = getFixed?.(), kd = { mod: 'mod', resourcepack: 'resourcepack', shader: 'shader' }[type];
      const have = new Set(fixed && kd ? await c.instProjects({ id: fixed, kind: kd }) : []);
      r.mods.forEach(m => list.append(modCard(m, type, cosmetic, { fixedId: fixed, installed: have.has(m.id) }))); off += r.mods.length; more.remove(); more.textContent = t('more'); if (off < r.total) list.append(more);
    } catch (e) { list.textContent = t('fail') + e.message; }
    busy = false;
  }
  more.onclick = () => run(false); input.oninput = () => { clearTimeout(tm); tm = setTimeout(() => run(true), 300); };
  return run;
}
let cat = '', runMods, runPacks;
function renderTypes() {
  const T = $('#types'), C = $('#modcats'); T.innerHTML = ''; C.innerHTML = '';
  ['mod', 'resourcepack', 'shader', 'world'].forEach(k => T.append(chip(t('type_' + k), k === mtype, () => { mtype = k; cat = ''; renderTypes(); $('#instdetail .subtabs [data-sub=browse]').click(); if (k === 'world') renderWorlds(); else { runMods?.(true); renderInstalled(); } })));
  const w = mtype === 'world'; $('#contentpanes').hidden = w; $('#worldpane').hidden = !w; C.hidden = mtype !== 'mod'; $('#instdetail [data-sub=move]').hidden = mtype !== 'mod';
  ['', 'optimization', 'technology', 'magic', 'adventure', 'utility', 'decoration', 'worldgen', 'library'].forEach(v => C.append(chip(t('cat_' + (v || 'all')), v === cat, () => { cat = v; renderTypes(); runMods?.(true); })));
}

const FEATURED = ['Ears', '3D Skin Layers', 'Capes', 'Emotecraft', 'Visuality', 'Falling Leaves', 'LambDynamicLights', 'Continuity'];
async function renderFeatured() {
  const box = $('#featured'); box.textContent = '...'; const mc = curInst()?.mc;
  const res = await Promise.all(FEATURED.map(q => c.search({ query: q, type: 'mod', category: '', offset: 0, mc, limit: 3 }).then(r => r.mods.find(m => m.title.toLowerCase().includes(q.toLowerCase()))).catch(() => null)));
  box.innerHTML = ''; const ok = res.filter(Boolean); if (!ok.length) box.textContent = t('noRes'); ok.forEach(m => box.append(modCard(m, 'mod', true)));
}
tabBtn('cos').addEventListener('click', renderFeatured);

/* ---- optymalizacja ---- */
function renderOpt() {
  const i = curInst(); $('#optinst').textContent = i ? `${i.name} (${i.mc} ${LOADERS[i.loader]})` : '-';
  const P = $('#presets'); P.innerHTML = '';
  ['balanced', 'max', 'potato'].forEach(k => { const d = el('button', { className: 'inst' + (k === preset ? ' on' : ''), onclick: () => { preset = k; renderOpt(); } }); d.append(el('b', { textContent: t('p_' + k) }), el('small', { textContent: t('d_' + k) })); P.append(d); });
  $('#presetd').textContent = '';
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
const PRESETS_C = ['#8b3dff', '#4c8dff', '#ff8a3d', '#4ade80', '#f472b6', '#f87171', '#22d3ee'];
function setAccent(h) {
  const r = document.documentElement.style, [R, G, B] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  r.setProperty('--accent', h); r.setProperty('--on', (R * 299 + G * 587 + B * 114) / 1000 > 150 ? '#0b1220' : '#ffffff');
  $('#accent').value = h; $$('.sw').forEach(b => b.classList.toggle('on', b.dataset.c === h));
}
PRESETS_C.forEach(h => { const b = el('button', { className: 'sw', title: h, onclick: () => { setAccent(h); save({ accent: h }); } }); b.dataset.c = h; b.style.background = h; $('#swatches').append(b); });
$('#accent').oninput = e => { setAccent(e.target.value); save({ accent: e.target.value }); };
$('#autojava').onchange = e => save({ autoJava: e.target.checked });
$('#javanow').onclick = async () => { const i = curInst(); if (!i) return $('#javamsg').textContent = t('noInst'); $('#javamsg').textContent = '...'; try { await c.javaUpdate(i.mc); $('#javamsg').textContent = t('java_ok'); } catch (e) { $('#javamsg').textContent = e.message; } };
$('#dc').onchange = e => save({ discord: e.target.checked }); $('#dcs').onchange = e => save({ discordServer: e.target.checked }); $('#dcid').oninput = e => save({ discordId: e.target.value });
function renderSettings() {
  const O = $('#onlaunch'); O.innerHTML = '';
  [['keep', 'ol_keep'], ['minimize', 'ol_min'], ['hide', 'ol_hide']].forEach(([v, k]) => O.append(chip(t(k), v === (cfg.onLaunch || 'keep'), () => { save({ onLaunch: v }); renderSettings(); })));
  const L = $('#langs'); L.innerHTML = ''; [['pl', 'Polski'], ['en', 'English']].forEach(([v, n]) => L.append(chip(n, v === (cfg.lang || 'pl'), () => { save({ lang: v }); applyLang(); })));
}
const prMsg = x => $('#prmsg').textContent = x;
async function renderProfiles() {
  const L = $('#prlist'); L.innerHTML = ''; const names = await c.profList(); if (!names.length) L.textContent = t('pr_none');
  const run = async (n, scope) => { if (!active) return prMsg(t('noInst')); try { await c.profApply({ instId: active, name: n, scope }); prMsg(t('pr_ok')); } catch (e) { prMsg(e.message); } };
  names.forEach(n => { const r = el('div', { className: 'row' });
    r.append(el('b', { textContent: n }), el('button', { textContent: t('pr_all'), onclick: () => run(n, 'all') }), el('button', { textContent: t('pr_keys'), onclick: () => run(n, 'keys') }),
      el('button', { textContent: t('remove'), onclick: async () => { await c.profDelete(n); renderProfiles(); } })); L.append(r); });
}
$('#prsave').onclick = async () => { if (!active) return prMsg(t('noInst')); try { await c.profSave({ instId: active, name: $('#prname').value || 'Zestaw' }); prMsg(t('pr_ok')); renderProfiles(); } catch (e) { prMsg(e.message.includes('NOOPTS') ? t('pr_noopts') : e.message); } };
let repId = null;
function renderRepair() {
  const S = $('#repsel'); S.innerHTML = ''; if (!insts.length) { S.textContent = t('repair_none'); return; }
  if (!insts.some(i => i.id === repId)) repId = active || insts[0].id;
  insts.forEach(i => S.append(chip(`${i.name} (${i.mc})`, i.id === repId, () => { repId = i.id; renderRepair(); })));
}
const doRepair = async mode => {
  if (!repId) return $('#repmsg').textContent = t('repair_none'); if (mode === 'full' && !confirm(t('repair_confirm'))) return;
  $('#repmsg').textContent = '...'; try { await c.repair({ instId: repId, mode }); $('#repmsg').textContent = t('repair_done'); } catch (e) { $('#repmsg').textContent = e.message; }
};
['quick', 'full', 'options', 'mods'].forEach(m => $('#rep-' + m).onclick = () => doRepair(m));
$('#dcimg').oninput = e => save({ discordImage: e.target.value.trim() });
tabBtn('settings').addEventListener('click', () => { renderProfiles(); renderRepair(); });
function applyLang() {
  document.documentElement.lang = cfg.lang || 'pl';
  $$('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n)); $$('[data-ph]').forEach(e => e.placeholder = t(e.dataset.ph));
  $('#playt').textContent = t('play'); $('#pack').textContent = t('opt_install'); $('#autoram').textContent = t('auto_ram'); $('#updb').textContent = t('upd_btn');
  if (!session) $('#accn').textContent = t('acc_none');
  renderSettings(); renderProfiles(); renderRepair(); renderMig(); renderInsts(); renderOpt(); renderTypes(); renderInstalled();
}

/* ---- logowanie, gra, aktualizacje ---- */
let accs = { list: [], active: null };
const setSession = (type, name) => { session = type; $('#accn').textContent = name || t('acc_none'); };
async function renderAccMenu() {
  accs = await c.accList(); const m = $('#accmenu'); m.innerHTML = '';
  if (!accs.list.length) m.append(el('small', { textContent: t('acc_empty') }));
  accs.list.forEach(a => { const r = el('div', { className: 'row' + (a.id === accs.active ? ' on' : ''), onclick: async () => { try { const x = await c.accUse(a.id); setSession(x.type, x.name); m.hidden = true; } catch (e) { say(t('loginFail') + e.message); } } });
    r.append(el('b', { textContent: a.name }), el('small', { textContent: a.type === 'ms' ? 'Microsoft' : 'offline' }),
      el('button', { textContent: '×', title: t('remove'), onclick: async e => { e.stopPropagation(); await c.accRemove(a.id); if (a.id === accs.active) setSession(null, ''); renderAccMenu(); } })); m.append(r); });
  m.append(el('button', { className: 'add', textContent: t('acc_add_ms'), onclick: async () => { try { const x = await c.accAddMs(); setSession(x.type, x.name); m.hidden = true; } catch (e) { say(t('loginFail') + e.message); } } }));
  m.append(el('button', { className: 'add', textContent: t('acc_add_off'), onclick: () => { m.hidden = true; askNick(); } }));
}
function askNick() {
  const n = el('input', { className: 'search', placeholder: 'Nick', maxLength: 16 }), err = el('p', { className: 'status' });
  const ok = el('button', { className: 'play', textContent: t('ok'), onclick: async () => { try { const x = await c.accAddOffline(n.value); setSession(x.type, x.name); $('#dlg').close(); } catch (e) { err.textContent = e.message; } } });
  openModal(t('acc_add_off'), el('div')).querySelector('#dlgb').append(el('p', { className: 'hint', textContent: t('offline_hint') }), n, ok, err);
}
$('#acc').onclick = async e => { e.stopPropagation(); const m = $('#accmenu'); if (m.hidden) await renderAccMenu(); m.hidden = !m.hidden; };
document.addEventListener('click', e => { if (!e.target.closest('.accwrap')) $('#accmenu').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#accmenu').hidden = true; });
window.addEventListener('blur', () => { $('#accmenu').hidden = true; });
$('#wmin').onclick = () => c.winMin(); $('#wmax').onclick = () => c.winMax(); $('#wclose').onclick = () => c.winClose();
$('#dcbtn').onclick = () => { if (cfg.discordInvite) c.openUrl(cfg.discordInvite); else { tabBtn('settings').click(); $('#dcinv').focus(); } };
$('#dcinv').oninput = e => save({ discordInvite: e.target.value.trim() });
async function loadNews() {
  const L = $('#newslist'); L.textContent = '...';
  try { const r = await c.news(); L.innerHTML = ''; if (!r.length) L.textContent = t('news_empty');
    r.forEach(x => { const d = el('div', { className: 'rel' }); d.append(el('b', { textContent: x.tag }), el('small', { textContent: new Date(x.date).toLocaleDateString(cfg.lang === 'en' ? 'en-GB' : 'pl-PL') })); if (x.body) d.append(el('p', { textContent: x.body })); L.append(d); }); }
  catch (e) { L.textContent = t('fail') + e.message; }
}
tabBtn('news').addEventListener('click', loadNews);
$('#ram').oninput = e => { $('#ramv').textContent = e.target.value + ' GB'; save({ ram: +e.target.value }); };
$('#play').onclick = async () => {
  if (!active) return say(t('noInst')); if (!session) return say(t('needLogin'));
  $('#play').disabled = true; say(t('preparing'));
  try { await c.play({ instId: active, ram: +$('#ram').value, jvm: $('#jvm').checked }); } catch (e) { say(e.message); } $('#play').disabled = false;
};
c.on('progress', e => { if (e.total) $('#barfill').style.width = (e.task / e.total * 100) + '%'; });
c.on('status', x => { const o = migBusy ? $('#migmsg') : $('#opt').classList.contains('on') ? $('#packout') : $('#settings').classList.contains('on') ? $('#javamsg') : $('#status'); o.textContent = String(x).slice(0, 140); });
c.on('update', u => { $('#upd').hidden = false;
  $('#updt').textContent = u.state === 'available' ? t('upd_avail').replace('{v}', u.version) : u.state === 'downloading' ? t('upd_dl').replace('{p}', u.percent) : t('upd_ready').replace('{v}', u.version);
  $('#updb').hidden = u.state !== 'ready'; });
$('#updb').onclick = () => c.installUpdate();

(async () => {
  cfg = await c.getSettings(); setAccent(cfg.accent || '#8b3dff');
  $('#ram').value = cfg.ram || 4; $('#ramv').textContent = (cfg.ram || 4) + ' GB'; $('#dc').checked = !!cfg.discord; $('#autojava').checked = cfg.autoJava !== false; $('#dcs').checked = cfg.discordServer !== false; $('#dcid').value = cfg.discordId || '';
  c.appVersion().then(v => { $('#appver').textContent = 'Catium ' + v; $('#appver2').textContent = 'Catium ' + v; }); $('#dcinv').value = cfg.discordInvite || ''; $('#dcimg').value = cfg.discordImage || '';
  runMods = browser({ input: $('#q'), list: $('#modlist'), getFixed: () => active, getType: () => mtype, getCat: () => mtype === 'mod' ? cat : '' });
  runPacks = browser({ input: $('#qp'), list: $('#packlist'), getType: () => 'modpack', getCat: () => '' });
  const runCos = browser({ input: $('#qc'), list: $('#coslist'), getType: () => 'mod', getCat: () => 'cosmetic', cosmetic: true }); tabBtn('cos').addEventListener('click', () => runCos(true));
  applyLang(); await loadInsts(); c.accRestore().then(r => { if (r) setSession(r.type, r.name); });
  if (!insts.length) openNew();
})();
