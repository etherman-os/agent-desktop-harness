# Troubleshooting Linux

This page covers Linux dependencies and failure modes for the Xvfb session runtime, semantic drivers, Visual QA, and optional live observer.

## Install Ubuntu Dependencies

The current core MVP uses Xvfb for display isolation, `xdpyinfo` from `x11-utils` to wait for display readiness, `openbox` as an optional lightweight window manager, `scrot` for screenshots, `xdotool` for X11 input, and `wmctrl` for window listing/focus.

On Ubuntu or Debian:

```sh
./scripts/install-ubuntu-deps.sh
```

Or install manually:

```sh
sudo apt update
sudo apt install -y xvfb openbox x11-utils scrot xdotool wmctrl xterm
```

`openbox` is recommended but optional. If it is missing, the session can still start and records a warning in `session.json`.

`xterm` is optional for the harness runtime, but the default `smoke-x11` demo uses it.

The installer script is provided for manual local setup only. It is not run by tests or package scripts.

## Check System

Run:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- doctor
pnpm --filter @agent-desktop-harness/cli dev -- doctor --json
```

The doctor reports:

- Required: `Xvfb`, `xdpyinfo`, `scrot`, `xdotool`, `wmctrl`
- Recommended: `openbox`
- Optional smoke demos: `xterm` and GUI browsers such as Chromium, Google Chrome, or Firefox

If required dependencies are missing, the status is `not_ready`.

## Xvfb Not Installed

The Linux-first runtime requires Xvfb. On many Debian or Ubuntu systems it is provided by the `xvfb` package.

Install it with:

```sh
sudo apt install -y xvfb
```

## Missing scrot

Screenshots require `scrot`.

```sh
sudo apt install -y scrot
```

If it is missing, screenshot actions fail with an explicit dependency error.

## Missing xdotool

Click, double-click, type, hotkey, and scroll actions require `xdotool`.

```sh
sudo apt install -y xdotool
```

Session creation does not require `xdotool`; input actions fail only when requested.

## Missing wmctrl

Window listing and focusing require `wmctrl`.

```sh
sudo apt install -y wmctrl
```

If `wmctrl` is missing, `getWindows`, `focusWindow`, `waitForWindow`, and the default smoke test fail clearly.

## openbox Missing Warning

`openbox` is recommended because it gives X11 apps a lightweight window manager. If it is missing, the core session manager continues when possible and records a warning in `session.json`.

Install it with:

```sh
sudo apt install -y openbox
```

## xterm Missing

`xterm` is optional, but the default smoke demo launches it.

```sh
sudo apt install -y xterm
```

You can pass another GUI command to the smoke command:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- smoke-x11 --command <gui-command>
```

## Missing GUI Browser for Vite or Browser Semantic Smoke

The Vite GUI smokes and browser semantic smoke require a graphical browser inside Xvfb. The doctor checks:

- `chromium`
- `chromium-browser`
- `google-chrome`
- `google-chrome-stable`
- `firefox`

Install one browser, for example:

```sh
sudo apt install -y chromium
```

or:

```sh
sudo apt install -y firefox
```

You can override browser detection:

```sh
AGENT_DESKTOP_HARNESS_BROWSER=/usr/bin/firefox pnpm smoke:vite:http
```

The browser semantic driver uses `playwright-core` with a host browser executable. Chromium and Chrome are the primary MVP targets; Firefox is best-effort.

```sh
AGENT_DESKTOP_HARNESS_BROWSER=/usr/bin/google-chrome pnpm smoke:browser-semantic
```

## Missing Tauri WebDriver Dependencies

The Tauri WebDriver path is experimental and optional. Missing dependencies do not make the general doctor status fail.

Doctor reports:

```text
Experimental Tauri driver dependencies:
  tauri-driver
  WebKitWebDriver
  cargo
```

Install `tauri-driver` with:

```sh
cargo install tauri-driver --locked
```

On Linux, Tauri WebDriver uses `WebKitWebDriver`. Package names vary by distribution. Some Debian-based systems provide it through a package such as `webkit2gtk-driver`, but verify the correct package for the target distro.

On Ubuntu 24.04, this package provides `/usr/bin/WebKitWebDriver`:

```sh
sudo apt-get install -y webkit2gtk-driver
```

