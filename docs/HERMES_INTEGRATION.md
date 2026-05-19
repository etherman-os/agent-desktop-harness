# Hermes Integration

Hermes Agent is a primary intended user of this project. The integration should use the same shared core engine as every other interface.

For the high-level end-to-end workflow, see [Agent GUI QA Cockpit](AGENT_GUI_QA_COCKPIT.md).

## Intended Flow

1. Hermes requests a new isolated desktop session through the local HTTP API.
2. The harness validates the command and workspace against policy.
3. The harness starts the app inside Xvfb.
4. Hermes captures screenshots and performs approved input actions.
5. For web apps, Hermes can use browser semantic routes for selector, role, label, placeholder, text, and assertion actions inside the isolated browser.
6. For Electron development-mode apps, Hermes can try the experimental Electron semantic routes before falling back to desktop tools.
7. For mixed app workflows, Hermes can use the driver-router routes so the harness chooses browser, Tauri, Electron, or X11 fallback explicitly.
8. Hermes can run Visual QA comparisons, baseline checks, annotation-region assertions, and change-containment checks against PNG evidence when a visible change must be proven.
9. Hermes can optionally start a local live observer so a human can watch the isolated Xvfb session in a browser.
10. The harness records evidence for each meaningful step.
11. Hermes reads `report.md` and artifact metadata when reporting results.

## Sample Hermes Goal

```md
Use the local Agent Desktop Harness HTTP API to verify this GUI change.
Start an isolated Xvfb session, launch the app, capture screenshots before and after interaction, save evidence, and stop the session. Do not use the real desktop.
```

## Integration Constraints

- Do not grant Hermes control of the user's real desktop.
- Do not expose arbitrary shell execution through MCP or HTTP.
- Keep session ids, artifact ids, and paths explicit.
- Prefer browser semantic routes for web content and keep desktop actions as the X11 fallback.
- Prefer driver-router routes when Hermes should choose from app kind and capability status instead of hardcoding a driver-specific API.
- Treat Tauri WebDriver routes as experimental and keep Tauri X11 fallback available.
- Treat Electron semantic routes as experimental and keep desktop X11 fallback available.

## HTTP Workflow

Install and check Linux runtime dependencies before running a real GUI workflow:

```sh
./scripts/install-ubuntu-deps.sh
pnpm --filter @agent-desktop-harness/cli dev -- doctor
```

Start the local server:

```sh
pnpm --filter @agent-desktop-harness/http-server dev
```

Health check:

```sh
curl http://127.0.0.1:7341/health
```

Create a session:

```sh
curl -X POST http://127.0.0.1:7341/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "width": 1440,
    "height": 900,
    "policy": {
      "allowedCommands": ["npm", "node", "xterm"]
    }
  }'
```

Launch an app:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/launch \
  -H "Content-Type: application/json" \
  -d '{
    "command": "npm",
    "args": ["run", "dev"],
    "cwd": "/path/to/project"
  }'
```

Capture a screenshot:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/screenshot \
  -H "Content-Type: application/json" \
  -d '{"label":"initial"}'
```

Click:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/click \
  -H "Content-Type: application/json" \
  -d '{"x":100,"y":200,"button":"left"}'
```

Open a semantic browser page:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/browser/open \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://127.0.0.1:5179",
    "browserExecutablePath": "/usr/bin/google-chrome",
    "viewport": { "width": 1440, "height": 900 }
  }'
```

Fill, click, and assert through browser semantics:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/browser/fill \
  -H "Content-Type: application/json" \
  -d '{
    "placeholder": "Type a message",
    "value": "hello from semantic browser driver"
  }'

curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/browser/click \
  -H "Content-Type: application/json" \
  -d '{
    "role": "button",
    "name": "Save message"
  }'

curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/browser/assert-text \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Status: saved",
    "timeoutMs": 5000
  }'
```

Stop:

```sh
curl -X DELETE http://127.0.0.1:7341/sessions/<sessionId>
```

Check experimental Tauri WebDriver status:

```sh
curl http://127.0.0.1:7341/tauri/status
```

Open a Tauri app through the experimental route:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/tauri/open \
  -H "Content-Type: application/json" \
  -d '{
    "command": "pnpm",
    "args": ["tauri", "dev"],
    "cwd": "/path/to/tauri/app",
    "windowTitleIncludes": "My App"
  }'
```

If the response mode is `x11-fallback`, continue with desktop window/screenshot/input routes. If the response mode is `webdriver`, Hermes may try `tauri/click`, `tauri/fill`, `tauri/assert-text`, and `tauri/screenshot`.

Check experimental Electron semantic status:

```sh
curl http://127.0.0.1:7341/electron/status
```

