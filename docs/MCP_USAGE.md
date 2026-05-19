# MCP Usage

The MCP stdio server is implemented in `@agent-desktop-harness/mcp-server`. It exposes the core desktop harness APIs as MCP tools while keeping all session lifecycle, policy, screenshot, input, window, and cleanup behavior in `@agent-desktop-harness/core`.

Browser semantic tools are also exposed through MCP. They use Playwright inside the isolated Xvfb session for web content while the desktop tools remain available for screenshots, native windows, and X11 fallback actions. Experimental Tauri and Electron tools expose their semantic paths when available. The high-level router tools choose between these drivers and X11 fallback while reporting the selected mode explicitly. Optional observer tools can start a local noVNC view for humans watching the isolated session.

For a complete agent GUI QA workflow, see [Agent GUI QA Cockpit](AGENT_GUI_QA_COCKPIT.md).

The server writes MCP protocol messages to stdout. Startup and error logs go to stderr.

## Build

```sh
pnpm --filter @agent-desktop-harness/mcp-server build
```

## Claude Code Stdio Example

Use an absolute path to the built server:

```sh
claude mcp add --transport stdio desktop-harness -- \
  node /absolute/path/to/agent-desktop-harness/packages/mcp-server/dist/index.js
```

For local development:

```sh
pnpm --filter @agent-desktop-harness/mcp-server dev
```

For MCP clients, prefer `node packages/mcp-server/dist/index.js` after building so package-manager output cannot interfere with stdio protocol traffic.

## Example Prompt

```txt
Use the desktop-harness MCP tools to start an isolated Linux desktop session, launch this app, take a screenshot, click the main button, take another screenshot, save evidence, and stop the session. Do not use the real desktop.
```

## Tool Workflow

1. `desktop_start_session`
2. `desktop_launch_app`
3. `desktop_wait_for_window`
4. `desktop_wait_for_stable_screen`
5. `desktop_screenshot`
6. `desktop_click`
7. `desktop_screenshot`
8. `desktop_stop_session`

## Tools

- `desktop_start_session`
- `desktop_list_sessions`
- `desktop_get_session`
- `desktop_launch_app`
- `desktop_screenshot`
- `desktop_click`
- `desktop_double_click`
- `desktop_type_text`
- `desktop_hotkey`
- `desktop_scroll`
- `desktop_get_windows`
- `desktop_focus_window`
- `desktop_wait_for_window`
- `desktop_wait_for_stable_screen`
- `desktop_stop_session`
- `desktop_get_evidence_report`
- `desktop_list_screenshots`
- `desktop_create_annotation`
- `desktop_list_annotations`
- `desktop_get_visual_handoff`
- `browser_open`
- `browser_click`
- `browser_fill`
- `browser_press`
- `browser_assert_text`
- `browser_screenshot`
- `browser_close`
- `tauri_get_status`
- `tauri_open`
- `tauri_click`
- `tauri_fill`
- `tauri_assert_text`
- `tauri_screenshot`
- `tauri_close`
- `electron_get_status`
- `electron_open`
- `electron_click`
- `electron_fill`
- `electron_press`
- `electron_assert_text`
- `electron_screenshot`
- `electron_close`
- `driver_get_status`
- `driver_route`
- `app_open`
- `app_click`
- `app_fill`
- `app_press`
- `app_assert_text`
- `app_screenshot`
- `app_close`
- `visual_compare`
- `visual_assert_changed`
- `visual_assert_similar`
- `visual_save_baseline`
- `visual_list_baselines`
- `visual_compare_baseline`
- `visual_assert_annotation_changed`
- `visual_assert_annotation_similar`
- `visual_assert_change_contained`
- `visual_list_assertions`

## Example Tool Inputs

Start a session:

```json
{
  "name": "local-app-check",
  "width": 1440,
  "height": 900,
  "depth": 24,
  "workspaceDir": "/path/to/project",
  "policy": {
    "allowedCommands": ["npm", "node", "xterm"],
    "allowUnlistedCommandsForLocalDevelopment": false
  }
}
```

Launch an app:

```json
{
  "sessionId": "session-id",
  "command": "npm",
  "args": ["run", "dev"],
  "cwd": "/path/to/project"
}
```

Capture a screenshot:

```json
{
  "sessionId": "session-id",
  "label": "after-launch"
}
```

Click:

```json
{
  "sessionId": "session-id",
  "x": 100,
  "y": 200,
  "button": "left",
  "label": "main-button"
}
```

