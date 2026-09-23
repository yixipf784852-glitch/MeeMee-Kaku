// 桌面端预加载：只给页面开一个口子——告诉外壳当前是深色还是浅色，好让标题栏跟着变。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miemieDesktop', {
  setTheme: theme => ipcRenderer.send('miemie:theme', String(theme)),
});
