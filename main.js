// ============================================================================
// DSH Desktop Shell —— 主进程
// 纯壳方案：不内置 Node.js / DSH runtime，完全依赖本机已安装的环境。
// 流程：启动 Electron -> 显示加载页 -> spawn `pnpm dsh web` ->
//       捕获 stdout 中的 http://127.0.0.1:<port> -> 加载该 URL。
// 增强：
//   - 任务栏托盘（鲸鱼图标），tooltip 实时显示 DSH 服务状态
//   - 托盘菜单：显示/隐藏窗口、重启服务、开机自启、退出
//   - 关闭窗口 = 最小化到托盘（服务继续跑）；仅托盘"退出"才彻底结束
//   - 开机自启时直接进托盘，不弹窗口
//   - 记住窗口位置与大小；加载页显示版本号
// 退出时用 taskkill /T /F 杀掉整棵进程树，确保 pnpm/node 子进程不残留。
// ============================================================================

const { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================================
// 【可配置项】按需修改
// ============================================================================
// DSH 项目 checkout 的绝对路径（pnpm dsh web 在这个目录下执行）
const DSH_PROJECT_DIR = 'D:/DeepSeekHarness/deepseek-harness';

// 启动命令（配合 shell: true，pnpm 会从 PATH 解析）
const DSH_START_COMMAND = 'pnpm dsh web';

// 等待服务就绪的超时时间（毫秒），超时后加载页/托盘显示错误提示
const STARTUP_TIMEOUT_MS = 120000;

// 窗口默认尺寸（用户调整后会被记住，下次启动沿用）
const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 860;
const WINDOW_MIN_WIDTH = 800;
const WINDOW_MIN_HEIGHT = 600;

// 窗口状态存储文件（userData 下，不污染项目）
const WINDOW_STATE_FILE = 'window-state.json';
// ============================================================================

let mainWindow = null;    // 主窗口
let tray = null;          // 托盘
let dshProcess = null;    // dsh 子进程
let urlLoaded = false;    // 是否已加载到服务 URL（只加载一次）
let startupTimer = null;  // 启动超时定时器
let appIsQuitting = false; // 是否正在真正退出（托盘"退出"触发）
let windowSaveTimer = null; // 窗口状态防抖保存定时器

// ---------- 托盘状态机 ----------
let trayState = 'starting'; // starting | running | error | stopped
let trayUrl = '';           // 服务地址（running 时）
let trayDetail = '';        // 附加说明（error 时）

// ---------- 状态图标（白=启动中 / 蓝=运行中 / 黑=已停止 / 灰=异常） ----------
const trayIcons = {
  starting: nativeImage.createFromPath(path.join(__dirname, 'assets/tray/tray-starting.png')),
  running: nativeImage.createFromPath(path.join(__dirname, 'assets/tray/tray-running.png')),
  stopped: nativeImage.createFromPath(path.join(__dirname, 'assets/tray/tray-stopped.png')),
  error: nativeImage.createFromPath(path.join(__dirname, 'assets/tray/tray-error.png')),
};

// ---------- 状态推送：加载页 + 托盘 ----------
function setStatus(text, type = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dsh:status', { text, type });
  }
}

function setTray(state, { url = '', detail = '' } = {}) {
  trayState = state;
  if (url) trayUrl = url;
  if (detail) trayDetail = detail;
  updateTray();
}

function updateTray() {
  if (!tray) return;
  const statusLabel =
    trayState === 'running' ? 'DSH 运行中 ' + trayUrl
    : trayState === 'starting' ? 'DSH 启动中…'
    : trayState === 'error' ? 'DSH 异常：' + trayDetail
    : 'DSH 已停止';

  // 状态图标变色：白=启动中 / 蓝=运行中 / 黑=已停止 / 灰=异常
  tray.setImage(trayIcons[trayState] || trayIcons.starting);
  tray.setToolTip(statusLabel);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { type: 'separator' },
      { label: '显示 / 隐藏窗口', click: () => toggleMainWindow() },
      {
        label: '重启服务',
        click: () => {
          setStatus('正在重启服务…');
          stopDsh();
          urlLoaded = false;
          startDsh();
        },
      },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: getAutoLaunch(),
        click: (item) => setAutoLaunch(item.checked),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          appIsQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

// ---------- 开机自启 ----------
function getAutoLaunch() {
  return app.getLoginItemSettings().openAtLogin;
}

function setAutoLaunch(enabled) {
  if (app.isPackaged) {
    // 打包版：直接注册当前 exe
    app.setLoginItemSettings({ openAtLogin: enabled });
  } else {
    // 开发版（npm start）：electron.exe + 项目路径
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: [app.getAppPath()],
    });
  }
  updateTray();
}

