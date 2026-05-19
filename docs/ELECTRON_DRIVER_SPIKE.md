# Electron Driver Spike

## Status

Experimental.

This spike adds a Playwright Electron semantic path for development-mode Electron apps while keeping the existing X11 desktop fallback available. It does not claim production-grade packaged Electron support yet.

## What It Does

The Electron driver launches Electron inside the same isolated Xvfb session that the rest of the harness uses. When Playwright's Electron API can launch the app, renderer windows can be controlled with semantic actions:

- click by selector, test id, role/name, label, placeholder, or text
- fill by selector, test id, role/name, label, placeholder, or text
- press keys on a target or the page
- assert visible text
- capture renderer screenshots into the session evidence directory

The core still owns session lifecycle, policy checks, evidence, cleanup, HTTP routes, MCP tools, and X11 fallback actions.

## Modes

### X11 Fallback Mode

X11 fallback launches and observes the app as a normal native window. It uses `desktop_*` tools such as `desktop_wait_for_window`, `desktop_screenshot`, `desktop_click`, and `desktop_type_text`.

Use fallback when:

- the app is packaged in a way Playwright Electron cannot launch directly
- the app command starts a wrapper process that hides the real Electron executable
- semantic renderer access fails
- you need root-window screenshots or visual annotation evidence

### Playwright Electron Semantic Mode

The semantic mode uses Playwright's Electron API to launch a development-mode Electron app and access renderer pages. This is the preferred path for Electron apps that can be started with an Electron executable plus app path or arguments.

Example:

```json
{
  "command": "/path/to/node_modules/.bin/electron",
  "args": ["."],
  "cwd": "/path/to/electron/app",
  "windowTitleIncludes": "My App",
  "excludeDevtools": true
}
```

## How It Differs From Browser Semantic Driver

The browser semantic driver launches a normal browser page and controls web content through Playwright page locators.

The Electron driver launches an Electron application and then controls renderer windows through Playwright pages returned by the Electron application. It is meant for Electron app development workflows, not general web URLs.

## How It Differs From Tauri WebDriver

Tauri semantic support uses `tauri-driver` and the platform WebDriver backend. Electron semantic support uses Playwright Electron APIs against Chromium renderer windows. The prerequisites and failure modes are different, so both drivers remain separate experimental paths.

## HTTP Routes

```text
GET  /electron/status
POST /sessions/:sessionId/electron/open
POST /sessions/:sessionId/electron/click
POST /sessions/:sessionId/electron/fill
POST /sessions/:sessionId/electron/press
POST /sessions/:sessionId/electron/assert-text
POST /sessions/:sessionId/electron/screenshot
POST /sessions/:sessionId/electron/close
```

Open:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/electron/open \
  -H "Content-Type: application/json" \
  -d '{
    "command": "/path/to/node_modules/.bin/electron",
    "args": ["."],
    "cwd": "/path/to/electron/app",
    "windowTitleIncludes": "My App",
    "excludeDevtools": true
  }'
```

Fill and click:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/electron/fill \
  -H "Content-Type: application/json" \
  -d '{
    "placeholder": "Type a message",
    "value": "hello from electron semantic driver"
  }'

curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/electron/click \
  -H "Content-Type: application/json" \
  -d '{
    "role": "button",
    "name": "Save message"
  }'
```

Assert text:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/electron/assert-text \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Status: saved",
    "timeoutMs": 5000
  }'
```

## MCP Tools

```text
electron_get_status
electron_open
electron_click
electron_fill
electron_press
electron_assert_text
electron_screenshot
electron_close
```

These tools are experimental. If an app opens in `x11-fallback` mode, use the `desktop_*` tools for interaction and screenshots.

## Smoke Test

The repository includes a minimal sample Electron app:

```text
examples/sample-electron-app/
```

Run:

```sh
pnpm smoke:electron-driver
```

On a prepared Ubuntu machine with the sample dependency installed, this smoke verifies `mode: "playwright-electron"` and semantic assertions without coordinate clicking.

If the sample app dependency is installed, the smoke:

1. Starts an isolated Xvfb session.
2. Opens the sample app through the Electron semantic driver.
3. Captures an initial renderer screenshot.
4. Fills the message input by placeholder.
5. Clicks buttons by role/name.
6. Asserts text in the renderer.
7. Captures a final renderer screenshot.
8. Closes the Electron app and stops the session.

To use another Electron app:

```sh
AGENT_DESKTOP_HARNESS_ELECTRON_CWD="/path/to/electron/app" \
AGENT_DESKTOP_HARNESS_ELECTRON_COMMAND="/path/to/electron" \
AGENT_DESKTOP_HARNESS_ELECTRON_ARGS="." \
pnpm smoke:electron-driver
```

## Known Risks

- Packaged Electron apps may require a different launch or CDP connection approach.
- Some project scripts launch wrapper processes that are not the Electron executable.
- Multiple BrowserWindows can require better window selection.
- Devtools windows can be selected accidentally unless `excludeDevtools` or `windowTitleIncludes` is used.
- Preload and security settings can change what the renderer exposes.
- Renderer screenshots are page-content screenshots. Use `desktop_screenshot` for root-window evidence.
- Secrets passed to `electron_fill` can be redacted from logs with `secret: true`, but screenshots may still show visible secret text.
