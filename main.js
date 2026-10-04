const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path'), fs = require('fs'), os = require('os');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { Auth } = require('msmc');
const AdmZip = require('adm-zip');

const UA = { 'User-Agent': 'Catium/0.3.0 (launcher)' };
const MR = 'https://api.modrinth.com/v2', MC = 'https://api.minecraftservices.com/minecraft/profile';
const KIND_DIR = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };
const BASE = ['fabric-api', 'sodium', 'lithium', 'ferrite-core', 'modernfix', 'immediatelyfast', 'entityculling'];
const MAXM = [...BASE, 'sodium-extra', 'dynamic-fps', 'moreculling', 'krypton'];
const FAST = { graphicsMode: 0, fancyGraphics: 'false', ao: 'false', particles: 2, maxFps: 260, enableVsync: 'false', entityShadows: 'false', biomeBlendRadius: 1, bobView: 'false' };
const PRESETS = {
  balanced: { mods: BASE, opts: { renderDistance: 10, simulationDistance: 8, graphicsMode: 1, ao: 'true', particles: 1, maxFps: 260, enableVsync: 'false', entityShadows: 'false', biomeBlendRadius: 2, mipmapLevels: 3 } },
  max: { mods: MAXM, opts: { ...FAST, renderDistance: 8, simulationDistance: 6, mipmapLevels: 2, entityDistanceScaling: '0.75', renderClouds: '"false"' } },
  potato: { mods: MAXM, opts: { ...FAST, renderDistance: 5, simulationDistance: 5, mipmapLevels: 0, entityDistanceScaling: '0.5', renderClouds: '"false"' } }
};
const JVM_FLAGS = ['-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC', '-XX:MaxGCPauseMillis=50', '-XX:G1NewSizePercent=20', '-XX:G1ReservePercent=20', '-XX:G1HeapRegionSize=32M', '-XX:+DisableExplicitGC'];

let win, session = null, rpc = null, gameRunning = false, pendingUpdate = false;
const ud = () => app.getPath('userData');
const dataDir = () => path.join(ud(), 'minecraft');
const instDir = id => path.join(ud(), 'instances', id);
const cfgFile = () => path.join(ud(), 'settings.json');
const readCfg = () => { try { return { ram: 4, instances: [], ...JSON.parse(fs.readFileSync(cfgFile())) }; } catch { return { ram: 4, instances: [] }; } };
const writeCfg = o => fs.writeFileSync(cfgFile(), JSON.stringify({ ...readCfg(), ...o }));
const getInst = id => readCfg().instances.find(i => i.id === id);
const send = (ch, d) => win && win.webContents.send(ch, d);
const getJson = async (url, h = {}) => { const r = await fetch(url, { headers: h }); if (!r.ok) throw new Error(url + ' -> ' + r.status); return r.json(); };
const enc = x => encodeURIComponent(JSON.stringify(x));
const safeIn = (dir, p) => { const t = path.resolve(dir, p); return t.startsWith(path.resolve(dir) + path.sep) ? t : null; };
async function download(url, file) { fs.mkdirSync(path.dirname(file), { recursive: true }); const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error('Pobieranie: ' + r.status); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }

