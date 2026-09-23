'use strict';
// 跑在哪：web＝浏览器直接打开这份 HTML；desktop＝Electron 桌面端；android＝Capacitor 安卓端。
// 后两个不受浏览器跨域限制，跨域说明和接口代理的提示只在 web 上出现。
const PLATFORM = /Electron\//.test(navigator.userAgent)
  ? 'desktop'
  : globalThis.Capacitor?.isNativePlatform?.()
    ? 'android'
    : 'web';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}
const oldCfg = readLocal('miemie.cfg', {});
const cfg = Object.assign({ base: '', key: '', model: '', temp: 0.8, maxTokens: 8192, stream: true }, oldCfg);
if (!cfg.base) cfg.base = oldCfg.baseUrl || oldCfg.url || '';
if (oldCfg.maxTok && !oldCfg.maxTokens) cfg.maxTokens = oldCfg.maxTok;
const uiCfg = Object.assign({ theme: 'system', concurrency: 3, tplId: 'charV2' }, readLocal('miemie.ui', {}));
const S = {
  card: null,
  filename: '卡',
  png: null,
  art: null,
  shape: [],
  plan: new Map(),
  overrides: new Map(),
  opt: { order: true, position: true, keys: true, constant: true, enable: true, marker: true, clear: true },
  issues: [],
  parts: [],
  jobs: null,
  lore: { work: '', text: '', web: false },
  roster: '',
  params: { charTpl: 'charV2', timelineTpl: 'tlTVD', arc: '', start: '' },
  manual: { tplId: uiCfg.tplId, name: '', material: '', text: '', reasoning: '', appliedIds: [], params: {} },
  initialOrders: null,
  lastAssembly: null,
};
let currentStep = 1,
  currentTab = 'pipeline',
  entryMode = 'new',
  previewJobs = [],
  inspected = null;
let manualController = null,
  manualRunning = false,
  projectBusy = false,
  toastTimer = 0,
  persistTimer = 0,
  historyCache = [],
  coverURL = null;
// 修卡台的工程：和流水线的 S 分开放，互不覆盖；不进 IndexedDB，刷新即清空。
const R = {
  raw: null,
  fixed: null,
  issues: [],
  health: null,
  plan: new Map(),
  overrides: new Map(),
  diff: new Map(),
  touched: new Set(),
  genIds: new Set(),
  opt: { order: true, position: true, keys: true, constant: true, enable: true, marker: true, clear: true },
  png: null,
  art: null,
  shape: [],
  guessRate: 0,
  filename: '卡',
  lore: Object.assign({ text: '', web: false }, readLocal('miemie.repair.lore', {})),
};
const RC = { running: false, abort: false, done: 0, total: 0, results: [], controller: null };
const RG = { part: null, tplId: '', params: {}, form: false, running: false, text: '', error: '', controller: null };
let repairBusy = false,
  repairCoverURL = null;
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  warning: '<path d="M12 4 2.8 20h18.4zM12 10v4M12 17h.01"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  upload: '<path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12m-4-4 4 4 4-4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  play: '<path d="m8 5 11 7-11 7z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1M20.5 3.5v5h-5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8M5.3 5.3l2 2M16.7 16.7l2 2M18.7 5.3l-2 2M7.3 16.7l-2 2"/>',
  theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"/>',
  arrow: '<path d="m9 6 6 6-6 6"/>',
  list: '<path d="M4 5h16M4 12h16M4 19h10"/>',
  book: '<path d="M12 5c-3-2-7-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',
  sheep:
    '<path d="M7 9C2 8 2 15 6 16c0 4 5 5 7 2 4 2 8-1 7-5 3-4-1-7-4-6-1-4-7-4-9 2Z"/><path d="M10 12c0-3 7-3 7 0v3c0 4-7 4-7 0Zm-3 6v3m11-4v4M11.5 13h.1m3.3 0h.1"/>',
};
function icon(name, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.circle}</svg>`;
}
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 16);
  });
}
function segLabel(id) {
  return (SEG[id]?.label || id).replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '');
}
function toast(message, type = 'ok') {
  $('#toast').textContent = message;
  $('#toast').className = 'toast' + (type === 'error' ? ' error' : '');
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 5500);
}
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast('浏览器未允许保存设置，请先导出工程或角色卡。', 'error');
    return false;
  }
}
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void saveProject();
  }, 600);
}
function safeName(text) {
  return String(text || '未命名卡')
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 80);
}
function download(bytes, name, mime) {
  if (PLATFORM === 'android') return void saveOnAndroid(bytes, name);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
// 安卓 WebView 不认网页下载：先写进应用缓存，再弹系统分享面板——存进手机「文件」、发 QQ 都从这儿走
async function saveOnAndroid(bytes, name) {
  // 页面没走打包器，插件从原生桥挂在全局的 Capacitor 上取；两种取法都试
  const cap = globalThis.Capacitor,
    plugin = name => cap?.Plugins?.[name] || cap?.registerPlugin?.(name);
  const Filesystem = plugin('Filesystem'),
    Share = plugin('Share');
  try {
    const text = typeof bytes === 'string';
    const { uri } = await Filesystem.writeFile({
      path: 'exports/' + name,
      data: text ? bytes : bytesToBase64(bytes),
      directory: 'CACHE',
      ...(text ? { encoding: 'utf8' } : {}),
      recursive: true,
    });
    await Share.share({ title: name, files: [uri] });
  } catch (e) {
    if (!/cancel/i.test(String(e?.message))) toast('没存成：' + (e?.message || e), 'error');
  }
}
function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function copyText(text) {
  if (!text) {
    toast('还没有可复制的内容');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.position = 'fixed';
    t.style.left = '-9999px';
    document.body.append(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    if (!ok) {
      toast('复制失败，请选中文字后手动复制。', 'error');
      return;
    }
  }
  toast('已复制到剪贴板');
}
function busy() {
  return !!S.jobs?.running || manualRunning || projectBusy || repairBusy || RC.running || RG.running;
}
function guardIdle() {
  if (busy()) {
    toast('请先停止当前生成，再切换或修改工程。');
    return false;
  }
  return true;
}
function showDialog(id) {
  const d = $(id);
  if (!d.open) d.showModal();
}
function renderBusy() {
  const locked = busy();
  [
    'work-name',
    'card-name',
    'lore-text',
    'roster',
    'timeline-arc',
    'timeline-start',
    'lore-web',
    'char-template',
    'timeline-template',
    'timeline-scope',
    'setting-mode',
    'create-card',
    'new-project',
    'assemble',
    'save-snapshot',
    'show-snapshots',
    'restore-open',
    'start-restore',
    'choose-art',
    'clear-art',
    'export-png',
    'export-json',
    'export-book',
    'save-api',
    'test-api',
    'fetch-models',
    'manual-generate',
    'manual-apply',
    'manual-name',
    'manual-material',
    'manual-arc',
    'manual-start',
    'manual-scope',
    'manual-continue',
    'manual-setting-mode',
    'copy-prompt',
  ].forEach(id => {
    const el = $('#' + id);
    if (el) el.disabled = locked;
  });
  const output = $('#manual-output');
  if (output) output.readOnly = locked;
  $('#new-project').hidden = !S.card;
  renderRepairBusy();
}
function onProjectSaved(at, ok) {
  const el = $('#save-status');
  if (el) {
    el.textContent = ok ? '已存盘 · ' + new Date(at).toLocaleTimeString() : '本地存盘失败，请导出备份';
    el.classList.toggle('crit', !ok);
  }
}
