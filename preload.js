const { contextBridge, ipcRenderer: r } = require('electron');
const I = n => a => r.invoke(n, a);
contextBridge.exposeInMainWorld('catium', {
  getSettings: I('settings:get'), setSettings: I('settings:set'), versions: I('versions'),
  instCreate: I('inst:create'), instDelete: I('inst:delete'), instFiles: I('inst:files'), instToggle: I('inst:toggle'), instRemove: I('inst:remove'), instAdd: I('inst:add'), instOpen: I('inst:open'),
  profList: I('prof:list'), profSave: I('prof:save'), profApply: I('prof:apply'), profDelete: I('prof:delete'),
  search: I('mods:search'), install: I('mods:install'), packInstall: I('pack:install'), installPack: I('opt:install'), totalRam: I('sys:ram'),
  play: I('play'), repair: I('repair'), javaUpdate: I('java:update'), accList: I('acc:list'), accAddMs: I('acc:addMs'), accAddOffline: I('acc:addOffline'), accUse: I('acc:use'), accRemove: I('acc:remove'), accRestore: I('acc:restore'),
  winMin: I('win:min'), winMax: I('win:max'), winClose: I('win:close'), openUrl: I('open:url'), news: I('news:get'),
  skinGet: I('skin:get'), skinSet: I('skin:set'), capeSet: I('cape:set'),
  installUpdate: I('update:install'), appVersion: I('app:version'),
  on: (ch, fn) => r.on(ch, (_, d) => fn(d))
});