If these dependencies are missing, use the documented Tauri X11 fallback workflow:

```sh
pnpm smoke:tauri-driver
```

The smoke reports skipped/unavailable status instead of fake semantic success when prerequisites or app configuration are missing.

If a WebDriver screenshot says `Could not connect to localhost`, the Tauri debug binary probably uses `build.devUrl` and the frontend dev server is not running. Start it with smoke prelaunch options:

```sh
AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_COMMAND="pnpm dev" \
AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_CWD="/path/to/tauri/app" \
AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_WAIT_URL="http://127.0.0.1:1420" \
pnpm smoke:tauri-driver
```

## Electron Semantic Driver Issues

The Electron semantic path is experimental and optional. Missing Electron app configuration does not make the general doctor status fail.

Doctor reports:

```text
Experimental Electron driver:
  playwright electron API
  electron binary
```

The Playwright Electron API is provided by `playwright-core`. An Electron binary can come from a project dependency such as `node_modules/.bin/electron`, a system `electron` command, or an explicit `executablePath`.

The repository includes a minimal sample Electron app. After `pnpm install`, run:

```sh
pnpm smoke:electron-driver
```

If no sample or environment-configured app is available, the smoke reports skipped/unavailable status instead of fake semantic success.

For another Electron app:

```sh
AGENT_DESKTOP_HARNESS_ELECTRON_CWD="/path/to/electron/app" \
AGENT_DESKTOP_HARNESS_ELECTRON_COMMAND="/path/to/node_modules/.bin/electron" \
AGENT_DESKTOP_HARNESS_ELECTRON_ARGS="." \
pnpm smoke:electron-driver
```

Common failure modes:

- The command points to a wrapper script instead of an Electron executable.
- The app expects a different working directory.
- The app opens multiple BrowserWindows and the wrong one is selected.
- Devtools windows are visible; use `excludeDevtools` or `windowTitleIncludes`.
- Packaged apps need a different launch or CDP connection strategy.

## Driver Router Issues

The driver router chooses between semantic drivers and X11 fallback. It does not make missing dependencies available, and it does not make X11 fallback understand DOM selectors.

Check route status:

```sh
curl http://127.0.0.1:7341/drivers/status
```

Run the smoke:

```sh
pnpm smoke:driver-router
```

If `app_open` or `driver_route` fails with `requireSemantic: true`, inspect the selected app kind and the relevant driver status. For Tauri and Electron, experimental dependency or launch limitations can make fallback the only available path.

If `app_click` or `app_fill` fails after fallback was selected, provide `x` and `y` coordinates or use `desktop_click` / `desktop_type_text` directly. X11 fallback currently cannot use `role`, `label`, `placeholder`, `testId`, or CSS selectors.

`app_assert_text` is unsupported with `x11-fallback` because there is no OCR layer yet. Capture a screenshot and inspect evidence instead.

## Visual QA Issues

Visual QA compares PNG evidence files from a session. It does not read arbitrary files outside the session evidence directory.

Run the smoke:

```sh
pnpm smoke:visual-qa
pnpm smoke:visual-baseline
```

Common failure modes:

- `beforePath` or `afterPath` points outside the session evidence directory.
- One path is not a PNG.
- The two PNGs have different dimensions. The MVP does not resize images.
- A full-image comparison is noisy because of animations, cursor blinking, timestamps, browser chrome, or unrelated UI changes.
- `visual_assert_changed` uses a `minDiffPixelRatio` that is too high for the selected region.
- `visual_assert_similar` uses a `maxDiffPixelRatio` that is too low for antialiasing or minor rendering differences.
- Baseline names or suite names contain unsupported path characters. They are sanitized before storage.
- A baseline comparison uses a screenshot from a different viewport size than the saved baseline.
- `visual_assert_change_contained` fails because legitimate app changes also occurred outside the allowed rectangles.

Prefer region or annotation-derived comparison when a human annotation identifies the area that should change. Use a loose informational containment threshold when page-level state changes outside the repair area are expected. Diff PNGs are written under `visual-diffs/`, local baselines are written under `.desktop-harness/baselines/`, and result summaries are written to `visual-assertions.jsonl` and `report.md`.

## Live Observer Issues

