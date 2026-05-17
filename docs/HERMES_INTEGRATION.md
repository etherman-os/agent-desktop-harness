# Hermes Integration

Hermes Agent is a primary intended user of this project. The integration should use the same shared core engine as every other interface.

## Intended Flow

1. Hermes requests a new isolated desktop session through the local HTTP API.
2. The harness validates the command and workspace against policy.
3. The harness starts the app inside Xvfb.
4. Hermes captures screenshots and performs approved input actions.
5. The harness records evidence for each meaningful step.
6. Hermes reads `report.md` and artifact metadata when reporting results.

## Sample Hermes Goal

```md
Use the local Agent Desktop Harness HTTP API to verify this GUI change.
Start an isolated Xvfb session, launch the app, capture screenshots before and after interaction, save evidence, and stop the session. Do not use the real desktop.
```

## Integration Constraints

- Do not grant Hermes control of the user's real desktop in v0.1.
- Do not expose arbitrary shell execution through MCP or HTTP.
- Keep session ids, artifact ids, and paths explicit.
- Prefer semantic drivers when the future driver-router can identify one.

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

Stop:

```sh
curl -X DELETE http://127.0.0.1:7341/sessions/<sessionId>
```

## Hermes-Oriented HTTP Workflow

1. Start the local HTTP server on `127.0.0.1`.
2. `POST /sessions` with display settings and an allowlist policy.
3. `POST /sessions/:sessionId/launch` with structured `{ command, args, cwd }`.
4. `POST /sessions/:sessionId/wait-for-stable-screen`.
5. `POST /sessions/:sessionId/screenshot` before interaction.
6. `GET /sessions/:sessionId/windows`.
7. Use `POST /click`, `POST /type-text`, `POST /hotkey`, or related action routes.
8. `POST /sessions/:sessionId/screenshot` after interaction.
9. Optionally open `/sessions/:sessionId/annotate` for human visual handoff.
10. `DELETE /sessions/:sessionId` to stop processes and generate `report.md`.
11. `GET /sessions/:sessionId/evidence/report` while the server process is still running.

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

This demo still uses X11 fallback coordinates. The semantic browser driver is planned for v0.2.

Browser override:

```sh
AGENT_DESKTOP_HARNESS_BROWSER=/usr/bin/firefox pnpm smoke:vite:http
```

## Current Status

The repository currently contains the core Xvfb session manager MVP, an implemented MCP stdio adapter, an implemented local HTTP JSON API, a dependency doctor, real X11/HTTP/MCP smoke commands, and a Vite GUI QA demo for local verification.
Visual Annotation Handoff is implemented as a rectangle annotation MVP over screenshot evidence.
