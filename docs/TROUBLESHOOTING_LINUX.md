# Troubleshooting Linux

This page covers the Linux dependencies and failure modes for the core Xvfb session manager MVP.

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

The v0.1 runtime requires Xvfb. On many Debian or Ubuntu systems it is provided by the `xvfb` package.

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

If `wmctrl` is missing, `getWindows`, `focusWindow`, and the default smoke test fail clearly.

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

## Missing GUI Browser for Vite Smoke

The Vite GUI smokes require a graphical browser inside Xvfb. The doctor checks:

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

## Orphan Xvfb Process Cleanup

`stopSession` terminates launched app processes, the window manager process, and the Xvfb process, then releases the display number. The `smoke-x11` command calls cleanup in a `finally` block.

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
- `waitForStableScreen` captures additional evidence screenshots.
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
```

## HTTP and MCP Smoke Tests

Run the interface integration smokes after the doctor reports `ready`:

```sh
pnpm smoke:http
pnpm smoke:mcp
pnpm smoke:vite:http
pnpm smoke:vite:mcp
pnpm smoke:annotation-repair
```

`smoke:http` starts the HTTP server on `127.0.0.1:7352`, creates a session through HTTP, launches `xterm`, performs screenshot/input/window actions through HTTP routes, deletes the session, and stops the server.

`smoke:mcp` starts the MCP stdio server, sends a minimal JSON-RPC MCP client flow, calls the desktop tools, stops the session, and stops the server.

If either command fails:

- Run `pnpm --filter @agent-desktop-harness/cli dev -- doctor`.
- Check that the port `7352` is free for HTTP smoke, or pass `--port`.
- Check that MCP server logs go to stderr, not stdout.
- Inspect the printed evidence path and `actions.jsonl`.
- Confirm no orphan processes remain with `pgrep -a Xvfb`, `pgrep -a openbox`, and `pgrep -a xterm`.
- For Vite smokes, confirm no browser process remains, for example with `pgrep -a chromium` or `pgrep -a firefox`.
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
