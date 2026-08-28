# DSH Desktop Shell 🐋

**DeepSeek Harness Web UI 的轻量桌面封装**（纯壳方案：不内置 Node.js / DSH runtime，完全依赖本机已安装的环境）。

一个 Electron 桌面应用，为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web UI 提供原生桌面体验：独立窗口、任务栏托盘、开机自启、状态实时显示。

> 非官方项目，与 DeepSeek AI 无隶属关系。DeepSeek Harness 仍处于早期阶段，请勿在不受信任的项目中以高权限模式运行。

[English](README.en.md) | 中文

## ✨ 功能

| 功能 | 说明 |
|---|---|
| 🪟 独立窗口 | 双击启动，自动拉起本地 `dsh web` 服务，无需终端 |
| 🎨 自定义标题栏 | 深色渐变 + 鲸鱼 logo + 服务状态灯 + 自绘窗口按钮（shadow DOM 注入，可一键回退系统标题栏） |
| 🐳 品牌加载页 | 深蓝渐变背景、鲸鱼动画、进度条、启动日志、失败重试按钮 |
| 🔔 任务栏托盘 | 状态图标变色（白=启动中 / 蓝=运行中 / 黑=已停止 / 灰=异常），tooltip 实时显示服务地址 |
| 🚀 开机自启 | 托盘菜单勾选即生效，登录后静默进托盘 |
| 🧹 退出零残留 | 单实例锁 + 同步杀进程树 + 端口兜底清理（关闭后 3080 必定释放） |
| 🪟 窗口记忆 | 记住上次的位置与大小，显示器变化自动回退安全位置 |
| ⚡ 快速启动 | 直接调用 DSH 构建产物（跳过 pnpm/tsx 层），缺失时自动回退 `pnpm dsh web` |
| 🚫 不弹浏览器 | 以 `--no-open` 启动服务，界面只出现在 Electron 窗口，不再额外弹出系统默认浏览器 |

## 📦 安装

从 [Releases](https://github.com/Jackadamlam/dsh-desktop-shell/releases) 下载最新版安装包（NSIS），或使用免安装的 `win-unpacked` 目录。

## 🛠️ 从源码构建

### 前置要求

- Windows 10/11 x64
- [Node.js](https://nodejs.org/) ≥ 20
- [pnpm](https://pnpm.io/)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) checkout（`pnpm dsh web` 可手动启动）
- DeepSeek API Key（已配置，如 `$DSH_HOME/.credentials.yaml` 或环境变量）

### 配置

编辑 `main.js` 顶部的【可配置项】：

```js
const DSH_PROJECT_DIR = 'C:/path/to/deepseek-harness'; // 改成你的 DSH checkout 路径
const DSH_START_COMMAND = 'pnpm dsh web';              // 回退启动命令（自动追加 --no-open，不弹默认浏览器）
const CUSTOM_TITLE_BAR = true;                          // 自定义标题栏开关
```

> 提示：把你的本机路径放进被 git 忽略的 `local-config.js`（参考 `local-config.example.js`），`main.js` 保持通用，仓库干净。

### 安装依赖

```powershell
npm install
```

### 运行

```powershell
npm start
```

### 打包

```powershell
npm run dist            # 打包到 dist/v<版本号>/（版本化目录，永不互锁）
.\run-latest.ps1        # 启动最新版本
.\clean-old.ps1         # 清理旧版本产物（默认保留 2 个）
```

改版流程：`npm run bump:patch`（版本号 +1，自动 git tag）→ `npm run dist`。

### 🚀 CI 自动发布（GitHub Actions）

推送 `v*` 格式的 tag 会自动触发 GitHub Actions 云端构建——安装包自动打包并发布为 GitHub Release（**本机不再需要打包**）：

```powershell
npm version patch    # 升版本，自动 commit + tag（如 v0.1.8）
git push --tags      # CI 自动构建并发布
```

Workflow 位于 `.github/workflows/release.yml`（Windows runner、electron-builder 缓存、自动生成 Release Notes），也可以在 Actions 页面手动触发。

## 🧩 推荐插件（可选，一键安装）

桌面壳本身是纯壳，但配合以下 DSH Web UI 插件体验更完整（均为第三方开源插件）：

| 插件 | 用途 | 安装 |
|---|---|---|
| [@omdsh-dev/dsh-genui](https://github.com/omdsh-dev/dsh-genui) | `dsh-ui` 可交互 UI 组件（图表/表单/面板） | `dsh plugin --profile web add github:omdsh-dev/dsh-genui` |
| [dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) | 输入框 `@` 路径选择器（支持 1 万文件索引） | `dsh plugin --profile web add github:omdsh-dev/dsh-at-file` |
| [dsh-better-sidebar](https://github.com/omdsh-dev/dsh-better-sidebar) | 右侧栏工作台 | `dsh plugin --profile web add dsh-better-sidebar` |

**一键安装全部**（自动补丁配置）：

```powershell
.\setup-plugins.ps1
```

> 装完需重启桌面壳生效。插件属于各自作者，版权归其仓库所有。

## ⌨️ 使用提示

- 点窗口 **✕** = 最小化到托盘（服务继续跑）
- **真正退出** = 右键托盘鲸鱼 → 退出
- 托盘菜单：显示/隐藏窗口、**重启服务**、开机自启、退出
- 启动失败时加载页有**重试**按钮

## 🏗️ 项目结构

```
dsh-desktop-shell/
├── main.js          # 主进程（窗口/托盘/子进程管理/标题栏注入）
├── preload.js       # contextBridge 安全桥（状态/重试/窗口控制）
├── icon.ico         # 应用图标（官方 favicon.svg 派生）
├── assets/
│   ├── tray/        # 四色状态托盘图标
│   └── whale.svg    # 加载页/标题栏鲸鱼 logo
├── run-latest.ps1   # 启动最新版本
├── clean-old.ps1    # 清理旧产物
└── setup-plugins.ps1# 一键安装插件
```

## 🤝 致谢与版权

- 图标与鲸鱼素材派生自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（MIT License）的官方 favicon
- Electron 桌面壳逻辑完全独立实现

## 📄 License

[MIT](LICENSE) © 2026 Jackadamlam
