const { contextBridge, ipcRenderer: r } = require('electron');
const I = n => a => r.invoke(n, a);
contextBridge.exposeInMainWorld('catium', {
  getSettings: I('settings:get'), setSettings: I('settings:set'), versions: I('versions'),
  instCreate: I('inst:create'), instDelete: I('inst:delete'), instFiles: I('inst:files'), instToggle: I('inst:toggle'), instRemove: I('inst:remove'),
  search: I('mods:search'), install: I('mods:install'), packInstall: I('pack:install'), installPack: I('opt:install'), totalRam: I('sys:ram'),
  login: I('login'), offline: I('login:offline'), play: I('play'),
  skinGet: I('skin:get'), skinSet: I('skin:set'), capeSet: I('cape:set'),
  installUpdate: I('update:install'), appVersion: I('app:version'),
  on: (ch, fn) => r.on(ch, (_, d) => fn(d))
});