Open an Electron development-mode app through the experimental route:

```sh
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

If the response mode is `playwright-electron`, Hermes may use `electron/fill`, `electron/click`, `electron/press`, `electron/assert-text`, and `electron/screenshot`. For packaged apps or wrapper commands that do not work with Playwright Electron, continue with desktop fallback routes.

Check the high-level driver router:

```sh
curl http://127.0.0.1:7341/drivers/status
```

Open a routed app:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/apps/open \
  -H "Content-Type: application/json" \
  -d '{
    "appKind": "browser",
    "url": "http://127.0.0.1:5179",
    "browserExecutablePath": "/usr/bin/google-chrome",
    "requireSemantic": true
  }'
```

The response includes `selectedDriver`, `semantic`, `fallbackUsed`, and warnings. If fallback is selected, Hermes should not send semantic-only selectors unless it also provides X11 fallback coordinates.

Compare before/after screenshots with Visual QA:

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

Assert that a region changed:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/assert-changed \
  -H "Content-Type: application/json" \
  -d '{
    "beforePath": "screenshots/0001-before.png",
    "afterPath": "screenshots/0002-after.png",
    "region": { "x": 620, "y": 240, "width": 180, "height": 100 },
    "minDiffPixelRatio": 0.01,
    "createDiffImage": true
  }'
