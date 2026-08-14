# DSH Desktop Shell

DeepSeek Harness Web UI 的**纯壳** Electron 桌面封装。

**方案三：不内置 Node.js 和 DSH runtime** —— 完全依赖本机已安装的环境（pnpm + DeepSeek Harness checkout）。应用只负责：

1. 打开一个 Electron 窗口，先显示"正在启动 DeepSeek Harness..."加载页；
2. 在主进程中用 `child_process.spawn` 在 DSH 项目目录执行 `pnpm dsh web`（`shell: true`）；
3. 捕获子进程 stdout，出现 `http://127.0.0.1:<port>` 时自动加载该地址；
4. 窗口关闭时用 `taskkill /T /F` 杀掉整棵进程树，保证 pnpm/node 子进程不残留。

## 目录结构

```
dsh-desktop-shell/
├── package.json    # 依赖与 electron-builder 打包配置
├── main.js         # Electron 主进程（含加载页、子进程管理）
├── preload.js      # 预加载脚本（把启动状态安全暴露给加载页）
├── icon.ico        # 应用图标（占位，可自行替换）
└── README.md       # 本文件
```

## 前置要求（本机已满足）

| 要求 | 说明 | 验证 |
|---|---|---|
| Node.js ≥ 20 | 运行 npm/electron-builder | `node --version` |
| pnpm | 启动 DSH 用 | `pnpm --version` |
| DeepSeek Harness checkout | `pnpm dsh web` 可手动启动 | 在项目目录执行 `pnpm dsh web` |
| API Key | 已配置（如 `$DSH_HOME\.credentials.yaml` 或环境变量） | — |

## 修改配置

编辑 `main.js` 顶部的【可配置项】：

```js
const DSH_PROJECT_DIR = 'D:/DeepSeekHarness/deepseek-harness'; // DSH 项目路径（改这里）
const DSH_START_COMMAND = 'pnpm dsh web';                       // 启动命令
const STARTUP_TIMEOUT_MS = 120000;                              // 启动超时（毫秒）
```

## 安装依赖

```powershell
cd D:\DeepSeekHarness\DSH-GUI\dsh-desktop-shell
npm install
```

> 仅安装 `electron` 与 `electron-builder` 两个开发依赖。electron 二进制约 120MB，首次下载可能较慢。

## 测试运行

```powershell
npm start
```

预期行为：

1. 弹出桌面窗口，显示"正在启动 DeepSeek Harness..."加载页（带转圈动画）；
2. 主进程启动 `pnpm dsh web`，加载页显示命令与目录信息；
3. 数秒后捕获到 `http://127.0.0.1:3080`，窗口自动切换到完整界面；
4. 关闭窗口后，可用任务管理器确认没有残留的 node/pnpm 进程。

> ⚠️ 若 3080 端口已被占用（例如另一个 DSH Web UI 正在运行），加载页会提示"端口被占用"，请先关闭其他实例再运行。

## 打包（NSIS 安装包）

```powershell
npm run dist
```

> ⚠️ **若应用正在运行**：默认输出目录 `dist/` 会被运行中的 exe 锁定（EBUSY 报错）。
> 无需关闭应用，改用独立输出目录即可：
> ```powershell
> npx electron-builder --win --config.directories.output=dist-v2
> ```
> 打包完成后关掉旧版，运行 `dist-v2\win-unpacked\DSH Desktop Shell.exe` 即可切换。

产物位于 `dist/`（或指定的输出目录）目录：

- `DSH Desktop Shell Setup 0.1.0.exe` —— NSIS 安装程序（双击安装，可选安装目录、创建桌面快捷方式）
- `win-unpacked/` —— 免安装的解压即用目录

仅想生成免安装目录（更快，用于自测）：

```powershell
npm run dist:dir
```

## 常见问题

| 问题 | 解决 |
|---|---|
| 窗口一直停在加载页 | 在终端手动执行 `pnpm dsh web` 排查；确认 `DSH_PROJECT_DIR` 路径正确 |
| 提示"端口被占用" | 关闭其他 DSH 实例（含现有 Web UI）后重试 |
| Windows SmartScreen 提示"未知发布者" | 未签名应用的正常提示，点"更多信息 → 仍要运行"；正式分发需代码签名 |
| 打包时报 icon 错误 | 确认 `icon.ico` 存在且为有效 ICO（可替换为自己的 256×256 图标） |

## 安全说明

- 壳应用**不注入、不修改** Harness 界面，只做进程生命周期管理；
- `contextIsolation: true`、`nodeIntegration: false`，页面内无法访问 Node API；
- 页面外链统一交给系统浏览器打开。