The live observer is optional. It requires `x11vnc` plus either `novnc_proxy` or `websockify` with a noVNC web root.

Install on Ubuntu:

```sh
sudo apt install -y x11vnc novnc websockify
```

Or:

```sh
./scripts/install-ubuntu-deps.sh --with-observer
```

Check status:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- observer-status
pnpm smoke:observer
```

Common failure modes:

- `x11vnc is missing`: install `x11vnc`.
- `novnc_proxy or websockify is missing`: install `novnc` and `websockify`.
- `noVNC web root was not found`: install the noVNC package or set `AGENT_DESKTOP_HARNESS_NOVNC_WEB_ROOT` to a directory containing `vnc.html`.
- Port already in use: omit explicit ports, or choose free `vncPort` and `webPort` values.
- Black screen: confirm the session is running and the target app has opened a window on the harness display.
- Remote viewing: keep the observer bound to `127.0.0.1` and use SSH tunneling.

Example tunnel:

```sh
ssh -L 6081:127.0.0.1:6081 user@host
```

The observer smoke skips clearly when dependencies are unavailable. It should not be treated as part of the required Xvfb runtime.

## Port Already In Use

HTTP, Vite, noVNC, WebDriver, Tauri, and Electron smokes all use local ports. Most smoke commands allocate or probe ports automatically, but failures can still happen after interrupted runs or when another local service is using the same port.

Use a different port when the smoke supports it, stop the conflicting local process, or rerun after cleanup. For observer routes, omit explicit `vncPort` and `webPort` values unless you need fixed ports.

## Screenshots Are Blank

Likely causes may include:

- The app did not launch.
- The app launched on a different display.
- The window manager is missing or not ready.
- The screenshot backend captured before the first paint.

Check `actions.jsonl`, `session.json`, and the app process id in the smoke command output. For the default smoke test, `wmctrl` should list at least one window before the first screenshot is captured.

## Input Does Not Affect the App

Likely causes may include:

- The app window is not focused.
- The input backend is attached to the wrong display.
- Coordinates do not match the captured screenshot.
- The app is blocked on startup or a modal dialog.
- `xdotool` is not installed.

## Window List Is Empty

Likely causes may include:

- The app has not opened a top-level window yet.
- The app exited immediately.
- The app was launched on the wrong display.
- `openbox` is missing and the app depends on window-manager behavior.

The smoke command waits briefly for windows to appear and fails if none are found.

Tauri and Electron dev modes can create devtools or inspector windows. Use `excludeDevtools: true` and `preferLargest: true` with `waitForWindow` when the main window title is ambiguous.

## Leftover Process Cleanup

`stopSession` terminates live observers, launched app processes, the window manager process, and the Xvfb process, then releases the display number. The `smoke-x11` command calls cleanup in a `finally` block.

If a process remains after an interrupted run, inspect active Xvfb processes:

```sh
pgrep -a Xvfb
```

Only terminate processes you know belong to a stopped harness session.

## Evidence Contains Sensitive Data

Screenshots and logs may contain secrets or private data. Treat evidence directories as sensitive. `typeText` supports a `secret` flag for redacting typed text, but broader evidence redaction is still planned.

## Manual Smoke Test

Run:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- start-session --screenshot --once
```

Expected behavior:

- A session starts on an allocated display such as `:90`.
- Evidence is written under `.desktop-harness/sessions/<sessionId>/`.
- A PNG screenshot appears in the session `screenshots/` directory.
- The session is stopped and child processes are cleaned up before the command exits.

For an input/window smoke test:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- smoke-x11
```

Expected behavior:

- The doctor preflight reports all required dependencies present.
- Xvfb starts on an allocated display.
- `xterm` launches inside the session.
- A screenshot labeled `smoke-initial` is captured.
- Windows are listed with `wmctrl`.
- The target window is focused.
- `xdotool` clicks and types text into the session.
- A screenshot labeled `smoke-after-type` is captured.
- `waitForStableScreen` captures stable-check screenshots and may move intermediate checks into `transient/`.
- The session is stopped and evidence is written.

Expected artifact layout:

```text
.desktop-harness/
  sessions/
    <sessionId>/
      session.json
      actions.jsonl
      report.md
      screenshots/
        0001-smoke-initial.png
        0002-smoke-after-type.png
      transient/
        0003-smoke-stable-0001.png
