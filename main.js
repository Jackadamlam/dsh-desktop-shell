// ============================================================================
// DSH Desktop Shell —— 主进程
// 纯壳方案：不内置 Node.js / DSH runtime，完全依赖本机已安装的环境。
// 流程：启动 Electron -> 显示加载页 -> spawn `pnpm dsh web` ->
//       捕获 stdout 中的 http://127.0.0.1:<port> -> 加载该 URL。
// 窗口关闭时用 taskkill /T /F 杀掉整棵进程树，确保 pnpm/node 子进程不残留。
// ============================================================================

const { app, BrowserWindow, shell } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');

// ============================================================================
// 【可配置项】按需修改
// ============================================================================
// DSH 项目 checkout 的绝对路径（pnpm dsh web 在这个目录下执行）
const DSH_PROJECT_DIR = 'D:/DeepSeekHarness/deepseek-harness';

// 启动命令（配合 shell: true，pnpm 会从 PATH 解析）
const DSH_START_COMMAND = 'pnpm dsh web';

// 等待服务就绪的超时时间（毫秒），超时后加载页显示错误提示
const STARTUP_TIMEOUT_MS = 120000;

// 窗口尺寸
const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 860;
// ============================================================================

let mainWindow = null;   // 主窗口
let dshProcess = null;   // dsh 子进程
let urlLoaded = false;   // 是否已加载到服务 URL（只加载一次）
let startupTimer = null; // 启动超时定时器

// ---------- 工具函数：向加载页推送状态 ----------
function sendStatus(text, type = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dsh:status', { text, type });
  }
}

// ---------- 加载页（内嵌 HTML，无需额外文件） ----------
function createLoadingHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  body { margin:0; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
         background:#0f1420; color:#e6edf7; font-family:"Segoe UI",system-ui,sans-serif; }
  .logo { font-size:56px; margin-bottom:16px; }
  h1 { font-size:20px; font-weight:600; margin:0 0 10px; }
  .spinner { width:34px; height:34px; border:3px solid #2a3550; border-top-color:#4f8cff; border-radius:50%;
             animation:spin 1s linear infinite; margin-bottom:20px; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .status { font-size:14px; color:#8fa3c0; white-space:pre-wrap; text-align:center; max-width:660px; line-height:1.7; }
  .status.error { color:#ff6b6b; }
</style>
</head>
<body>
  <div class="logo">🐋</div>
  <h1>正在启动 DeepSeek Harness...</h1>
  <div class="spinner"></div>
  <div class="status" id="status">正在初始化本地服务，请稍候…</div>
  <script>
    window.dshShell.onStatus(function (s) {
      var el = document.getElementById('status');
      el.textContent = s.text;
      el.className = s.type === 'error' ? 'status error' : 'status';
    });
  </script>
</body>
</html>`;
}

// ---------- 创建主窗口 ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    icon: path.join(__dirname, 'icon.ico'),
    title: 'DSH Desktop Shell',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 页面里的外链一律交给系统浏览器，不在壳内打开新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 先显示加载页
  mainWindow.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(createLoadingHtml())
  );

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopDsh();
  });
}

// ---------- 启动 DSH 子进程 ----------
function startDsh() {
  sendStatus(
    '正在启动 DeepSeek Harness...\n\n' +
      '命令: ' + DSH_START_COMMAND + '\n' +
      '目录: ' + DSH_PROJECT_DIR
  );

  try {
    // shell: true 确保 pnpm（.cmd / .ps1 shim）能从 PATH 中找到并执行
    dshProcess = spawn(DSH_START_COMMAND, [], {
      cwd: DSH_PROJECT_DIR,
      shell: true,
      windowsHide: true,
    });
  } catch (err) {
    sendStatus('子进程启动失败: ' + err.message, 'error');
    return;
  }

  // stdout：监听服务地址，出现 http://127.0.0.1:<port> 即加载
  dshProcess.stdout.on('data', (data) => {
    const text = data.toString();
    process.stdout.write(text);

    const match = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/);
    if (match && !urlLoaded) {
      urlLoaded = true;
      clearTimeout(startupTimer);
      const url = match[0];
      sendStatus('服务已就绪: ' + url + '\n正在加载界面…');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(url);
      }
    }
  });

  // stderr：回显 + 常见错误友好提示（如端口被占用）
  dshProcess.stderr.on('data', (data) => {
    const text = data.toString();
    process.stderr.write(text);

    if (/EADDRINUSE|address already in use|port.*(?:in use|taken)/i.test(text)) {
      sendStatus(
        '端口被占用：3080 可能已被其他 DSH 实例（如现有 Web UI）占用。\n' +
          '请先关闭其他实例后重试。\n\n' + text.slice(0, 300),
        'error'
      );
    }
  });

  dshProcess.on('error', (err) => {
    sendStatus('子进程错误: ' + err.message, 'error');
  });

  dshProcess.on('exit', (code, signal) => {
    if (!urlLoaded) {
      sendStatus(
        'DSH 进程已退出（code=' + code + ' signal=' + signal + '）\n' +
          '请检查：\n' +
          '1. DSH_PROJECT_DIR 路径是否正确\n' +
          '2. pnpm 是否在 PATH 中（终端执行 pnpm -v 验证）\n' +
          '3. 在终端手动执行 ' + DSH_START_COMMAND + ' 是否正常',
        'error'
      );
    }
  });

  // 超时兜底
  startupTimer = setTimeout(() => {
    if (!urlLoaded) {
      sendStatus(
        '等待服务启动超时（' + Math.round(STARTUP_TIMEOUT_MS / 1000) + ' 秒）\n' +
          '请在终端手动执行 ' + DSH_START_COMMAND + ' 排查问题。',
        'error'
      );
    }
  }, STARTUP_TIMEOUT_MS);
}

// ---------- 停止 DSH 子进程（幂等） ----------
function stopDsh() {
  clearTimeout(startupTimer);
  if (dshProcess && dshProcess.pid) {
    const pid = dshProcess.pid;
    // pnpm 会派生出 node 子进程，Windows 下必须杀整棵进程树
    exec('taskkill /pid ' + pid + ' /T /F', () => {});
    dshProcess = null;
  }
}

// ---------- 应用生命周期 ----------
app.whenReady().then(() => {
  createWindow();
  startDsh();

  app.on('activate', () => {
    // macOS 惯例：点击 Dock 图标时若无窗口则重建
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopDsh();
});