Type text:

```json
{
  "sessionId": "session-id",
  "text": "hello",
  "secret": false
}
```

For secrets, set `secret: true`. The MCP response and `actions.jsonl` contain only a redacted marker and text length.

Focus a window:

```json
{
  "sessionId": "session-id",
  "titleIncludes": "Terminal"
}
```

Open a browser page inside the session:

```json
{
  "sessionId": "session-id",
  "url": "http://127.0.0.1:5179",
  "browserExecutablePath": "/usr/bin/google-chrome",
  "viewport": {
    "width": 1440,
    "height": 900
  }
}
```

Fill and click by semantic browser targets:

```json
{
  "sessionId": "session-id",
  "placeholder": "Type a message",
  "value": "hello from semantic browser driver"
}
```

```json
{
  "sessionId": "session-id",
  "role": "button",
  "name": "Save message"
}
```

Assert browser text:

```json
{
  "sessionId": "session-id",
  "text": "Status: saved",
  "timeoutMs": 5000
}
```

## Required Ubuntu Packages

Use the helper script:

```sh
./scripts/install-ubuntu-deps.sh
```

Or install manually:

```sh
sudo apt update
sudo apt install -y xvfb openbox x11-utils scrot xdotool wmctrl xterm
```

Check the system before a real GUI run:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- doctor
```

## Manual MCP Inspector Smoke Test

After building:

```sh
npx @modelcontextprotocol/inspector \
  node packages/mcp-server/dist/index.js
```

Use the Inspector to call `desktop_start_session`, then `desktop_stop_session`. A full GUI smoke test requires the Linux packages above. For low-level local verification before connecting an MCP client, run:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- smoke-x11
```

## Real MCP Smoke Test

