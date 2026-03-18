# Orion Browser v2

A real Chromium-based desktop browser built on Electron's **BrowserView** API — not the buggy `<webview>` tag. This means web pages load correctly every time.

## What's different from v1

| v1 (broken) | v2 (this) |
|---|---|
| Used `<webview>` tag | Uses `BrowserView` — Electron's proper Chromium embedding API |
| Blank page on startup | BrowserView bounds set from main process, always correct |
| `getURL()` could throw | Navigation handled in main process, no renderer-side DOM hacks |
| Single webview for all tabs | Each tab gets its own isolated BrowserView |

## Quick start (run from source)

### Windows
1. Install [Node.js LTS](https://nodejs.org) if you haven't
2. Double-click **`run-now.bat`**
3. First run downloads Electron (~100MB), then launches

### macOS / Linux
```bash
chmod +x run-now.sh
./run-now.sh
```

## Build a standalone .exe (Windows)

```bash
npm install
npm run build-win
```

Output goes to `dist/Orion Browser Setup x.x.x.exe` — a full installer, no Node.js required.

### Build for other platforms
```bash
npm run build-mac    # macOS .dmg
npm run build-linux  # Linux .AppImage
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+L` | Focus address bar |
| `Ctrl+R` or `F5` | Reload |
| `Ctrl+K` | Toggle AI panel |
| `Ctrl+D` | Bookmark page |
| `Ctrl+B` | Toggle bookmarks bar |
| `Alt+Left/Right` | Back / Forward |
| `Ctrl+1..9` | Switch to tab N |

## AI

- **Free by default**: Uses Pollinations (GPT-4o, no key needed)
- **HuggingFace models**: Select from the dropdown and paste your HF API key
- **Agent mode**: Type commands like "go to google.com and search for cats" — the AI controls the browser autonomously