/* ---------- instancje ---------- */
function createInst(name, mc, loader) {
  const id = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'inst') + '-' + Date.now().toString(36);
  const inst = { id, name, mc, loader }; fs.mkdirSync(instDir(id), { recursive: true });
  writeCfg({ instances: [...readCfg().instances, inst], active: id }); return inst;
}
const metaFile = id => path.join(instDir(id), 'catium.json');
const readMeta = id => { try { return JSON.parse(fs.readFileSync(metaFile(id))); } catch { return {}; } };
const writeMeta = (id, m) => fs.writeFileSync(metaFile(id), JSON.stringify(m));
ipcMain.handle('settings:get', () => readCfg());
ipcMain.handle('settings:set', (_, s) => writeCfg(s));
ipcMain.handle('inst:create', (_, { name, mc, loader }) => createInst(name, mc, loader));
ipcMain.handle('inst:delete', (_, id) => {
  const c = readCfg(); writeCfg({ instances: c.instances.filter(i => i.id !== id), active: c.active === id ? null : c.active });
  fs.rmSync(instDir(id), { recursive: true, force: true });
});
ipcMain.handle('inst:files', (_, { id, kind }) => {
  const dir = path.join(instDir(id), KIND_DIR[kind]), meta = readMeta(id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /\.(jar|zip|disabled)$/.test(f)).map(f => {
    const base = f.replace(/\.disabled$/, ''), m = meta[kind + '/' + base] || {};
    return { file: f, enabled: !f.endsWith('.disabled'), title: m.title || base, cosmetic: !!m.cosmetic };
  });
});
ipcMain.handle('inst:toggle', (_, { id, kind, file }) => {
  const d = path.join(instDir(id), KIND_DIR[kind]);
  fs.renameSync(path.join(d, file), path.join(d, file.endsWith('.disabled') ? file.slice(0, -9) : file + '.disabled'));
});
ipcMain.handle('inst:remove', (_, { id, kind, file }) => fs.rmSync(path.join(instDir(id), KIND_DIR[kind], file), { force: true }));

/* ---------- Modrinth ---------- */
ipcMain.handle('mods:search', async (_, { query, type = 'mod', category, offset = 0, mc }) => {
  const facets = [[`project_type:${type}`]];
  if (type === 'mod') facets.push(['categories:fabric', 'categories:quilt']);
  if (type !== 'modpack' && mc) facets.push([`versions:${mc}`]);
  if (category) facets.push([`categories:${category}`]);
  const r = await getJson(`${MR}/search?query=${encodeURIComponent(query || '')}&limit=20&offset=${offset}&index=${query ? 'relevance' : 'downloads'}&facets=${enc(facets)}`, UA);
  return { total: r.total_hits, mods: r.hits.map(h => ({ id: h.project_id, title: h.title, desc: h.description, icon: h.icon_url })) };
});
async function installProject(project, inst, kind, meta, seen = new Set()) {
  if (seen.has(project)) return; seen.add(project);
  const loaders = inst.loader === 'quilt' ? ['quilt', 'fabric'] : ['fabric'];
  const url = q => `${MR}/project/${project}/version${q}`;
  let vers = await getJson(url(`?game_versions=${enc([inst.mc])}` + (kind === 'mod' ? `&loaders=${enc(loaders)}` : '')), UA);
  if (!vers.length && kind !== 'mod') vers = await getJson(url(''), UA);
  if (!vers.length) throw new Error(`${project}: brak wersji dla ${inst.mc}`);
  const f = vers[0].files.find(x => x.primary) || vers[0].files[0];
  await download(f.url, path.join(instDir(inst.id), KIND_DIR[kind], f.filename));
  if (meta) { const m = readMeta(inst.id); m[kind + '/' + f.filename] = meta; writeMeta(inst.id, m); }
  if (kind === 'mod') for (const d of vers[0].dependencies || []) if (d.dependency_type === 'required' && d.project_id) await installProject(d.project_id, inst, 'mod', null, seen).catch(() => {});
  return f.filename;
}
ipcMain.handle('mods:install', (_, { id, instId, kind, title, cosmetic }) => installProject(id, getInst(instId), kind, { title, cosmetic: !!cosmetic }));
ipcMain.handle('pack:install', async (_, { project, name }) => {
  const vers = await getJson(`${MR}/project/${project}/version`, UA);
  const v = vers.find(x => x.files.some(f => f.filename.endsWith('.mrpack'))); if (!v) throw new Error('Brak pliku .mrpack');
  const f = v.files.find(x => x.filename.endsWith('.mrpack')); send('status', 'Pobieram modpack...');
  const zip = new AdmZip(Buffer.from(await (await fetch(f.url, { headers: UA })).arrayBuffer()));
  const idx = JSON.parse(zip.readAsText('modrinth.index.json')), d = idx.dependencies || {};
  const loader = d['fabric-loader'] ? 'fabric' : d['quilt-loader'] ? 'quilt' : null;
  if (!loader) throw new Error('Ten modpack wymaga Forge/NeoForge, a to nie jest jeszcze obsługiwane.');
  const inst = createInst(idx.name || name, d.minecraft, loader), dir = instDir(inst.id);
  let n = 0;
  for (const file of idx.files || []) {
    if (file.env?.client === 'unsupported') continue;
    const t = safeIn(dir, file.path); if (!t) continue;
    send('status', `Modpack: ${++n}/${idx.files.length}`); await download(file.downloads[0], t);
  }
  for (const e of zip.getEntries()) for (const p of ['overrides/', 'client-overrides/'])
    if (!e.isDirectory && e.entryName.startsWith(p)) { const t = safeIn(dir, e.entryName.slice(p.length)); if (t) { fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, e.getData()); } }
  return inst;
});