```

## Hermes-Oriented HTTP Workflow

1. Start the local HTTP server on `127.0.0.1`.
2. `POST /sessions` with display settings and an allowlist policy.
3. `POST /sessions/:sessionId/launch` with structured `{ command, args, cwd }`.
4. `POST /sessions/:sessionId/wait-for-window`.
5. `POST /sessions/:sessionId/wait-for-stable-screen`.
6. `POST /sessions/:sessionId/screenshot` before interaction.
7. `GET /sessions/:sessionId/windows`.
8. For routine workflows, prefer `/apps/open`, `/apps/fill`, `/apps/click`, `/apps/assert-text`, and `/apps/screenshot`.
9. For driver-specific debugging, use `/browser/*`, `/tauri/*`, or `/electron/*` routes directly.
10. For native or fallback surfaces, use `POST /click`, `POST /type-text`, `POST /hotkey`, or related desktop action routes.
11. `POST /sessions/:sessionId/screenshot` after interaction when root-window evidence is useful.
12. Optionally call `/visual/compare`, `/visual/assert-changed`, or `/visual/assert-similar` against before/after PNG evidence.
13. Optionally open `/sessions/:sessionId/annotate` for human visual handoff.
14. `DELETE /sessions/:sessionId` to stop processes and generate `report.md`.
15. `GET /sessions/:sessionId/evidence/report` while the server process is still running.

The HTTP server is local-only by default and binds to `127.0.0.1`. Do not expose it to the public internet.

## Visual Annotation Handoff

Hermes can use visual handoff when a human needs to point at the exact broken area.

1. Capture a screenshot with a useful label, such as `game-bug`.
2. Ask the human to open `http://127.0.0.1:7341/sessions/<sessionId>/annotate`.
3. The human draws a rectangle and writes a note.
4. Hermes calls `GET /sessions/:sessionId/visual-handoff`.
5. Hermes reads the referenced screenshot and crop paths, then uses the note to guide the repair task.

Helper command:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- annotate-url --session <sessionId>
```

Example agent instruction:

```txt
Use Agent Desktop Harness evidence for this session.
Read visual-handoff.md and inspect the referenced screenshot/crop.
Fix the UI/game issue described in the human annotation.
After making the fix, rerun the app, capture a new screenshot, and compare evidence.
```

For a reusable prompt template, see:

```text
docs/prompts/ANNOTATION_REPAIR_AGENT_PROMPT.md
```

## Annotation Repair Demo

Run:

```sh
pnpm smoke:annotation-repair
```

This smoke uses `examples/sample-vite-app` in two modes:

- `?demoBug=overlap`: intentionally broken layout with an overlapping badge.
- `?demoBug=fixed`: corrected comparison layout.

The smoke creates a synthetic rectangle annotation through the HTTP API, verifies the same artifacts a human-drawn annotation would produce, captures before/after screenshots, and cleans up the session/server processes. It demonstrates the handoff and verification workflow, not autonomous repair intelligence.

The smoke also runs Visual QA before/after comparison and region change assertion so the report includes diff metrics and diff PNG artifact paths.

## Visual QA Demo

Run:

```sh
pnpm smoke:visual-qa
```

This smoke opens the sample Vite app through the driver router browser semantic path, captures before/after screenshots, generates a diff PNG, records `visual-assertions.jsonl`, verifies that `report.md` includes Visual QA, and cleans up all processes.

Baseline smoke:

```sh
pnpm smoke:visual-baseline
```

This smoke saves a clean sample screenshot as a local baseline, lists it, compares the same screenshot to prove a zero-diff pass, changes the UI through semantic actions, compares the changed screenshot to the baseline, generates a diff PNG, and verifies that `report.md` includes the baseline comparison.

See [Visual QA Assertions](VISUAL_QA_ASSERTIONS.md) and [Visual Baselines](VISUAL_BASELINES.md) for route examples, MCP tools, threshold behavior, and limitations.

## Live Observer Demo

The optional live observer is useful when a human wants to watch the same isolated desktop that Hermes is driving:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- observer-status
pnpm smoke:observer
```

Install optional Ubuntu packages with:

```sh
./scripts/install-ubuntu-deps.sh --with-observer
```

HTTP routes:

```text
GET  /observer/status
GET  /sessions/:sessionId/observers
POST /sessions/:sessionId/observers
DELETE /sessions/:sessionId/observers/:observerId
```

The observer returns a `127.0.0.1` noVNC URL and is stopped automatically when the session stops. Use it with screenshot annotation when a human needs to point at a live GUI issue, then use Visual QA to prove the before/after change.

See [Live Observer](LIVE_OBSERVER.md) for security notes, SSH tunnel guidance, and troubleshooting.

## Local Verification

Before wiring Hermes orchestration to a project, run the isolated X11 and HTTP smoke tests:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- smoke-x11
pnpm --filter @agent-desktop-harness/cli dev -- smoke-http
pnpm smoke:vite:http
```

Expected evidence is written under:

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

## Vite GUI QA Demo

`pnpm smoke:vite:http` verifies the Hermes-oriented value path with a real local web app:

1. Start `examples/sample-vite-app` on `127.0.0.1:5179`.
2. Start the HTTP API on `127.0.0.1:7353`.
3. Create an isolated Xvfb session.
4. Launch a detected GUI browser inside the session.
5. Capture `vite-http-initial`.
6. Click the message input and type `hello from http smoke`.
7. Click `Save message` and capture `vite-http-after-save`.
8. Click `Open details` and capture `vite-http-details-open`.
9. Stop the session and collect evidence.

This demo still uses X11 fallback coordinates. For web apps, `pnpm smoke:browser-semantic` verifies the Playwright-powered semantic browser path without coordinate clicks for app interactions.

Browser override:

```sh
AGENT_DESKTOP_HARNESS_BROWSER=/usr/bin/firefox pnpm smoke:vite:http
```

## Browser Semantic HTTP Demo

Run:

```sh
pnpm smoke:browser-semantic
```

The smoke starts `examples/sample-vite-app`, creates an isolated Xvfb session through HTTP, opens a browser through `/browser/open`, fills by placeholder, clicks by role/name, asserts visible text, captures page-level browser screenshots, and cleans up the session/server processes.

See [Browser Semantic Driver](BROWSER_SEMANTIC_DRIVER.md) for route details, target priority, secret fill redaction, and limitations.

## Driver Router Smoke

Run:

```sh
pnpm smoke:driver-router
```

The smoke starts `examples/sample-vite-app`, creates an isolated Xvfb session through HTTP, checks `/drivers/status`, opens the app through `/apps/open` with `appKind: "browser"` and `requireSemantic: true`, verifies `browser-playwright` selection, performs semantic fill/click/assert actions through `/apps/*`, captures routed screenshots, and cleans up all processes.

See [Driver Router](DRIVER_ROUTER.md) for decision rules, HTTP examples, MCP tools, and limitations.

## Tauri Driver Spike

Run:

```sh
pnpm smoke:tauri-driver
```

Without app configuration or WebDriver prerequisites, this smoke exits with a clear skipped/unavailable result. With a configured Tauri app, it creates an isolated session and tries the experimental Tauri route while keeping X11 fallback explicit.

See [Tauri Driver Spike](TAURI_DRIVER_SPIKE.md) for official prerequisites, route examples, MCP tools, and current limitations.

## Current Status

The repository currently contains the core Xvfb session manager MVP, an implemented MCP stdio adapter, an implemented local HTTP JSON API, a dependency doctor, real X11/HTTP/MCP smoke commands, a Vite GUI QA demo for local verification, a Playwright-powered browser semantic driver MVP, experimental Tauri and Electron semantic driver spikes with safe X11 fallback, a high-level driver router MVP, Visual QA screenshot diff, baseline, annotation-region, and containment assertions, and an optional noVNC live observer.
Visual Annotation Handoff is implemented as a rectangle annotation MVP over screenshot evidence.
