# Browser Semantic Driver

The browser semantic driver adds Playwright-powered web actions to the harness while keeping the harness responsible for isolated desktop sessions, app lifecycle, evidence, screenshots, HTTP/MCP adapters, and X11 fallback actions.

Playwright is used as a driver inside the harness. It does not replace the harness.

## When To Use It

Use the browser semantic driver for local web apps and browser-based demos when the agent should interact with DOM or accessibility targets instead of screen coordinates.

Use X11 fallback actions for non-browser windows, native app surfaces, and cases where visual/pixel evidence is the primary signal.

Use Visual Annotation Handoff when a human needs to point at the exact broken area in a screenshot.

## Runtime Model

The driver launches a real graphical browser inside the existing Xvfb session by setting `DISPLAY` to the session display. Browser processes are tracked by the core session manager and are closed when the session stops.

The driver uses `playwright-core` and expects a supported browser to be installed on the host unless the caller provides a Playwright-compatible executable path. Browser detection checks:

- `AGENT_DESKTOP_HARNESS_BROWSER`
- `chromium`
- `chromium-browser`
- `google-chrome`
- `google-chrome-stable`
- `firefox`

Chromium and Chrome are the primary MVP targets. Firefox is best-effort.

## Target Types

Browser actions resolve one semantic target in this priority order:

1. `selector`
2. `testId`
3. `role` with optional `name`
4. `label`
5. `placeholder`
6. `text`

Examples:

```json
{ "selector": "#save" }
{ "testId": "save-button" }
{ "role": "button", "name": "Save message" }
{ "label": "Message" }
{ "placeholder": "Type a message" }
{ "text": "Open details" }
```

## HTTP Workflow

Start the HTTP server:

```sh
pnpm --filter @agent-desktop-harness/http-server dev
```

Create a session:

```sh
curl -X POST http://127.0.0.1:7341/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "width": 1440,
    "height": 900
  }'
```

Open a browser page inside that session:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/browser/open \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://127.0.0.1:5179",
    "browserExecutablePath": "/usr/bin/google-chrome",
    "viewport": { "width": 1440, "height": 900 },
    "label": "open-demo"
  }'
```

Fill by placeholder:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/browser/fill \
  -H "Content-Type: application/json" \
  -d '{
    "placeholder": "Type a message",
    "value": "hello from semantic browser driver"
  }'
```

Click by role and accessible name:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/browser/click \
  -H "Content-Type: application/json" \
  -d '{
    "role": "button",
    "name": "Save message"
  }'
```

Assert visible text:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/browser/assert-text \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Status: saved",
    "timeoutMs": 5000,
    "label": "assert-saved"
  }'
```

Capture a browser-content screenshot:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/browser/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "label": "semantic-after-save",
    "fullPage": false
  }'
```

Close browser resources:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/browser/close \
  -H "Content-Type: application/json" \
  -d '{}'
```

Then stop the session:

```sh
curl -X DELETE http://127.0.0.1:7341/sessions/<sessionId>
```

## MCP Tools

The MCP server exposes browser tools separately from desktop tools:

- `browser_open`
- `browser_click`
- `browser_fill`
- `browser_press`
- `browser_assert_text`
- `browser_screenshot`
- `browser_close`

Example MCP input for opening a page:

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

Example MCP input for clicking:

```json
{
  "sessionId": "session-id",
  "role": "button",
  "name": "Save message"
}
```

MCP screenshot tools return paths and metadata. They do not return binary PNG data.

## Screenshots

`desktop_screenshot` and `POST /sessions/:sessionId/screenshot` capture the X11 root window.

`browser_screenshot` and `POST /sessions/:sessionId/browser/screenshot` capture browser page content through Playwright. These screenshots still use the session evidence directory and appear in reports, but they are page-level screenshots rather than root-window screenshots.

## Secret Fill Redaction

Set `secret: true` when filling sensitive values:

```json
{
  "sessionId": "session-id",
  "label": "Password",
  "value": "not logged",
  "secret": true
}
```

The action result and `actions.jsonl` record redaction metadata and value length instead of the raw value. Screenshots may still contain visible secrets if the application renders them.

## Smoke Test

Run the semantic browser smoke:

```sh
pnpm smoke:browser-semantic
```

The smoke starts the sample Vite app, starts the HTTP server, creates an isolated Xvfb session, opens a browser through the semantic route, fills and clicks by semantic targets, asserts text, captures browser screenshots, and cleans up processes.

## Limitations

- Browser semantic actions are for web/browser content only.
- Tauri and Electron semantic drivers exist as experimental paths and remain separate from the browser driver.
- A supported host browser must be installed unless a compatible executable path is provided.
- The MVP manages browser resources per desktop session; callers should keep page ids explicit when using multiple pages.
- Visual layout and pixel bugs still need screenshots, visual assertions, or Visual Annotation Handoff.