```

## HTTP and MCP Smoke Tests

Run the interface integration smokes after the doctor reports `ready`:

```sh
pnpm smoke:http
pnpm smoke:mcp
pnpm smoke:vite:http
pnpm smoke:vite:mcp
pnpm smoke:annotation-repair
pnpm smoke:browser-semantic
pnpm smoke:tauri-driver
pnpm smoke:electron-driver
pnpm smoke:driver-router
pnpm smoke:visual-qa
pnpm smoke:visual-baseline
pnpm smoke:observer
```

`smoke:http` starts the HTTP server on `127.0.0.1:7352`, creates a session through HTTP, launches `xterm`, performs screenshot/input/window actions through HTTP routes, deletes the session, and stops the server.

`smoke:mcp` starts the MCP stdio server, sends a minimal JSON-RPC MCP client flow, calls the desktop tools, stops the session, and stops the server.

If a smoke command fails:

- Run `pnpm --filter @agent-desktop-harness/cli dev -- doctor`.
- Check that the port `7352` is free for HTTP smoke, or pass `--port`.
- Check that MCP server logs go to stderr, not stdout.
- Inspect the printed evidence path and `actions.jsonl`.
- Confirm no orphan processes remain with `pgrep -a Xvfb`, `pgrep -a openbox`, and `pgrep -a xterm`.
- For Vite smokes, confirm no browser process remains, for example with `pgrep -a chromium` or `pgrep -a firefox`.
- For browser semantic smoke, confirm the host browser is Playwright-compatible and can run under Xvfb. Try Chromium or Google Chrome first.
- For Tauri driver smoke, inspect the status block. If it is skipped, install `tauri-driver` and `WebKitWebDriver`, or set `AGENT_DESKTOP_HARNESS_TAURI_COMMAND` and `AGENT_DESKTOP_HARNESS_TAURI_CWD` for a local Tauri app.
- For driver router smoke, confirm the sample Vite app and browser semantic route still work. The router smoke requires a host browser and expects `selectedDriver` to be `browser-playwright`.
- For visual QA smokes, inspect `visual-assertions.jsonl`, `visual-diffs/`, and `.desktop-harness/baselines/`.
- For observer smoke, inspect the observer status block. Missing observer packages should produce a skipped result, not a fake pass.
- For annotation repair smoke, inspect `visual-handoff.md`, `annotations.jsonl`, and the before/after screenshots in the printed evidence path.

Expected Vite smoke artifact layout:

```text
.desktop-harness/
  sessions/
    <sessionId>/
      session.json
      actions.jsonl
      report.md
      screenshots/
        0001-vite-http-initial.png
        0002-vite-http-after-save.png
        0003-vite-http-details-open.png
```

Expected browser semantic smoke artifact layout:

```text
.desktop-harness/
  sessions/
    <sessionId>/
      session.json
      actions.jsonl
      report.md
      screenshots/
        0001-browser-semantic-initial.png
        0002-browser-semantic-details-open.png
```

Browser semantic screenshots are page-content screenshots captured by Playwright. Desktop screenshots are X11 root-window screenshots captured by the desktop screenshot backend.

## Visual Annotation Handoff

Start the HTTP server and open the annotation URL for a session:

```sh
pnpm --filter @agent-desktop-harness/http-server dev
pnpm --filter @agent-desktop-harness/cli dev -- annotate-url --session <sessionId>
```

Expected annotation artifact layout:

```text
.desktop-harness/
  sessions/
    <sessionId>/
      screenshots/
        0003-game-bug.png
      annotations/
        ann_001-crop.png
      annotations.jsonl
      visual-handoff.md
```

If screenshots do not appear in the annotation UI:

- Confirm the session id belongs to the running HTTP server process.
- Call `GET /sessions/<sessionId>/screenshots`.
- Confirm PNG files exist in the session `screenshots/` directory.

If saving an annotation fails:

- Confirm the screenshot file name is only a PNG file name, not a path.
- Confirm rectangle width and height are positive.
- Check the HTTP response JSON for the validation error.
- Inspect `annotations.jsonl` and `visual-handoff.md` in the evidence directory.
