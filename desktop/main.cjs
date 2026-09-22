// 咩咩制卡台 · 桌面端外壳（Electron）。
// 界面就是 dist/web 那份单文件 HTML。这里只管四件事：开窗口、让接口请求不被跨域拦住、下载走「另存为」、外链交给系统浏览器。
// 自检：electron . --selftest （隐藏窗口，起一个不带跨域头的假接口，让页面真去调，打印结果后退出）
const { app, BrowserWindow, Menu, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PAGE = path.join(__dirname, '..', 'dist', 'web', '咩咩制卡台.html');
const ORIGIN = 'app://miemie';
const SELFTEST = process.argv.includes('--selftest');

// 页面用固定的 app://miemie 源打开：存档（IndexedDB）和设置（localStorage）落在程序自己的数据目录里，
// 不跟浏览器混在一起，也不会因为 HTML 挪了位置就找不到。secure 让页面算安全上下文（crypto.randomUUID 要用）。
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 380,
    minHeight: 600,
    title: '咩咩制卡台',
    backgroundColor: '#f2efe8',
    show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // 关掉同源限制：接口请求不再被跨域拦住，网页版为此才要配 接口代理.py。
      // 这个窗口只加载本地这一份 HTML，没有远程页面，模型输出一律转义后显示，风险可控。
      webSecurity: false,
      spellcheck: false,
    },
  });
  if (!SELFTEST) win.once('ready-to-show', () => win.show());
  // 页面不许被导航走；外链一律交给系统浏览器
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(ORIGIN)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.MIEMIE_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
  win.loadURL(ORIGIN + '/');
  return win;
}

app.whenReady().then(async () => {
  protocol.handle('app', () => net.fetch(pathToFileURL(PAGE).toString()));
  // 页面里的「下载」一律弹另存为，默认放在系统的下载文件夹
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: '保存', defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
  });
  Menu.setApplicationMenu(null);
  const win = createWindow();
  if (SELFTEST) await selftest(win);
});
app.on('window-all-closed', () => app.quit());

// ── 自检 ──
async function selftest(win) {
  const http = require('node:http');
  const os = require('node:os');
  const seen = [];
  // 假接口：故意不带任何跨域头，预检（OPTIONS）直接回 404——浏览器里这样的接口一定被拦
  const server = http.createServer((req, res) => {
    seen.push(req.method + ' ' + req.url);
    if (req.method === 'OPTIONS') return res.writeHead(404).end();
    if (req.url.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'mock-a' }, { id: 'mock-b' }] }));
    }
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const { stream } = JSON.parse(body || '{}');
      if (!stream) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ choices: [{ message: { content: '一次性回复' } }] }));
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const parts = ['咩', '咩', '制卡台'];
      let i = 0;
      const tick = () => {
        if (i < parts.length) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`);
          setTimeout(tick, 30);
        } else res.end('data: [DONE]\n\n');
      };
      tick();
    });
  });
  await new Promise(r => server.listen(0, '0.0.0.0', r));
  const port = server.address().port;
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find(a => a && a.family === 'IPv4' && !a.internal);
  if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
  const script = `(async () => {
    for (let i = 0; i < 100 && projectBusy; i++) await new Promise(r => setTimeout(r, 100));   // 等页面自己的启动跑完
    const out = { origin: location.origin, platform: PLATFORM, corsHelpHidden: document.querySelector('#cors-hint').closest('details').hidden };
    const call = async (base, stream) => { cfg.base = base; cfg.model = 'mock'; cfg.key = 'sk-selftest'; return (await ask('系统', '用户', { stream })).text; };
    try { out.stream = await call('http://127.0.0.1:${port}/v1', true); } catch (e) { out.stream = '失败：' + e.message; }
    try { out.json = await call('http://127.0.0.1:${port}/v1', false); } catch (e) { out.json = '失败：' + e.message; }
    try { cfg.base = 'http://127.0.0.1:${port}/v1'; out.models = await fetchModels(); } catch (e) { out.models = '失败：' + e.message; }
    ${lan ? `try { out.lanHttp = await call('http://${lan.address}:${port}/v1', true); } catch (e) { out.lanHttp = '失败：' + e.message; }` : ''}
    localStorage.setItem('miemie.selftest', '1'); out.localStorage = localStorage.getItem('miemie.selftest') === '1'; localStorage.removeItem('miemie.selftest');
    try { const db = await openStore(); out.indexedDB = [...db.objectStoreNames]; } catch (e) { out.indexedDB = '失败：' + e.message; }
    out.tabs = [...document.querySelectorAll('[data-tab]')].map(b => b.textContent);
    return out;
  })()`;
  const result = await win.webContents.executeJavaScript(script);
  result.requestsSeen = seen;
  result.lanAddress = lan ? lan.address : null;
  console.log('SELFTEST ' + JSON.stringify(result));
  // 免安装版是自解压外壳，真程序的控制台输出传不回来；给了路径就另写一份文件
  if (process.env.MIEMIE_SELFTEST_OUT) require('node:fs').writeFileSync(process.env.MIEMIE_SELFTEST_OUT, JSON.stringify(result));
  server.close();
  app.exit(0);
}