// ---------- 窗口显示/隐藏 ----------
function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindow() {
  if (mainWindow) mainWindow.hide();
}

function toggleMainWindow() {
  if (mainWindow && mainWindow.isVisible()) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

// ---------- 加载页（内嵌 HTML，无需额外文件） ----------
// 品牌蓝鲸鱼 logo：运行时从 assets/whale.svg 读取（可维护、可换色）
const WHALE_LOGO = (() => {
  try {
    const svg = fs.readFileSync(path.join(__dirname, 'assets/whale.svg'), 'utf8');
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  } catch (e) {
    return '';
  }
})();

function createLoadingHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { height:100vh; display:flex; align-items:center; justify-content:center; overflow:hidden;
         font-family:"Segoe UI",system-ui,-apple-system,sans-serif; color:#e6edf7;
         background:radial-gradient(1100px 560px at 50% -8%, #1c2b55 0%, #101a36 48%, #0a0f1e 100%); }
  .card { text-align:center; animation:fadeUp .5s ease; }
  .whale { width:112px; height:112px; margin:0 auto 26px; display:block;
           filter:drop-shadow(0 10px 28px rgba(79,140,255,.38)); animation:breathe 3.2s ease-in-out infinite; }
  h1 { font-size:23px; font-weight:600; letter-spacing:.5px; }
  .sub { font-size:12.5px; color:#8fa3c0; margin-top:7px; letter-spacing:2.5px; text-transform:uppercase; }
  .spinner { width:34px; height:34px; border:3px solid rgba(255,255,255,.12); border-top-color:#4f8cff;
             border-radius:50%; margin:28px auto 0; animation:spin 1s linear infinite; }
  .bar { width:300px; height:4px; border-radius:2px; background:rgba(255,255,255,.08);
         margin:26px auto 0; overflow:hidden; }
  .bar i { display:block; height:100%; width:38%; border-radius:2px;
           background:linear-gradient(90deg,#4f8cff,#7aa2ff);
           animation:slide 1.4s ease-in-out infinite; }
  .status { margin-top:18px; font-size:12.5px; color:#8fa3c0; white-space:pre-wrap; line-height:1.8; max-width:580px; }
  .status.error { color:#ff6b6b; }
  .btn { display:none; margin-top:22px; padding:10px 30px; border:none; border-radius:8px; cursor:pointer;
         background:#4f8cff; color:#fff; font-size:14px; font-weight:600; letter-spacing:1px;
         transition:background .2s, transform .1s; }
  .btn:hover { background:#6aa2ff; }
  .btn:active { transform:scale(.96); }
  .foot { position:fixed; bottom:18px; width:100%; text-align:center; font-size:11px; color:#5b6b8c; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes slide { 0%{transform:translateX(-110%)} 100%{transform:translateX(370%)} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
  @keyframes breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
</style>
</head>
<body>
  <div class="card">
    <img class="whale" src="${WHALE_LOGO}" alt="DeepSeek Harness">
    <h1>DeepSeek Harness</h1>
    <div class="sub">Local · Desktop</div>
    <div class="spinner" id="spinner"></div>
    <div class="bar" id="bar"><i></i></div>
    <div class="status" id="status">正在初始化本地服务，请稍候…</div>
    <button class="btn" id="retry">重 试</button>
  </div>
  <div class="foot">DSH Desktop Shell v${app.getVersion()}</div>
  <script>
    window.dshShell.onStatus(function (s) {
      var el = document.getElementById('status');
      el.textContent = s.text;
      if (s.type === 'error') {
        el.className = 'status error';
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('bar').style.display = 'none';
        document.getElementById('retry').style.display = 'inline-block';
      } else {
        el.className = 'status';
        document.getElementById('spinner').style.display = '';
        document.getElementById('bar').style.display = '';
        document.getElementById('retry').style.display = 'none';
      }
    });
    document.getElementById('retry').addEventListener('click', function () {
      window.dshShell.requestRetry();
    });
  </script>
</body>
</html>`;
}

// ---------- 窗口状态记忆（位置/大小持久化） ----------
function windowStateFile() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'));
    if (s && typeof s.x === 'number' && typeof s.y === 'number' &&
        s.width >= WINDOW_MIN_WIDTH && s.height >= WINDOW_MIN_HEIGHT) {
      return s;
    }
  } catch (e) { /* 无历史或文件损坏，用默认 */ }
  return null;
}

function isVisibleOnSomeDisplay(bounds) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return bounds.x < a.x + a.width && bounds.x + bounds.width > a.x &&
           bounds.y < a.y + a.height && bounds.y + bounds.height > a.y;
  });
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    fs.writeFileSync(windowStateFile(), JSON.stringify(mainWindow.getBounds()));
  } catch (e) { /* 忽略写失败 */ }
}

function scheduleWindowStateSave() {
  clearTimeout(windowSaveTimer);
  windowSaveTimer = setTimeout(saveWindowState, 500);
}

// ---------- 创建主窗口 ----------
function createWindow() {
  const saved = loadWindowState();
  const useSaved = saved && isVisibleOnSomeDisplay(saved);

  mainWindow = new BrowserWindow({
    x: useSaved ? saved.x : undefined,
    y: useSaved ? saved.y : undefined,
    width: useSaved ? saved.width : WINDOW_WIDTH,
    height: useSaved ? saved.height : WINDOW_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    icon: path.join(__dirname, 'icon.ico'),
    title: 'DeepSeek Harness',
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

  // 记住窗口位置与大小（防抖保存，重启后沿用）
  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('close', () => saveWindowState());

  // 关闭窗口 = 最小化到托盘（服务继续跑），只有托盘"退出"才真正结束
  mainWindow.on('close', (e) => {
    if (!appIsQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (process.platform === 'win32' && tray) {
        tray.displayBalloon({
          title: 'DSH Desktop Shell',
          content: '已最小化到托盘，DSH 服务仍在运行。右键托盘图标可退出。',
        });
      }
    }
  });
}

// ---------- 创建托盘 ----------
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.ico'));
  tray = new Tray(icon);
  tray.on('click', () => toggleMainWindow());
  updateTray();
}

// ---------- 启动 DSH 子进程 ----------
function startDsh() {
  setStatus(
    '正在启动 DeepSeek Harness...\n\n' +
      '命令: ' + DSH_START_COMMAND + '\n' +
      '目录: ' + DSH_PROJECT_DIR
  );
  setTray('starting', { detail: '正在启动…' });

  try {
    // shell: true 确保 pnpm（.cmd / .ps1 shim）能从 PATH 中找到并执行
    dshProcess = spawn(DSH_START_COMMAND, [], {
      cwd: DSH_PROJECT_DIR,
      shell: true,
      windowsHide: true,
    });
  } catch (err) {
    setStatus('子进程启动失败: ' + err.message, 'error');
    setTray('error', { detail: '启动失败' });
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
      setStatus('服务已就绪: ' + url + '\n正在加载界面…');
      setTray('running', { url: url });
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
      const msg =
        '端口被占用：3080 可能已被其他 DSH 实例（如现有 Web UI）占用。\n' +
        '请先关闭其他实例后重试。\n\n' + text.slice(0, 300);
      setStatus(msg, 'error');
      setTray('error', { detail: '端口被占用' });
    }
  });

  dshProcess.on('error', (err) => {
    setStatus('子进程错误: ' + err.message, 'error');
    setTray('error', { detail: '子进程错误' });
  });

  dshProcess.on('exit', (code, signal) => {
    if (!urlLoaded) {
      const msg =
        'DSH 进程已退出（code=' + code + ' signal=' + signal + '）\n' +
        '请检查：\n' +
        '1. DSH_PROJECT_DIR 路径是否正确\n' +
        '2. pnpm 是否在 PATH 中（终端执行 pnpm -v 验证）\n' +
        '3. 在终端手动执行 ' + DSH_START_COMMAND + ' 是否正常';
      setStatus(msg, 'error');
      setTray('error', { detail: '进程退出 code=' + code });
    } else {
      // 运行中服务退出（例如手动关闭）：更新状态
      setTray('stopped', { detail: '服务已退出' });
    }
  });

  // 超时兜底
  startupTimer = setTimeout(() => {
    if (!urlLoaded) {
      const msg =
        '等待服务启动超时（' + Math.round(STARTUP_TIMEOUT_MS / 1000) + ' 秒）\n' +
        '请在终端手动执行 ' + DSH_START_COMMAND + ' 排查问题。';
      setStatus(msg, 'error');
      setTray('error', { detail: '启动超时' });
    }
  }, STARTUP_TIMEOUT_MS);
}

// ---------- 加载页"重试"按钮：清理后重新启动 ----------
ipcMain.on('dsh:retry', () => {
  stopDsh();          // 杀旧进程（含 3080 兜底清理）
  urlLoaded = false;  // 重置就绪标记
  startDsh();         // 重新拉起服务
});

// ---------- 停止 DSH 子进程（幂等 + 兜底清理，确保端口释放） ----------
function stopDsh() {
  clearTimeout(startupTimer);
  const pids = new Set();

  // 1) 自己 spawn 的进程树（cmd -> pnpm -> node -> ...）
  if (dshProcess && dshProcess.pid) pids.add(dshProcess.pid);

  // 2) 兜底：查 3080 端口上的 dsh web 进程，一并清理（防残留）
  try {
    const out = execSync(
      'netstat -ano | findstr :3080 | findstr LISTENING',
      { encoding: 'utf8', timeout: 5000 }
    );
    out.split(/\r?\n/).forEach((line) => {
      const m = line.trim().match(/\s+(\d+)\s*$/);
      if (m) {
        const pid = parseInt(m[1], 10);
        // 只清 dsh web（node 跑 apps/cli/src/bin.ts），避免误杀无关进程
        try {
          const cmd = execSync(
            'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ProcessId=' + pid + '\\" | Select-Object -ExpandProperty CommandLine"',
            { encoding: 'utf8', timeout: 8000 }
          );
          if (/apps[\\/]cli[\\/]src[\\/]bin\.ts/.test(cmd)) pids.add(pid);
        } catch (e) { /* 进程已消失 */ }
      }
    });
  } catch (e) { /* 3080 无监听者 */ }

  pids.forEach((pid) => {
    try {
      // 同步执行：确保进程树杀完才继续（退出前必须完成）
      execSync('taskkill /pid ' + pid + ' /T /F', { timeout: 10000, stdio: 'ignore' });
    } catch (e) { /* 进程可能已不存在 */ }
  });
  dshProcess = null;
}

// ---------- 应用生命周期 ----------
// 单实例锁：防止多个实例同时拉起 dsh web 争抢 3080 端口
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // 用户再次启动（双击/自启）时，激活已有实例的窗口
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(() => {
    createWindow();
    createTray();

    // 由"开机自启"拉起时，直接进托盘，不打扰
    if (app.getLoginItemSettings().wasOpenedAtLogin) {
      mainWindow.hide();
    }

    startDsh();

    app.on('activate', () => {
      // macOS 惯例：点击 Dock 图标时若无窗口则重建
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  // 托盘常驻：只有主动退出（appIsQuitting）才结束进程
  if (appIsQuitting) app.quit();
});

app.on('before-quit', () => {
  appIsQuitting = true;
  stopDsh();
});
