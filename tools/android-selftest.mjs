// 安卓自检：在模拟器（或插着 USB 调试的手机）上装调试包，连进 App 里的 WebView，真去调一个不带跨域头的假接口、真去存文件。
// 用法：先 node tools/android.mjs debug 打调试包、开好模拟器，再 node tools/android-selftest.mjs
// 只有调试包能连 WebView 调试口；正式包只能装上、打开、截图。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ADB = path.join(ROOT, '.toolchain', 'android-sdk', 'platform-tools', 'adb.exe');
const APK = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const PKG = 'com.meemee.kaku';
const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8' }).trim();
// 查不到时返回空串的版本：pidof 在进程还没起来时会以非零码退出
const adbSoft = (...args) => {
  try {
    return adb(...args);
  } catch {
    return '';
  }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 假接口：不带任何跨域头，预检直接 404
const seen = [];
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
    if (!JSON.parse(body || '{}').stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ choices: [{ message: { content: '一次性回复' } }] }));
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const p of ['咩', '咩', '制卡台'])
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise(r => server.listen(0, '0.0.0.0', r));
const port = server.address().port;

adb('wait-for-device');
while (adb('shell', 'getprop', 'sys.boot_completed') !== '1') await sleep(2000);
adb('install', '-r', APK);
adb('shell', 'am', 'force-stop', PKG);
adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);

// 找 App 的 WebView 调试口
let socket = '';
for (let i = 0; i < 30 && !socket; i++) {
  await sleep(1000);
  const pid = adbSoft('shell', 'pidof', PKG);
  if (pid)
    socket =
      (adb('shell', 'cat', '/proc/net/unix').match(new RegExp(`@(webview_devtools_remote_${pid})`)) || [])[1] || '';
}
if (!socket) {
  console.log(adbSoft('logcat', '-d', '-t', '80', 'AndroidRuntime:E', 'Capacitor:*', 'chromium:*', '*:S'));
  throw new Error(
    adbSoft('shell', 'pidof', PKG) ? '没找到 WebView 调试口（正式包连不上，要用调试包）' : 'App 没起来，上面是崩溃日志',
  );
}
adb('forward', 'tcp:9223', 'localabstract:' + socket);
let page;
for (let i = 0; i < 20 && !page; i++) {
  await sleep(500);
  page = (await (await fetch('http://127.0.0.1:9223/json')).json()).find(p => p.url.startsWith('https://localhost'));
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
const evaluate = expression =>
  new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMsg = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMsg);
      if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
      else resolve(msg.result?.result?.value);
    };
    ws.addEventListener('message', onMsg);
    ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }),
    );
  });

// 页面 300 多 KB，模拟器软件渲染慢：等主脚本跑完、启动流程结束再开始
let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  ready = await evaluate(
    `(() => { try { return typeof ask === 'function' && !projectBusy; } catch { return false; } })()`,
  );
  if (!ready) await sleep(500);
}
if (!ready) throw new Error('30 秒内页面没启动完');

const result = await evaluate(`(async () => {
  const out = { platform: PLATFORM, native: !!globalThis.Capacitor?.isNativePlatform?.(), corsHelpHidden: document.querySelector('#cors-hint').closest('details').hidden };
  const call = async stream => { cfg.base = 'http://10.0.2.2:${port}/v1'; cfg.model = 'mock'; cfg.key = 'sk-selftest'; return (await ask('系统', '用户', { stream })).text; };
  try { out.stream = await call(true); } catch (e) { out.stream = '失败：' + e.message; }
  try { out.json = await call(false); } catch (e) { out.json = '失败：' + e.message; }
  try { out.models = await fetchModels(); } catch (e) { out.models = '失败：' + e.message; }
  try { const db = await openStore(); out.indexedDB = [...db.objectStoreNames]; } catch (e) { out.indexedDB = '失败：' + e.message; }
  out.tabs = [...document.querySelectorAll('[data-tab]')].map(b => b.textContent);
  return out;
})()`);
// 下载：每存一份都会弹系统分享面板，存完从外面按返回关掉，再存下一份；页面上若弹了「没存成」就记下来
const save = async (expr, name) => {
  await evaluate(`$('#toast').hidden = true; ${expr}; new Promise(r => setTimeout(r, 3000))`);
  const shareUp = /Chooser|ResolverActivity|share/i.test(
    adb('shell', 'dumpsys', 'activity', 'activities')
      .split('\n')
      .filter(l => /topResumedActivity|mResumedActivity/.test(l))
      .join(' '),
  );
  const toast = await evaluate(`$('#toast').hidden ? '' : $('#toast').textContent`);
  // 按返回直到 App 回到最前面：模拟器软件渲染慢，系统界面偶尔卡住吞掉一次返回
  let back = false;
  for (let i = 0; i < 6 && !back; i++) {
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await sleep(2500);
    back = new RegExp(`${PKG.replace(/\./g, '\\.')}/\\.MainActivity`).test(
      adb('shell', 'dumpsys', 'activity', 'activities').match(/topResumedActivity.*/)?.[0] || '',
    );
  }
  return { name, shareSheetOpened: shareUp, pageError: toast || null, backToApp: back };
};
result.saves = [
  await save(`download(JSON.stringify({ 自检: '咩' }), '咩咩自检.json', 'application/json')`, 'json'),
  await save(`download(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), '咩咩自检.png', 'image/png')`, 'png'),
];
ws.close();
result.requestsSeen = seen;
result.exportedFiles = adb('shell', 'run-as', PKG, 'ls', '-l', 'cache/exports')
  .split('\n')
  .filter(l => /自检/.test(l))
  .map(l => l.trim().split(/\s+/).slice(4).join(' '));
adb('forward', '--remove', 'tcp:9223');
server.close();
fs.writeFileSync(path.join(ROOT, '.toolchain', 'android-selftest.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