/* ---------- optymalizacja ---------- */
function writeOptions(id, opts) {
  const f = path.join(instDir(id), 'options.txt'), m = new Map();
  if (fs.existsSync(f)) fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(l => { const i = l.indexOf(':'); if (i > 0) m.set(l.slice(0, i), l.slice(i + 1)); });
  Object.entries(opts).forEach(([k, v]) => m.set(k, String(v)));
  fs.writeFileSync(f, [...m].map(([k, v]) => `${k}:${v}`).join('\n') + '\n');
}
ipcMain.handle('opt:install', async (_, { instId, preset }) => {
  const inst = getInst(instId), p = PRESETS[preset] || PRESETS.balanced, done = [], failed = [];
  if (!inst || inst.loader === 'vanilla') throw new Error('Wybierz instancję Fabric lub Quilt.');
  for (const m of p.mods) { send('status', `Instaluję ${m}...`); try { done.push(await installProject(m, inst, 'mod', { title: m })); } catch (e) { failed.push(e.message); } }
  writeOptions(instId, p.opts); return { done, failed };
});
ipcMain.handle('sys:ram', () => Math.round(os.totalmem() / 1e9));

/* ---------- logowanie, skiny ---------- */
ipcMain.handle('login', async () => { const m = await new Auth('select_account').launch('electron'); const a = await m.getMinecraft(); session = { type: 'ms', mc: a.mclc() }; return a.profile.name; });
ipcMain.handle('login:offline', async (_, name) => { const n = String(name).replace(/[^A-Za-z0-9_]/g, '').slice(0, 16); if (n.length < 3) throw new Error('Nick: min. 3 znaki (litery, cyfry, _)'); session = { type: 'offline', mc: await Authenticator.getAuth(n) }; return n; });
const bearer = () => { if (session?.type !== 'ms') throw new Error('Wymaga konta Microsoft'); return { Authorization: 'Bearer ' + session.mc.access_token }; };
ipcMain.handle('skin:get', async () => {
  const r = await fetch(MC, { headers: bearer() }); if (!r.ok) throw new Error('Nie udało się pobrać profilu (' + r.status + ')');
  const j = await r.json(), sk = (j.skins || []).find(x => x.state === 'ACTIVE') || {};
  return { url: sk.url || null, capes: (j.capes || []).map(c => ({ id: c.id, alias: c.alias, active: c.state === 'ACTIVE' })) };
});
ipcMain.handle('skin:set', async (_, { b64, variant }) => {
  const fd = new FormData(); fd.append('variant', variant); fd.append('file', new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }), 'skin.png');
  const r = await fetch(MC + '/skins', { method: 'POST', headers: bearer(), body: fd }); if (!r.ok) throw new Error('Mojang odrzucił skina (' + r.status + ')');
});
ipcMain.handle('cape:set', async (_, id) => {
  const r = id ? await fetch(MC + '/capes/active', { method: 'PUT', headers: { ...bearer(), 'Content-Type': 'application/json' }, body: JSON.stringify({ capeId: id }) }) : await fetch(MC + '/capes/active', { method: 'DELETE', headers: bearer() });
  if (!r.ok) throw new Error('Nie udało się zmienić peleryny (' + r.status + ')');
});

