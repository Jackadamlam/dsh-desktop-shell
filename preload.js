// ============================================================================
// DSH Desktop Shell —— preload 脚本
// 通过 contextBridge 安全地向加载页暴露 IPC 接口：
//   window.dshShell.onStatus(callback)   —— 订阅主进程推送的启动状态
//   window.dshShell.requestRetry()       —— 请求主进程重新启动 DSH 服务
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dshShell', {
  onStatus: (callback) => {
    ipcRenderer.on('dsh:status', (_event, payload) => {
      if (typeof callback === 'function') callback(payload);
    });
  },
  requestRetry: () => {
    ipcRenderer.send('dsh:retry');
  },
});
