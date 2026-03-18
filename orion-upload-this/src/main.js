'use strict';

const {
  app, BrowserWindow, BrowserView, session,
  ipcMain, shell, dialog, nativeTheme
} = require('electron');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

// ── State ─────────────────────────────────────────────────────────────────────
let mainWin    = null;
let builderWin = null;

const tabs   = new Map();
let activeId = null;
let nextId   = 1;

let chromeHeight    = 86;
let statusBarHeight = 22;

// ── View bounds ───────────────────────────────────────────────────────────────
function viewBounds(win) {
  const [w, h] = win.getContentSize();
  return { x:0, y:chromeHeight, width:w, height:Math.max(0, h - chromeHeight - statusBarHeight) };
}

// ── Session ───────────────────────────────────────────────────────────────────
function setupSession(ses) {
  const STRIP = [
    'x-frame-options','content-security-policy','content-security-policy-report-only',
    'cross-origin-embedder-policy','cross-origin-opener-policy',
    'cross-origin-resource-policy','permissions-policy',
  ];
  ses.webRequest.onHeadersReceived((det, cb) => {
    const h = { ...det.responseHeaders };
    STRIP.forEach(s => Object.keys(h).forEach(k => { if (k.toLowerCase()===s) delete h[k]; }));
    h['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: h });
  });
  ses.webRequest.onBeforeSendHeaders((det, cb) => {
    const h = { ...det.requestHeaders };
    h['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    cb({ requestHeaders: h });
  });
  ses.setPermissionRequestHandler((_w,_p,cb) => cb(true));
  ses.setPermissionCheckHandler(() => true);

  ses.on('will-download', (_e, item) => {
    const sp = path.join(app.getPath('downloads'), item.getFilename());
    item.setSavePath(sp);
    const dl = { id: Date.now(), filename: item.getFilename(), savePath: sp, total: item.getTotalBytes(), received: 0, state: 'progressing' };
    send('dl-start', dl);
    item.on('updated', (_e2, state) => {
      dl.received = item.getReceivedBytes(); dl.state = state;
      send('dl-progress', { id:dl.id, received:dl.received, total:dl.total, state });
    });
    item.once('done', (_e2, state) => send('dl-done', { id:dl.id, state, savePath:sp }));
  });
}

// ── BrowserView factory ───────────────────────────────────────────────────────
function createView(win, url) {
  const ses = session.fromPartition('persist:orion');
  const view = new BrowserView({
    webPreferences: { session:ses, contextIsolation:true, nodeIntegration:false, webSecurity:false, allowRunningInsecureContent:true, sandbox:false }
  });
  view.setAutoResize({ width:true, height:true });
  const wc = view.webContents;

  wc.on('did-start-loading', () => {
    const t=bv(view); if(!t) return; t.loading=true; send('tab-update',inf(t));
    if(t.id===activeId) send('loading', true);
  });
  wc.on('did-stop-loading', () => {
    const t=bv(view); if(!t) return;
    t.loading=false; t.url=wc.getURL(); t.title=wc.getTitle()||hn(t.url);
    t.favicon=`https://www.google.com/s2/favicons?domain=${hn(t.url)}&sz=32`;
    send('tab-update',inf(t));
    if(t.id===activeId){ send('loading',false); send('nav-update',ns(t)); }
  });
  wc.on('page-title-updated', (_e,title) => { const t=bv(view); if(!t)return; t.title=title; send('tab-update',inf(t)); });
  wc.on('page-favicon-updated', (_e,favs) => { const t=bv(view); if(!t)return; if(favs?.[0]){ t.favicon=favs[0]; send('tab-update',inf(t)); } });
  wc.on('did-navigate', (_e, navUrl) => {
    const t=bv(view); if(!t)return; t.url=navUrl;
    if(!t.history.length||t.history[t.hi]!==navUrl){ t.history.splice(t.hi+1); t.history.push(navUrl); t.hi=t.history.length-1; }
    if(t.id===activeId) send('nav-update',ns(t));
  });
  wc.on('did-navigate-in-page', (_e, navUrl) => {
    const t=bv(view); if(!t)return; t.url=navUrl;
    if(t.id===activeId) send('nav-update',ns(t));
  });
  wc.on('did-fail-load', (_e, code, desc, furl) => {
    if(code===-3) return;
    const t=bv(view); if(!t)return; t.loading=false; send('tab-update',inf(t));
    if(t.id===activeId){ send('loading',false); wc.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(errPage(code,desc,furl))); }
  });
  wc.on('context-menu', (_e, p) => {
    if(activeId!==(bv(view)?.id)) return;
    send('page-ctx',{x:p.x,y:p.y,link:p.linkURL,img:p.srcURL,sel:p.selectionText,editable:p.isEditable});
  });
  wc.on('found-in-page', (_e, r) => {
    send('find-result',{active:r.activeMatchOrdinal,total:r.matches,final:r.finalUpdate});
  });
  wc.on('certificate-error', (_e,_u,_err,_c,cb) => cb(true));
  wc.setWindowOpenHandler(({url:nu}) => { if(nu&&nu!=='about:blank') createTab(nu); return {action:'deny'}; });

  if(url && url!=='about:blank') wc.loadURL(url);
  return view;
}

function hn(u){ try{return new URL(u).hostname.replace(/^www\./,'')}catch{return u?.slice(0,30)||''} }
function inf(t){ return {id:t.id,url:t.url,title:t.title,loading:t.loading,favicon:t.favicon}; }
function bv(v){ for(const t of tabs.values()){if(t.view===v)return t;} return null; }
function ns(t){ const wc=t.view.webContents; return {url:t.url,canBack:wc.canGoBack(),canFwd:wc.canGoForward(),zoom:t.zoom}; }
function send(ch,d){ if(mainWin&&!mainWin.isDestroyed()) mainWin.webContents.send(ch,d); }

function errPage(code,desc,url){
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Error</title>
  <style>body{background:#0f0f11;color:#f2f2f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .b{text-align:center;max-width:440px}.i{font-size:56px;opacity:.3;margin-bottom:20px}h1{font-size:22px;font-weight:600;margin-bottom:8px}
  p{color:#555;font-size:13px;line-height:1.7;margin-bottom:18px}code{background:#1e1e22;padding:4px 9px;border-radius:5px;font-size:11px;color:#9696a8}
  button{background:#5b8df8;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:13px;cursor:pointer;margin-top:16px}button:hover{background:#3563d4}</style></head>
  <body><div class="b"><div class="i">🌐</div><h1>Can't reach this page</h1><p>Error ${code}: ${desc||'Unknown'}</p>
  <code>${url||''}</code><br><button onclick="history.back()">← Go back</button></div></body></html>`;
}

// ── Tab management ────────────────────────────────────────────────────────────
function createTab(url) {
  const id=nextId++, view=createView(mainWin,url||null);
  tabs.set(id,{id,view,url:url||'',title:'New Tab',loading:!!url,favicon:null,zoom:1.0,history:[],hi:-1});
  activateTab(id); send('tabs-list',allInf()); return id;
}
function activateTab(id) {
  const t=tabs.get(id); if(!t)return;
  for(const [tid,tab] of tabs) if(tid!==id){try{mainWin.removeBrowserView(tab.view)}catch{}}
  try{mainWin.addBrowserView(t.view)}catch{}
  t.view.setBounds(viewBounds(mainWin));
  activeId=id;
  send('tab-activated',{id,url:t.url}); send('nav-update',ns(t)); send('tabs-list',allInf()); send('loading',t.loading);
}
function closeTab(id) {
  const t=tabs.get(id); if(!t)return;
  try{mainWin.removeBrowserView(t.view)}catch{}
  try{t.view.webContents.destroy()}catch{}
  tabs.delete(id);
  if(!tabs.size){createTab();return;}
  if(activeId===id){ const k=[...tabs.keys()]; activateTab(k[k.length-1]); }
  send('tabs-list',allInf());
}
function allInf(){ return [...tabs.values()].map(inf); }

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  nativeTheme.themeSource='dark';
  mainWin = new BrowserWindow({
    width:1280,height:800,minWidth:760,minHeight:480,
    titleBarStyle: process.platform==='darwin'?'hiddenInset':'default',
    backgroundColor:'#0f0f11',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,spellcheck:true},
  });
  setupSession(session.fromPartition('persist:orion'));
  setupSession(session.defaultSession);
  mainWin.loadFile(path.join(__dirname,'ui.html'));
  mainWin.on('resize',()=>{ const t=tabs.get(activeId); if(t)t.view.setBounds(viewBounds(mainWin)); });
  mainWin.webContents.on('did-finish-load',()=>createTab());
  if(process.argv.includes('--devtools')) mainWin.webContents.openDevTools();
}

function openBuilder() {
  if(builderWin&&!builderWin.isDestroyed()){builderWin.focus();return;}
  builderWin = new BrowserWindow({
    width:700,height:580,resizable:false,
    titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',
    backgroundColor:'#0d0d0f',parent:mainWin,modal:false,
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false},
  });
  builderWin.setMenuBarVisibility(false);
  builderWin.loadFile(path.join(__dirname,'builder.html'));
  builderWin.on('closed',()=>{builderWin=null;});
}

// ── IPC ───────────────────────────────────────────────────────────────────────
function resolve(raw){
  if(!raw||raw==='about:blank') return 'about:blank';
  raw=raw.trim();
  if(/^https?:\/\//i.test(raw)) return raw;
  if(/^[a-z0-9\-]+(\.[a-z]{2,})+/i.test(raw)&&!raw.includes(' ')) return 'https://'+raw;
  return 'https://www.google.com/search?q='+encodeURIComponent(raw);
}

ipcMain.on('chrome-height',(_e,h)=>{ chromeHeight=Math.max(40,h||86); const t=tabs.get(activeId); if(t)t.view.setBounds(viewBounds(mainWin)); });
ipcMain.on('tab-new',(_e,url)=>createTab(url||''));
ipcMain.on('tab-activate',(_e,id)=>activateTab(id));
ipcMain.on('tab-close',(_e,id)=>closeTab(id));
ipcMain.on('tab-duplicate',(_e,id)=>{ const t=tabs.get(id); if(t?.url)createTab(t.url); });
ipcMain.on('nav-load',(_e,raw)=>{
  const t=tabs.get(activeId); if(!t)return;
  const url=resolve(raw);
  if(url==='about:blank'){send('show-newtab',{});return;}
  t.url=url; t.loading=true; send('tab-update',inf(t)); t.view.webContents.loadURL(url);
});
ipcMain.on('nav-back',()=>{const t=tabs.get(activeId);if(t)t.view.webContents.goBack();});
ipcMain.on('nav-fwd',()=>{const t=tabs.get(activeId);if(t)t.view.webContents.goForward();});
ipcMain.on('nav-reload',()=>{const t=tabs.get(activeId);if(t)t.view.webContents.reload();});
ipcMain.on('nav-hardreload',()=>{const t=tabs.get(activeId);if(t)t.view.webContents.reloadIgnoringCache();});
ipcMain.on('nav-stop',()=>{const t=tabs.get(activeId);if(t)t.view.webContents.stop();});
ipcMain.on('nav-home',()=>{
  const t=tabs.get(activeId);
  if(t){t.url='';t.title='New Tab';t.view.webContents.loadURL('about:blank');}
  send('show-newtab',{}); send('nav-update',{url:'',canBack:false,canFwd:false,zoom:1.0});
});
ipcMain.on('zoom-in',()=>{const t=tabs.get(activeId);if(t){t.zoom=Math.min(3,+(t.zoom+0.1).toFixed(1));t.view.webContents.setZoomFactor(t.zoom);send('zoom',t.zoom);}});
ipcMain.on('zoom-out',()=>{const t=tabs.get(activeId);if(t){t.zoom=Math.max(0.3,+(t.zoom-0.1).toFixed(1));t.view.webContents.setZoomFactor(t.zoom);send('zoom',t.zoom);}});
ipcMain.on('zoom-reset',()=>{const t=tabs.get(activeId);if(t){t.zoom=1.0;t.view.webContents.setZoomFactor(1.0);send('zoom',1.0);}});
ipcMain.on('find-start',(_e,q)=>{const t=tabs.get(activeId);if(t&&q)t.view.webContents.findInPage(q,{forward:true,findNext:false});});
ipcMain.on('find-next',(_e,q)=>{const t=tabs.get(activeId);if(t&&q)t.view.webContents.findInPage(q,{forward:true,findNext:true});});
ipcMain.on('find-prev',(_e,q)=>{const t=tabs.get(activeId);if(t&&q)t.view.webContents.findInPage(q,{forward:false,findNext:true});});
ipcMain.on('find-stop',()=>{const t=tabs.get(activeId);if(t)t.view.webContents.stopFindInPage('clearSelection');});
ipcMain.handle('page-exec',async(_e,js)=>{const t=tabs.get(activeId);if(!t)return null;try{return await t.view.webContents.executeJavaScript(js);}catch(e){return{error:e.message};}});
ipcMain.handle('page-snapshot',async()=>{
  const t=tabs.get(activeId);if(!t)return null;
  const JS=`(function(){var s={};try{s.url=location.href;s.title=document.title;s.scroll={y:scrollY,maxY:document.documentElement.scrollHeight-innerHeight};s.viewport={w:innerWidth,h:innerHeight};var seen=new Set(),els=[];document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[tabindex]').forEach(function(el){try{var r=el.getBoundingClientRect(),cs=getComputedStyle(el);var vis=r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0&&cs.visibility!=='hidden'&&cs.display!=='none';var tag=el.tagName.toLowerCase();var txt=(el.innerText||el.textContent||'').trim().slice(0,80)||el.getAttribute('aria-label')||el.getAttribute('placeholder')||'';var sel=el.id?'#'+el.id:(function(){var idx=Array.from(el.parentNode?el.parentNode.querySelectorAll(tag):[]).indexOf(el);return tag+':nth-of-type('+(idx+1)+')'})();var key=sel+'|'+txt;if(seen.has(key))return;seen.add(key);if(vis)els.push({tag,type:el.type||'',text:txt,href:(el.href||'').slice(0,100),sel,placeholder:el.placeholder||''});}catch(e){}});s.elements=els.slice(0,80);var secs=[],cur={h:'',p:[]};document.querySelectorAll('h1,h2,h3,p,li').forEach(function(n){var t=(n.innerText||'').trim();if(!t||t.length<2)return;var tag=n.tagName.toLowerCase();if(tag[0]==='h'){if(cur.p.length)secs.push(cur);cur={h:t.slice(0,100),p:[]};}else if(cur.p.length<8)cur.p.push(t.slice(0,200));});if(cur.p.length||cur.h)secs.push(cur);s.sections=secs.slice(0,20);}catch(e){s.error=e.message;}return JSON.stringify(s);})()`;
  try{return await t.view.webContents.executeJavaScript(JS);}catch{return null;}
});
ipcMain.on('dl-open',(_e,sp)=>shell.openPath(sp));
ipcMain.on('dl-show',(_e,sp)=>shell.showItemInFolder(sp));
ipcMain.on('open-external',(_e,url)=>shell.openExternal(url));
ipcMain.handle('get-active-url',()=>{const t=tabs.get(activeId);return t?t.url:'';});
ipcMain.on('open-builder',()=>openBuilder());
ipcMain.on('open-devtools',()=>{const t=tabs.get(activeId);if(t)t.view.webContents.openDevTools();});

// ── Builder IPC ───────────────────────────────────────────────────────────────
ipcMain.handle('builder-pick-dir',async()=>{
  const r=await dialog.showOpenDialog(builderWin||mainWin,{title:'Choose output folder',properties:['openDirectory','createDirectory']});
  return r.canceled?null:r.filePaths[0];
});
ipcMain.handle('builder-pick-icon',async()=>{
  const r=await dialog.showOpenDialog(builderWin||mainWin,{title:'Choose icon file',filters:[{name:'Icons',extensions:['ico','icns','png']}],properties:['openFile']});
  return r.canceled?null:r.filePaths[0];
});
ipcMain.handle('builder-run',(_e,cfg)=>new Promise((res,rej)=>{
  const projDir=path.join(__dirname,'..');
  const pkgPath=path.join(projDir,'package.json');
  let pkg={};
  try{pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));}catch{}
  pkg.name=(cfg.productName||'orion').toLowerCase().replace(/\s+/g,'-');
  pkg.version=cfg.version||'1.0.0';
  pkg.description=cfg.description||'Orion Browser';
  pkg.build={
    appId:cfg.appId||'com.orionbrowser.app',
    productName:cfg.productName||'Orion Browser',
    files:['src/**/*'],
    directories:{output:cfg.outDir||'dist'},
    win:{target:[{target:cfg.target||'nsis',arch:['x64']}],...(cfg.iconPath?{icon:cfg.iconPath}:{})},
    nsis:{oneClick:false,allowToChangeInstallationDirectory:true,createDesktopShortcut:cfg.desktop!==false,createStartMenuShortcut:true,shortcutName:cfg.productName||'Orion Browser'},
  };
  fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2));
  const proc=spawn('npx',['electron-builder','--win','--x64'],{cwd:projDir,shell:true});
  const fwd=d=>{if(builderWin&&!builderWin.isDestroyed())builderWin.webContents.send('builder-log',d.toString());};
  proc.stdout.on('data',fwd); proc.stderr.on('data',fwd);
  proc.on('close',code=>code===0?res({ok:true,outDir:cfg.outDir||path.join(projDir,'dist')}):rej(new Error('Build exited with code '+code)));
}));
ipcMain.on('builder-open-output',(_e,dir)=>shell.openPath(dir));

app.whenReady().then(createWindow);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
