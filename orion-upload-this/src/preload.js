'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orion', {
  isElectron: true,
  // Tabs
  newTab:       url  => ipcRenderer.send('tab-new', url),
  activateTab:  id   => ipcRenderer.send('tab-activate', id),
  closeTab:     id   => ipcRenderer.send('tab-close', id),
  duplicateTab: id   => ipcRenderer.send('tab-duplicate', id),
  // Nav
  load:         url  => ipcRenderer.send('nav-load', url),
  back:         ()   => ipcRenderer.send('nav-back'),
  fwd:          ()   => ipcRenderer.send('nav-fwd'),
  reload:       ()   => ipcRenderer.send('nav-reload'),
  hardReload:   ()   => ipcRenderer.send('nav-hardreload'),
  stop:         ()   => ipcRenderer.send('nav-stop'),
  home:         ()   => ipcRenderer.send('nav-home'),
  // Zoom
  zoomIn:       ()   => ipcRenderer.send('zoom-in'),
  zoomOut:      ()   => ipcRenderer.send('zoom-out'),
  zoomReset:    ()   => ipcRenderer.send('zoom-reset'),
  // Find
  findStart:    q    => ipcRenderer.send('find-start', q),
  findNext:     q    => ipcRenderer.send('find-next', q),
  findPrev:     q    => ipcRenderer.send('find-prev', q),
  findStop:     ()   => ipcRenderer.send('find-stop'),
  // AI / page
  pageExec:     js   => ipcRenderer.invoke('page-exec', js),
  pageSnapshot: ()   => ipcRenderer.invoke('page-snapshot'),
  getActiveUrl: ()   => ipcRenderer.invoke('get-active-url'),
  // Downloads
  dlOpen:       sp   => ipcRenderer.send('dl-open', sp),
  dlShow:       sp   => ipcRenderer.send('dl-show', sp),
  // Misc
  openExternal: url  => ipcRenderer.send('open-external', url),
  openDevTools: ()   => ipcRenderer.send('open-devtools'),
  openBuilder:  ()   => ipcRenderer.send('open-builder'),
  // Chrome height
  reportHeight: h    => ipcRenderer.send('chrome-height', h),
  // Events main→renderer
  on: (ch, fn) => {
    const l = (_e, d) => fn(d);
    ipcRenderer.on(ch, l);
    return () => ipcRenderer.removeListener(ch, l);
  },
  // Builder-specific
  builderPickDir:  ()    => ipcRenderer.invoke('builder-pick-dir'),
  builderPickIcon: ()    => ipcRenderer.invoke('builder-pick-icon'),
  builderRun:      cfg   => ipcRenderer.invoke('builder-run', cfg),
  builderOpenOut:  dir   => ipcRenderer.send('builder-open-output', dir),
});
