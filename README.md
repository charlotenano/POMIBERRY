# POMIBERRY

A cozy, local-first focus companion with a strawberry pixel-art identity. This first milestone implements the Phase 1 timer, tasks, basic settings, and local history.

## Run it

Requires Node.js 20 or newer. No package install or network connection is needed.

```sh
npm.cmd start
```

Open the local address printed by the server (`http://127.0.0.1:4173`). Don’t open `index.html` directly: the page uses JavaScript modules, which browsers block on `file://`. The page now shows a styled launch note in that case. The small Node server only serves files from this project on the loopback interface. To create a static production folder, run `npm.cmd run build`; the result is in `dist/`.

## Check the timer engine

```sh
npm test
```

## Phase 1 features

- Focus presets (5, 10, 15, 25, 45 minutes), break presets (5, 10, 15), and validated custom session durations.
- Absolute-target countdowns that recover across reloads and reconcile after the browser returns from sleep/background.
- Focus and break sessions, early ending with partial time recorded honestly, and explicit user-started transitions.
- Optional focus contract, task selection, task creation/editing/removal/completion, and a compact dashboard.
- Draggable, collapsible in-page strawberry timer widget with progress ring; its position is remembered locally.
- Local session history and daily focus summary, basic preferences, and browser notifications when permission is granted.
- Keyboard-visible focus, semantic controls, responsive layout, and reduced-motion support.
- No analytics, remote font requests, AI calls, or browsing-history collection.

## Optional Chrome website focus

An optional Manifest V3 extension is in `extension/`. It shows a movable strawberry timer across Chrome webpages and can restrict top-level website navigation while a focus session is running. In Website focus settings, add main websites and optional sign-in/helper domains; when starting a timer, check the websites you want to use during that session. Other already-open website tabs are redirected too. See [extension/README.md](extension/README.md) for manual load steps and limits. The extension requests broad website access from Chrome; it is not installed or enabled by this project. It cannot restrict other browsers or desktop applications.

## Data and privacy

The browser preview stores tasks, preferences, active timer data, and session history in this browser's `localStorage`. It does not use a server database. The optional Chrome extension temporarily stores the original URLs of tabs it redirects so those same tabs can be restored when website focus ends; those URLs stay in local extension storage. Clearing this browser's site data removes the app records. Never put secrets or passwords in task notes.

## Limitations in this build

- This workspace has Node.js but no Rust toolchain or Cargo. The deliverable runs as a local browser app; it is not yet packaged as a native Tauri desktop application. Its floating timer is in-page and cannot stay above other desktop apps. A Tauri shell, native always-on-top behavior, SQLite migrations, and OS-level sleep/wake hooks remain to be added when the Windows Rust build toolchain is available.
- Browser background timers can be suspended by the browser. The countdown is calculated from an absolute timestamp and catches up when the page becomes active again, but a browser notification may not appear at the exact end time while the browser is fully closed.
- Notification permission is browser-controlled and optional.
- The Chrome extension source is available but not installed or live-tested here. It uses a local content-script bridge, not Native Messaging. Website filtering applies only to top-level Chrome `http`/`https` navigation; other browsers, embedded frames, and desktop apps are not restricted. Ollama assistance and native desktop restrictions are not implemented.
- The focus contract currently supports a short intention before a focus session; post-session reflection is intentionally not required.

## Project layout

```text
assets/       pixel strawberry mascot
extension/    optional Chrome MV3 website-focus companion
scripts/      offline build helper
src/          timer engine, persistence and UI
tests/        deterministic timer and storage tests
dist/         generated static build (after npm run build)
```
