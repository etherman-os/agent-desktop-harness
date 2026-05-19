# Driver Router

The driver router is the orchestration layer that decides how an agent should interact with a target app. It prefers semantic drivers when available and falls back to X11 screenshot/input tools when necessary.

The router does not replace the driver-specific APIs. Browser, Tauri, Electron, and desktop tools remain available for advanced workflows and debugging. The high-level app APIs provide a consistent first choice for agents that should not need to manually pick a driver for every action.

Live observer support is separate from driver selection. A session can be watched through the optional noVNC observer while the router chooses browser, Tauri, Electron, or X11 actions.

For the end-to-end workflow that uses the router with screenshots, annotation, Visual QA, and the optional live observer, see [Agent GUI QA Cockpit](AGENT_GUI_QA_COCKPIT.md).

## Driver Choices

The router can choose:

- `browser-playwright` for web apps opened in a Playwright-controlled browser inside Xvfb.
- `tauri-webdriver` for Tauri apps when the experimental `tauri-driver` WebDriver path is available.
- `electron-playwright` for Electron apps when the experimental Playwright Electron path is available.
- `x11-fallback` for native apps, unknown apps, unavailable semantic drivers, and visual evidence workflows.

## Decision Order

1. Use an explicit `preferredDriver` when provided and compatible.
2. Use `appKind`:
   - `browser` selects `browser-playwright`.
   - `electron` selects `electron-playwright` when available.
   - `tauri` selects `tauri-webdriver` when available.
   - `native` and `unknown` select `x11-fallback`.
3. Check capability status and dependency readiness.
4. If semantic mode is unavailable and `allowFallback` is true or omitted, select `x11-fallback` with a fallback reason.
5. If `requireSemantic` is true and no semantic driver is available, fail clearly.

The router never silently claims semantic success when fallback was used. Route decisions and app action results include `selectedDriver`, `semantic`, `fallbackUsed`, `fallbackReason` when applicable, and warnings.

## HTTP Workflow

Check status:

```bash
curl http://127.0.0.1:7341/drivers/status
```

Open a browser app with semantic mode required:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/apps/open \
  -H "Content-Type: application/json" \
  -d '{
    "appKind": "browser",
    "url": "http://127.0.0.1:5179",
    "browserExecutablePath": "/usr/bin/google-chrome",
    "requireSemantic": true
  }'
```

Interact through the routed app:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/apps/fill \
  -H "Content-Type: application/json" \
  -d '{
    "placeholder": "Type a message",
    "value": "hello from driver router"
  }'

curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/apps/click \
  -H "Content-Type: application/json" \
  -d '{
    "role": "button",
    "name": "Save message"
  }'

curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/apps/assert-text \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Status: saved",
    "timeoutMs": 5000
  }'
```

Capture evidence:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/apps/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "label": "after-routed-action",
    "fullPage": false
  }'
```

After capturing before/after routed screenshots, use Visual QA routes to measure pixel changes, compare baselines, or create diff PNG evidence:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/compare \
  -H "Content-Type: application/json" \
  -d '{
    "beforePath": "screenshots/0001-before.png",
    "afterPath": "screenshots/0002-after.png",
    "label": "routed-before-after",
    "createDiffImage": true
  }'
```

## MCP Workflow

Prefer the high-level MCP tools for routine app workflows:

1. `desktop_start_session`
2. `driver_get_status`
3. `app_open`
4. `app_fill`
5. `app_click`
6. `app_assert_text`
7. `app_screenshot`
8. `app_close`
9. `desktop_stop_session`

Driver-specific tools such as `browser_click`, `tauri_click`, and `electron_click` remain useful when an agent needs to bypass routing or inspect a driver-specific failure.

## X11 Fallback Behavior

The X11 fallback remains an escape hatch, not a semantic driver. It can click coordinates, type into the focused window, press keys, and capture root-window screenshots. It cannot resolve DOM selectors or assert text without OCR. X11 fallback currently has no OCR-backed text assertion.

If the router selects `x11-fallback` and an action only provides semantic targets such as `role` or `placeholder`, the action fails clearly. Provide `x` and `y` coordinates for fallback clicks and fills.

## Smoke Test

Run the router smoke against the sample Vite app:

```bash
pnpm smoke:driver-router
```

The smoke opens the sample app with `appKind: "browser"` and `requireSemantic: true`, verifies `browser-playwright` selection, fills and clicks by semantic targets, asserts visible text, captures screenshots, and cleans up the app, session, HTTP server, Vite server, and Xvfb resources.

For before/after visual proof on top of routed actions, run:

```bash
pnpm smoke:visual-qa
pnpm smoke:visual-baseline
```

See [Visual QA Assertions](VISUAL_QA_ASSERTIONS.md) and [Visual Baselines](VISUAL_BASELINES.md) for diff artifacts, region comparison, baselines, annotation-region checks, and assertion thresholds.

## Current Limitations

- Tauri and Electron semantic drivers are experimental.
- The router does not install missing browsers, `tauri-driver`, `WebKitWebDriver`, or Electron binaries.
- Packaged Electron app support is limited.
- `x11-fallback` has no OCR-backed text assertion.
- The router tracks app refs in memory for the current process; durable app restoration is not implemented.