/* ---------- gra ---------- */
async function prepareLoader(inst) {
  const base = inst.loader === 'quilt' ? 'https://meta.quiltmc.org/v3/versions/loader' : 'https://meta.fabricmc.net/v2/versions/loader';
  const ls = await getJson(`${base}/${inst.mc}`), l = (ls.find(x => x.loader.stable !== false) || ls[0])?.loader.version;
  if (!l) throw new Error(`${inst.loader} nie wspiera ${inst.mc}`);
  const profile = await getJson(`${base}/${inst.mc}/${l}/profile/json`), dir = path.join(dataDir(), 'versions', profile.id);
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, profile.id + '.json'), JSON.stringify(profile)); return profile.id;
}
ipcMain.handle('versions', async (_, snap) => (await getJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).versions.filter(v => v.type === 'release' || (snap && v.type === 'snapshot')).map(v => v.id));
ipcMain.handle('play', async (_, { instId, ram, jvm }) => {
  const inst = getInst(instId); if (!inst) throw new Error('Najpierw utwórz instancję');
  if (!session) throw new Error('Zaloguj się kontem Microsoft albo wybierz grę offline');
  fs.mkdirSync(dataDir(), { recursive: true });
  const version = { number: inst.mc, type: /^\d+\.\d+(\.\d+)?$/.test(inst.mc) ? 'release' : 'snapshot' };
  if (inst.loader !== 'vanilla') version.custom = await prepareLoader(inst);
  const l = new Client();
  l.on('progress', e => send('progress', e)); l.on('debug', d => send('status', d));
  l.on('data', d => send('log', String(d)));
  l.on('close', () => { gameRunning = false; send('status', 'Gra zamknięta'); restoreWindow(); discordOff(); if (pendingUpdate) autoUpdater.quitAndInstall(true, true); });
  const proc = await l.launch({ authorization: session.mc, root: dataDir(), version, memory: { max: `${ram}G`, min: `${Math.min(2, ram)}G` }, customArgs: jvm ? JVM_FLAGS : [], overrides: { gameDirectory: instDir(inst.id) } });
  if (!proc) { restoreWindow(); throw new Error('Nie udało się uruchomić gry. Sprawdź, czy masz Javę 21.'); }
  const mode = readCfg().onLaunch; if (mode === 'minimize') win.minimize(); else if (mode === 'hide') win.hide();
  gameRunning = true; discordOn(inst.mc);
});

/* ---------- okno, discord, aktualizacje ---------- */
function restoreWindow() { if (!win) return; win.show(); if (win.isMinimized()) win.restore(); win.focus(); }
async function discordOn(mc) {
  const cfg = readCfg(); if (!cfg.discord || !cfg.discordId) return;
  try { const { Client: Rpc } = require('@xhayper/discord-rpc'); rpc = new Rpc({ clientId: cfg.discordId.trim() }); await rpc.login();
    await rpc.user?.setActivity({ details: 'Gra w Catium', state: 'Minecraft ' + mc, startTimestamp: new Date() }); } catch (e) { send('status', 'Discord: ' + e.message); }
}
function discordOff() { try { rpc?.destroy(); } catch {} rpc = null; }
function initUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.on('update-available', i => send('update', { state: 'available', version: i.version }));
  autoUpdater.on('download-progress', p => send('update', { state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => { send('update', { state: 'ready', version: i.version }); if (gameRunning) pendingUpdate = true; else setTimeout(() => autoUpdater.quitAndInstall(true, true), 2500); });
  autoUpdater.checkForUpdates().catch(() => {});
}
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());
ipcMain.handle('app:version', () => app.getVersion());
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1180, height: 760, minWidth: 980, minHeight: 640, backgroundColor: '#0d1017', titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d1017', symbolColor: '#e9edf7', height: 36 }, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.setMenu(null); win.loadFile('renderer/index.html'); win.webContents.once('did-finish-load', initUpdater);
});
app.on('window-all-closed', () => app.quit());
