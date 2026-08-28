English | [中文](README.md)

# DSH Desktop Shell 🐋

**A lightweight desktop shell for the DeepSeek Harness Web UI** (pure-shell approach: no bundled Node.js / DSH runtime — it fully relies on your local environment).

An Electron desktop app that gives the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI a native desktop experience: standalone window, tray icon, auto-launch, and live service status.

> Unofficial project, not affiliated with DeepSeek AI. DeepSeek Harness is still in early development — do not run it with elevated permissions on untrusted projects.

## ✨ Features

| Feature | Description |
|---|---|
| 🪟 Standalone window | Double-click to launch, automatically starts the local `dsh web` service — no terminal needed |
| 🎨 Custom title bar | Dark gradient + whale logo + live status dot + custom window buttons (injected via shadow DOM, one-flag fallback to the native title bar) |
| 🐳 Branded loading screen | Deep-blue gradient, animated whale, progress bar, startup log, retry button on failure |
| 🔔 Tray icon | Color-coded by state (white=starting / blue=running / black=stopped / gray=error), tooltip shows the live service URL |
| 🚀 Auto-launch on login | Toggle from the tray menu; starts silently into the tray |
| 🧹 Zero residue on exit | Single-instance lock + synchronous process-tree kill + port fallback cleanup (port 3080 is always released on exit) |
| 🪟 Window state memory | Remembers position and size; falls back to safe defaults when a monitor disappears |
| ⚡ Fast startup | Launches the built DSH launcher directly (skips pnpm/tsx layers), falls back to `pnpm dsh web` automatically |
| 🚫 No browser popup | Starts the service with `--no-open` — the UI appears only in the Electron window, never in a system browser tab |

## 📦 Installation

Download the latest installer (NSIS) from the [Releases](https://github.com/Jackadamlam/dsh-desktop-shell/releases) page, or use the portable `win-unpacked` directory.

## 🛠️ Build from Source

### Prerequisites

- Windows 10/11 x64
- [Node.js](https://nodejs.org/) ≥ 20
- [pnpm](https://pnpm.io/)
- A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) checkout (where `pnpm dsh web` runs)
- A configured DeepSeek API Key (e.g. in `$DSH_HOME/.credentials.yaml` or an environment variable)

### Configuration

Edit the config section at the top of `main.js`:

```js
const DSH_PROJECT_DIR = 'C:/path/to/deepseek-harness'; // your DSH checkout path
const DSH_START_COMMAND = 'pnpm dsh web';              // fallback start command (--no-open is appended automatically)
const CUSTOM_TITLE_BAR = true;                          // custom title bar on/off
```

> Tip: put your local path in a git-ignored `local-config.js` (see `local-config.example.js` for the shape), so `main.js` stays generic for the repo.

### Install Dependencies

```powershell
npm install
```

### Run

```powershell
npm start
```

### Package

```powershell
npm run dist            # builds into dist/v<version>/ (versioned dirs, never locked)
.\run-latest.ps1        # launch the newest build
.\clean-old.ps1         # prune old builds (keeps newest 2 by default)
```

Release workflow: `npm run bump:patch` (bumps version + git tag) → `npm run dist`.

### 🚀 CI Auto-Release (GitHub Actions)

Pushing a `v*` tag triggers a cloud build on GitHub Actions — the installer is built and published as a GitHub Release automatically (no local packaging needed):

```powershell
npm version patch    # bump version, auto commit + tag (e.g. v0.1.8)
git push --tags      # CI builds and releases on GitHub
```

The workflow lives in `.github/workflows/release.yml` (Windows runner, electron-builder cache, auto-generated release notes). You can also trigger it manually from the Actions tab.

## 🧩 Recommended Plugins (optional, one-click install)

The shell itself is a pure shell; pair it with these third-party DSH Web UI plugins for a fuller experience:

| Plugin | Purpose | Install |
|---|---|---|
| [dsh-better-sidebar](https://github.com/Jackadamlam/DSH-better-sidebar) | Right-side workspace panel | `dsh plugin --profile web add github:Jackadamlam/DSH-better-sidebar` |
| [dsh-usage-stats](https://github.com/Jackadamlam/dsh-usage-stats) | Persistent usage status bar under the composer (today/total/cache/balance, per-provider rows) | `dsh plugin --profile web add github:Jackadamlam/dsh-usage-stats` |

**Install all at once** (applies the config patch automatically):

```powershell
.\setup-plugins.ps1
```

> Restart the shell after installing. Plugins belong to their respective authors.

## ⌨️ Usage Tips

- Clicking **✕** on the window = minimize to tray (the service keeps running)
- **Real exit** = right-click the tray whale → Exit
- Tray menu: Show/Hide window, **Restart service**, auto-launch on login, Exit
- The loading screen has a **Retry** button on startup failure

## 🏗️ Project Structure

```
dsh-desktop-shell/
├── main.js          # Main process (window/tray/child process/title-bar injection)
├── preload.js       # contextBridge secure bridge (status/retry/window actions)
├── icon.ico         # App icon (derived from official favicon.svg)
├── assets/
│   ├── tray/        # Four state-colored tray icons
│   └── whale.svg    # Whale logo for loading screen & title bar
├── run-latest.ps1   # Launch the newest build
├── clean-old.ps1    # Prune old builds
└── setup-plugins.ps1# One-click plugin installation
```

## 🤝 Credits & Copyright

- Icon and whale artwork derived from the official [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) favicon (MIT License)
- The Electron shell logic is independently implemented

## 📄 License

[MIT](LICENSE) © 2026 Jackadamlam