Run the automated local MCP smoke workflow:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- smoke-mcp
```

Or from the root package scripts:

```sh
pnpm smoke:mcp
```

The command:

1. Runs the dependency doctor.
2. Builds and starts the MCP stdio server with `node packages/mcp-server/dist/index.js`.
3. Sends `initialize` and `tools/list` over stdio JSON-RPC.
4. Calls the desktop tools to start a session, launch `xterm`, wait for a stable screen, capture screenshots, focus the window, click, type text, capture another screenshot, and stop the session.
5. Stops the MCP server process.

Expected successful output is JSON containing:

```json
{
  "sessionId": "...",
  "evidencePath": ".desktop-harness/sessions/...",
  "screenshots": ["...", "..."],
  "cleanupSucceeded": true,
  "stopped": true,
  "serverStopped": true
}
```

## MCP Smoke Troubleshooting

- MCP server stdout pollution: stdout must contain only newline-delimited JSON-RPC messages. Startup logs must go to stderr.
- Initialize failure: run `pnpm --filter @agent-desktop-harness/mcp-server build` and inspect stderr from `smoke-mcp`.
- Empty `tools/list`: verify `packages/mcp-server/src/server.ts` registers the desktop tools.
- Tool call timeout: check for a blocked Xvfb dependency, app startup failure, or a process that did not paint a window.
- Missing Xvfb/scrot/xdotool/wmctrl/xterm: run `pnpm --filter @agent-desktop-harness/cli dev -- doctor` and install missing packages.

## Vite MCP GUI QA Demo

Run:

```sh
pnpm smoke:vite:mcp
```

The command starts `examples/sample-vite-app`, starts the MCP stdio server, launches a GUI browser inside Xvfb through `desktop_launch_app`, then drives the app through MCP tools:

1. `desktop_start_session`
2. `desktop_launch_app`
3. `desktop_screenshot` with `vite-mcp-initial`
4. `desktop_click` and `desktop_type_text`
5. `desktop_screenshot` with `vite-mcp-after-save`
6. `desktop_click`
7. `desktop_screenshot` with `vite-mcp-details-open`
8. `desktop_stop_session`

This remains an X11 fallback demo. For semantic web interactions, use the `browser_*` tools or run `pnpm smoke:browser-semantic`.

Browser override:

```sh
AGENT_DESKTOP_HARNESS_BROWSER=/usr/bin/firefox pnpm smoke:vite:mcp
```

## Driver Router MCP Workflow

Use the high-level router tools when an agent should choose the best available path from app kind and capability status:

1. `desktop_start_session`
2. `driver_get_status`
3. `app_open`
4. `app_fill`
5. `app_click`
6. `app_assert_text`
7. `app_screenshot`
8. `app_close`
9. `desktop_stop_session`

Example browser app open:

```json
{
  "sessionId": "session-id",
  "appKind": "browser",
  "url": "http://127.0.0.1:5179",
  "browserExecutablePath": "/usr/bin/google-chrome",
  "requireSemantic": true
}
```

Example routed action:

```json
{
  "sessionId": "session-id",
  "role": "button",
  "name": "Save message"
}
```

Router responses include `selectedDriver`, `semantic`, `fallbackUsed`, and warnings. If the router selects `x11-fallback`, semantic selectors are not interpreted; provide `x` and `y` for fallback clicks or use the `desktop_*` tools directly.

Run the router smoke from the root package:

```sh
pnpm smoke:driver-router
```

See [Driver Router](DRIVER_ROUTER.md) for HTTP examples, decision rules, and limitations.

## Visual QA MCP Workflow

Use Visual QA tools after a workflow has produced before/after PNG evidence:

1. Capture or produce a before screenshot.
2. Perform the app action or repair.
3. Capture or produce an after screenshot.
4. Call `visual_compare` when metrics and a diff PNG are enough.
5. Call `visual_assert_changed` when an area must visibly change.
6. Call `visual_assert_similar` when screenshots should remain within a tolerated threshold.
7. Call `visual_save_baseline` and `visual_compare_baseline` when a named local reference should be reused.
8. Call `visual_assert_annotation_changed` when a rectangle annotation defines the expected change area.
9. Call `visual_assert_change_contained` when changes should stay inside known rectangles.
10. Call `visual_list_assertions` to inspect recorded results.

Example compare:

```json
{
  "sessionId": "session-id",
  "beforePath": "screenshots/0001-before.png",
  "afterPath": "screenshots/0002-after.png",
  "label": "before-after",
  "createDiffImage": true
}
```

Example region assertion:

```json
{
  "sessionId": "session-id",
  "beforePath": "screenshots/0001-before.png",
  "afterPath": "screenshots/0002-after.png",
  "region": { "x": 620, "y": 240, "width": 180, "height": 100 },
  "minDiffPixelRatio": 0.01
}
```

Example baseline comparison:

```json
{
  "sessionId": "session-id",
  "screenshotPath": "screenshots/0002-current.png",
  "baselineName": "sample-vite-clean",
  "suite": "smoke",
  "createDiffImage": true
}
```

Example annotation-driven assertion:

```json
{
  "sessionId": "session-id",
  "annotationId": "ann_001",
  "afterPath": "screenshots/0002-after.png",
  "padding": 4,
  "minDiffPixelRatio": 0.01
}
```

MCP returns paths and metrics. It does not stream binary diff images.

See [Visual QA Assertions](VISUAL_QA_ASSERTIONS.md) and [Visual Baselines](VISUAL_BASELINES.md) for HTTP routes, artifact layout, threshold behavior, and limitations.

## Live Observer MCP Workflow

Use the observer tools when a human should watch an isolated session through a local browser:

1. Call `observer_get_status`.
2. If available, call `observer_start` with a running `sessionId`.
3. Open the returned `url` in a local browser.
4. Call `observer_stop`, or stop the session.

Example `observer_start` input:

```json
{
  "sessionId": "session-id",
  "viewOnly": true,
  "label": "debug-view"
}
```

Tools:

- `observer_get_status`
- `observer_start`
- `observer_list`
- `observer_stop`

The observer binds to `127.0.0.1` by default and is optional. MCP returns URL metadata only; it does not stream VNC frames or binary image data.

Run:

```sh
pnpm smoke:observer
```

See [Live Observer](LIVE_OBSERVER.md) for install commands, HTTP routes, security notes, and troubleshooting.

## Browser Semantic MCP Workflow

For web apps, prefer the browser semantic tools after starting the isolated session and the app server:

1. `desktop_start_session`
2. `browser_open`
3. `browser_screenshot`
4. `browser_fill`
5. `browser_click`
6. `browser_assert_text`
7. `browser_screenshot`
8. `desktop_stop_session`

Semantic browser screenshots are page-content screenshots captured by Playwright. `desktop_screenshot` remains the X11 root-window screenshot.

Set `secret: true` on `browser_fill` to redact the filled value from responses and `actions.jsonl`. Screenshots may still show visible secrets if the app renders them.

Run the HTTP semantic browser smoke from the root package:

```sh
pnpm smoke:browser-semantic
```

See [Browser Semantic Driver](BROWSER_SEMANTIC_DRIVER.md) for selector priority, HTTP examples, limitations, and troubleshooting notes.

## Experimental Tauri MCP Workflow

The Tauri tools are experimental. They try `tauri-driver` / WebDriver when prerequisites and a built app binary are available, and otherwise return explicit X11 fallback guidance.

1. `tauri_get_status`
2. `desktop_start_session`
3. `tauri_open`
4. `tauri_screenshot`
5. Use `tauri_click`, `tauri_fill`, or `tauri_assert_text` only when the returned mode is `webdriver`.
6. Use `desktop_wait_for_window`, `desktop_screenshot`, and desktop input tools when the returned mode is `x11-fallback`.
7. `desktop_stop_session`

Example status call:

```json
{}
```

Example open call for fallback/dev mode:

```json
{
  "sessionId": "session-id",
  "command": "pnpm",
  "args": ["tauri", "dev"],
  "cwd": "/path/to/tauri/app",
  "windowTitleIncludes": "My App"
}
```

Example open call with a built app binary for WebDriver:

```json
{
  "sessionId": "session-id",
  "command": "pnpm",
  "args": ["tauri", "dev"],
  "cwd": "/path/to/tauri/app",
  "applicationPath": "/path/to/tauri/app/src-tauri/target/debug/app"
}
```

See [Tauri Driver Spike](TAURI_DRIVER_SPIKE.md) for prerequisites and known failure modes.

## Experimental Electron MCP Workflow

The Electron tools are experimental. They use Playwright Electron when the app can be launched with an Electron executable and app path or arguments. If semantic mode is unavailable, keep using the `desktop_*` tools.

1. `electron_get_status`
2. `desktop_start_session`
3. `electron_open`
4. `electron_screenshot`
5. Use `electron_fill`, `electron_click`, `electron_press`, or `electron_assert_text` when the returned mode is `playwright-electron`.
6. Use `desktop_wait_for_window`, `desktop_screenshot`, and desktop input tools if the app needs fallback handling.
7. `desktop_stop_session`

Example open call:

```json
{
  "sessionId": "session-id",
  "command": "/path/to/node_modules/.bin/electron",
  "args": ["."],
  "cwd": "/path/to/electron/app",
  "windowTitleIncludes": "My App",
  "excludeDevtools": true
}
```

Example semantic actions:

```json
{
  "sessionId": "session-id",
  "placeholder": "Type a message",
  "value": "hello from electron semantic driver"
}
```

```json
{
  "sessionId": "session-id",
  "role": "button",
  "name": "Save message"
}
```

See [Electron Driver Spike](ELECTRON_DRIVER_SPIKE.md) for sample app smoke usage and known limitations.

## Visual Annotation Handoff Tools

MCP clients can read screenshot lists, create annotation records, and read `visual-handoff.md`. MCP returns paths and markdown text; it does not stream binary image data in the current MVP.

List screenshots with `desktop_list_screenshots`:

```json
{
  "sessionId": "..."
}
```

Create a rectangle annotation with `desktop_create_annotation`:

```json
{
  "sessionId": "...",
  "screenshotFileName": "0003-game-bug.png",
  "type": "rectangle",
  "x": 618,
  "y": 244,
  "width": 188,
  "height": 96,
  "note": "The player sprite clips into the platform here.",
  "color": "#ff0000"
}
```

Read the handoff with `desktop_get_visual_handoff`:

```json
{
  "sessionId": "..."
}
```

For human drawing, use the HTTP annotation UI:

```text
http://127.0.0.1:7341/sessions/<sessionId>/annotate
```

For an annotation-driven repair task, give the agent:

```text
docs/prompts/ANNOTATION_REPAIR_AGENT_PROMPT.md
```

The synthetic repair demo can be run locally with:

```sh
pnpm smoke:annotation-repair
```

That demo uses HTTP for the synthetic annotation path. MCP clients can perform the same handoff read step with `desktop_get_visual_handoff`.

## Security Notes

- The MCP server does not expose arbitrary shell execution.
- App launch uses structured `{ command, args, cwd, env }` input and core launches with `shell: false`.
- Command allowlisting is enforced by the core policy layer.
- The harness targets isolated Xvfb sessions, not the user's real desktop.
- Observer tools are local-only by default and should be used only with trusted local clients.
