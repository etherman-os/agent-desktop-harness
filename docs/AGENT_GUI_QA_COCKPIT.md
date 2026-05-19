# Agent GUI QA Cockpit

Agent Desktop Harness is a Linux-first GUI QA and visual handoff cockpit for coding agents. It lets agents run real GUI apps in isolated Xvfb desktops, choose semantic drivers when possible, fall back to X11 when needed, and leave screenshot evidence for every important UI change.

## End-to-End Workflow

```text
1. Start an isolated session.
2. Open the app through the driver router.
3. Prefer a semantic driver when available.
4. Fall back to X11 when needed.
5. Capture screenshots.
6. Optionally watch the isolated desktop through the live observer.
7. Annotate the broken region.
8. Ask the agent to fix using visual-handoff.md.
9. Re-run the app.
10. Compare before/after screenshots with Visual QA.
11. Save report and evidence.
```

## Which Feature To Use

| Feature | Use it for |
| ------- | ---------- |
| Browser semantic driver | Web forms, buttons, labels, role/name targets, and visible text assertions. |
| Electron semantic driver | Development-mode Electron renderer UI when Playwright Electron can launch the app. |
| Tauri WebDriver driver | Tauri webview UI when `tauri-driver`, platform WebDriver support, and app configuration are available. |
| X11 fallback | Unknown/native windows, visual evidence, and coordinate-based escape hatches. |
| Driver router | Let the harness choose the best available path from `appKind` and capability status. |
| Visual Annotation Handoff | Human says "the bug is here" by drawing a rectangle on a screenshot. |
| Visual QA baselines | Regression checks against named local screenshot baselines. |
| Change containment | Pixel-based proof that changes stayed inside expected rectangles. |
| Live observer | Human watches the isolated Xvfb desktop through a local browser. |

## HTTP Workflow

Start the local HTTP server:

```sh
pnpm --filter @agent-desktop-harness/http-server dev
```

Create a session:

```sh
curl -X POST http://127.0.0.1:7341/sessions \
  -H "Content-Type: application/json" \
  -d '{"width":1440,"height":900}'
```

Open a browser app through the driver router:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/apps/open \
  -H "Content-Type: application/json" \
  -d '{
    "appKind": "browser",
    "url": "http://127.0.0.1:5179",
    "requireSemantic": true
  }'
```

Interact semantically:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/apps/fill \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "<appId>",
    "placeholder": "Type a message",
    "value": "hello from the cockpit"
  }'

curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/apps/click \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "<appId>",
    "role": "button",
    "name": "Save message"
  }'
```

Capture before/after evidence:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/apps/screenshot \
  -H "Content-Type: application/json" \
  -d '{"appId":"<appId>","label":"after-save"}'
```

Compare visual evidence:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/compare \
  -H "Content-Type: application/json" \
  -d '{
    "beforePath": "screenshots/0001-before.png",
    "afterPath": "screenshots/0002-after.png",
    "label": "before-after",
    "createDiffImage": true
  }'
```

Start the optional live observer when dependencies are installed:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/observers \
  -H "Content-Type: application/json" \
  -d '{"viewOnly":true}'
```

Stop the session:

```sh
curl -X DELETE http://127.0.0.1:7341/sessions/<sessionId>
```

## MCP Workflow

For MCP clients, use the high-level tools first:

```text
desktop_start_session
driver_get_status
app_open
app_fill
app_click
app_assert_text
app_screenshot
visual_compare
desktop_get_evidence_report
desktop_stop_session
```

Use driver-specific tools when the agent needs advanced control:

```text
browser_open / browser_fill / browser_click
electron_open / electron_fill / electron_click
tauri_open / tauri_fill / tauri_click
desktop_click / desktop_type_text
```

Use observer tools only when a human should watch the session:

```text
observer_get_status
observer_start
observer_list
observer_stop
```

The MCP server returns metadata and paths. It does not stream VNC frames or binary diff images.

## Human Annotation Loop

1. Capture a screenshot.
2. Open `http://127.0.0.1:7341/sessions/<sessionId>/annotate`.
3. Draw a rectangle around the broken area.
4. Save a note.
5. Give `visual-handoff.md` to the coding agent.
6. After the fix, run `visual_assert_annotation_changed` or `visual_assert_change_contained`.

## Evidence To Review

Session evidence is written under `.desktop-harness/sessions/<sessionId>/`:

```text
screenshots/
annotations/
visual-diffs/
actions.jsonl
annotations.jsonl
visual-assertions.jsonl
visual-handoff.md
report.md
session.json
```

Local baselines are written under `.desktop-harness/baselines/`.

## Safety Notes

- The harness targets its own Xvfb sessions, not the user's real desktop.
- The HTTP server binds to `127.0.0.1` by default and has no authentication layer.
- The live observer binds to `127.0.0.1` by default and is optional.
- Use SSH tunnels for remote viewing instead of public binds.
- Screenshots, live views, reports, and logs may expose sensitive data.
- Secret redaction only applies when callers mark inputs with `secret: true`.
- Tauri and Electron semantic drivers are experimental; keep X11 fallback available.

## Related Docs

- [Driver Router](DRIVER_ROUTER.md)
- [Browser Semantic Driver](BROWSER_SEMANTIC_DRIVER.md)
- [Tauri Driver Spike](TAURI_DRIVER_SPIKE.md)
- [Electron Driver Spike](ELECTRON_DRIVER_SPIKE.md)
- [Visual Annotation Handoff](VISUAL_ANNOTATION_HANDOFF.md)
- [Visual QA Assertions](VISUAL_QA_ASSERTIONS.md)
- [Visual Baselines](VISUAL_BASELINES.md)
- [Live Observer](LIVE_OBSERVER.md)
- [Security](SECURITY.md)
