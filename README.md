# Agent Desktop Harness

Linux-first GUI QA and visual handoff cockpit for coding agents.

Let agents see, click, verify, and prove GUI changes.

Coding agents often pass terminal tests while breaking the real UI. Agent Desktop Harness gives them an isolated Linux desktop where they can launch apps, interact through semantic drivers or X11 fallback, capture screenshots, annotate issues, compare visual evidence, and clean up safely.

This project focuses on the gap between generic computer-use tools and coding-agent GUI QA workflows.

## Who It Is For

- Claude Code, Codex, Cursor, and other MCP clients.
- Hermes Agent and custom orchestration systems that prefer HTTP.
- Coding agents that need to verify browser, Electron, Tauri, or Linux GUI apps.
- Developers who need screenshot evidence and a clear human-to-agent visual bug handoff.

## What It Is

- A Linux-first harness for agent-driven GUI verification.
- An isolated Xvfb desktop runtime by default.
- A shared TypeScript core exposed through CLI, HTTP JSON API, and MCP stdio server.
- An evidence system for screenshots, action logs, session metadata, reports, annotations, crops, and visual handoffs.
- A Playwright-powered browser semantic driver for web apps running inside the isolated desktop session.
- A verified Tauri native-window X11 fallback workflow and an experimental Tauri WebDriver semantic spike.
- An experimental Playwright Electron semantic driver for development-mode Electron apps.
- A high-level driver router that chooses browser, Tauri, Electron, or X11 interaction paths explicitly.
- A lightweight Visual QA layer for PNG screenshot diffing, region comparison, and before/after reports.
- An optional localhost noVNC live observer for watching isolated Xvfb sessions in a browser.

## What It Is Not

- It is not a generic remote-control tool for the user's real desktop.
- It is not a replacement for Playwright, WebDriver, or accessibility tooling.
- It is not an auth-protected remote desktop service.
- It does not implement production-grade Tauri or Electron semantic drivers yet.
- It does not claim autonomous repair intelligence. The current repair demo proves the handoff and verification workflow.

## Architecture

```text
Claude Code / Codex / Hermes / Cursor
        |
        v
MCP / HTTP / CLI
Agent Desktop Harness
        |
        v
Driver Router
        |-- Browser -> Playwright semantic driver
        |-- Electron -> Playwright Electron driver
        |-- Tauri -> tauri-driver / WebDriver experimental driver
        `-- Unknown/native -> X11 fallback
        |
        v
Xvfb isolated Linux desktop
        |
        v
Screenshots + actions.jsonl + visual-handoff.md
  + visual-diffs/ + visual-assertions.jsonl + baselines
```

The core engine owns session lifecycle, policy checks, process cleanup, screenshot capture, input actions, window actions, and evidence. The adapters call the same core instead of duplicating runtime logic.

## Verified in v0.2

- Xvfb isolated desktop sessions.
- CLI, HTTP, and MCP interfaces.
- Browser semantic driver.
- Electron semantic driver smoke with the sample Electron app.
- Tauri WebDriver experimental path when prerequisites and app configuration are provided.
- Driver router.
- Visual Annotation Handoff.
- Visual diff and baseline assertions.
- Annotation-region visual assertions.
- Optional live observer layer.

Browser semantic support is verified. Electron semantic support is experimental and sample-verified. Tauri WebDriver support is experimental and configured-app verified when local prerequisites are available. The live observer is implemented but optional; its smoke skips honestly unless `x11vnc`, noVNC, and websockify dependencies are installed.

## Main Demo

The strongest v0.2 proof path is the annotation-driven repair demo:

```sh
pnpm smoke:annotation-repair
```

It verifies that the harness can:

- start the sample Vite app locally;
- launch a graphical browser inside an isolated Xvfb session;
- capture a screenshot of an intentional UI issue;
- create a visual annotation handoff with a rectangle and note;
- save a crop image and `visual-handoff.md`;
- capture an after-fix comparison screenshot;
- generate Visual QA diff/assertion evidence for the before/after change;
- stop the browser, HTTP server, Vite server, window manager, and Xvfb cleanly.

The evidence layout is:

```text
.desktop-harness/
  sessions/
    <sessionId>/
      screenshots/
      annotations/
      visual-diffs/
      annotations.jsonl
      visual-assertions.jsonl
      visual-handoff.md
      actions.jsonl
      session.json
      report.md
```

## Quick Start

Ubuntu is the primary target for v0.2.

```sh
git clone https://github.com/etherman-os/agent-desktop-harness.git
cd agent-desktop-harness
pnpm install
./scripts/install-ubuntu-deps.sh
pnpm build
pnpm --filter @agent-desktop-harness/cli dev -- doctor
pnpm smoke:annotation-repair
```

Manual dependency install:

```sh
sudo apt update
sudo apt install -y xvfb openbox x11-utils scrot xdotool wmctrl xterm
```

Optional live observer dependencies:

```sh
sudo apt install -y x11vnc novnc websockify
```

The Vite/browser smokes also require a graphical browser such as Chromium, Chrome, or Firefox. You can override browser detection:

```sh
AGENT_DESKTOP_HARNESS_BROWSER=/usr/bin/firefox pnpm smoke:vite:http
```

The dependency helper is never run automatically by package scripts or tests.

## CLI

Useful local commands:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- doctor
pnpm smoke:x11
pnpm smoke:http
pnpm smoke:mcp
pnpm smoke:vite
pnpm smoke:annotation-repair
pnpm smoke:browser-semantic
pnpm smoke:tauri-driver
pnpm smoke:electron-driver
pnpm smoke:driver-router
pnpm smoke:visual-qa
pnpm smoke:visual-baseline
pnpm smoke:observer
```

The smoke commands are manual integration checks. They are not part of `pnpm test` because they require local Linux GUI dependencies and a real Xvfb runtime.

## HTTP JSON API

Hermes and custom agents can use the local HTTP API.

```sh
pnpm --filter @agent-desktop-harness/http-server dev
curl http://127.0.0.1:7341/health
```

The default bind host is `127.0.0.1`. Do not expose the HTTP server to the public internet.

Typical HTTP workflow:

```text
POST /sessions
POST /sessions/:sessionId/launch
POST /sessions/:sessionId/wait-for-window
POST /sessions/:sessionId/wait-for-stable-screen
POST /sessions/:sessionId/screenshot
POST /sessions/:sessionId/click
POST /sessions/:sessionId/type-text
POST /sessions/:sessionId/browser/open
POST /sessions/:sessionId/browser/fill
POST /sessions/:sessionId/browser/click
POST /sessions/:sessionId/browser/assert-text
POST /sessions/:sessionId/browser/screenshot
GET  /drivers/status
POST /sessions/:sessionId/apps/open
POST /sessions/:sessionId/apps/fill
POST /sessions/:sessionId/apps/click
POST /sessions/:sessionId/apps/assert-text
POST /sessions/:sessionId/apps/screenshot
POST /sessions/:sessionId/visual/compare
POST /sessions/:sessionId/visual/assert-changed
POST /sessions/:sessionId/visual/assert-similar
POST /sessions/:sessionId/visual/baselines
GET  /sessions/:sessionId/visual/baselines
POST /sessions/:sessionId/visual/compare-baseline
POST /sessions/:sessionId/visual/assert-annotation-changed
POST /sessions/:sessionId/visual/assert-change-contained
GET  /sessions/:sessionId/visual/assertions
GET  /observer/status
GET  /sessions/:sessionId/observers
POST /sessions/:sessionId/observers
DELETE /sessions/:sessionId/observers/:observerId
GET  /electron/status
POST /sessions/:sessionId/electron/open
POST /sessions/:sessionId/electron/fill
POST /sessions/:sessionId/electron/click
POST /sessions/:sessionId/electron/assert-text
POST /sessions/:sessionId/electron/screenshot
GET  /sessions/:sessionId/visual-handoff
DELETE /sessions/:sessionId
```

See [Hermes Integration](docs/HERMES_INTEGRATION.md) for curl examples and orchestration guidance.

Use the browser semantic routes for web app interactions such as filling inputs, clicking buttons by role/name, and asserting visible text. The existing desktop routes remain the X11 fallback for native windows and visual evidence.

Use the high-level driver-router routes when an agent should choose the best available path from `appKind` and capability status. The router response always reports `selectedDriver`, `semantic`, `fallbackUsed`, and warnings. See [Driver Router](docs/DRIVER_ROUTER.md).

Use Visual QA routes after capturing before/after PNG screenshots when the agent should measure pixel change, generate a diff PNG, assert that a region changed, compare a named baseline, or verify that changes stayed inside expected rectangles. See [Visual QA Assertions](docs/VISUAL_QA_ASSERTIONS.md) and [Visual Baselines](docs/VISUAL_BASELINES.md).

Use live observer routes when a human should watch the isolated session through a local browser. The observer is optional, localhost-only by default, and stopped automatically with the session. See [Live Observer](docs/LIVE_OBSERVER.md).

Use the experimental Electron routes for development-mode Electron apps that can be launched by Playwright's Electron API. If Electron opens in fallback mode or semantic launch fails, continue with the desktop routes.

## MCP Stdio Server

Claude Code, Codex, Cursor, and MCP-compatible clients can use the MCP stdio server.

```sh
pnpm build
node packages/mcp-server/dist/index.js
```

Claude Code-style registration:

```sh
claude mcp add --transport stdio desktop-harness -- \
  node /absolute/path/to/agent-desktop-harness/packages/mcp-server/dist/index.js
```

MCP stdio tools are implemented and smoke-tested locally. See [MCP Usage](docs/MCP_USAGE.md) for tool workflows, MCP Inspector notes, and troubleshooting.

## Visual Annotation Handoff

Draw what you mean. Let the agent fix it.

Sometimes the human cannot describe the exact broken UI area in words. Visual Annotation Handoff lets the human draw a rectangle on a screenshot and attach a note. The harness saves the annotation, a crop image, and `visual-handoff.md` for the agent.

Human workflow:

```text
1. Capture screenshot.
2. Open /sessions/<sessionId>/annotate.
3. Draw rectangle.
4. Write note.
5. Save annotation.
6. Give visual-handoff.md to the coding agent.
7. Agent makes a targeted fix and captures after evidence.
```

Print an annotation URL for an active HTTP session:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- annotate-url --session <sessionId>
```

The HTTP server must already be running and must still have that session in memory.

Agent prompt template:

```text
docs/prompts/ANNOTATION_REPAIR_AGENT_PROMPT.md
```

See [Visual Annotation Handoff](docs/VISUAL_ANNOTATION_HANDOFF.md) for routes, MCP tools, artifact layout, and security notes.

## Visual QA Assertions

Visual QA turns before/after screenshots into measurable evidence. It can compare full PNG screenshots, compare a selected region, create a diff PNG, save/list/compare local baselines, use rectangle annotations as assertion regions, check pixel change containment, and write compact summaries into `visual-assertions.jsonl`, `report.md`, and annotation handoff reports.

Run:

```sh
pnpm smoke:visual-qa
pnpm smoke:visual-baseline
```

See [Visual QA Assertions](docs/VISUAL_QA_ASSERTIONS.md) and [Visual Baselines](docs/VISUAL_BASELINES.md) for HTTP and MCP examples.

## Live Observer

The optional live observer starts `x11vnc` against the isolated Xvfb display and serves a noVNC browser page on `127.0.0.1`. It is useful for demos, long-running GUI debugging, and pairing live observation with screenshot annotation.

Run:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- observer-status
pnpm smoke:observer
```

Install optional packages with:

```sh
./scripts/install-ubuntu-deps.sh --with-observer
```

The smoke passes when observer dependencies are available and skips honestly when they are missing. See [Live Observer](docs/LIVE_OBSERVER.md) and [Security](docs/SECURITY.md).

## Current Capabilities

| Capability                |                                 Status | Smoke                   |
| ------------------------- | -------------------------------------: | ----------------------- |
| Isolated Xvfb session     |                               Verified | `smoke:x11`             |
| CLI interface             |                               Verified | `smoke:x11`             |
| HTTP API                  |                               Verified | `smoke:http`            |
| MCP stdio server          |                               Verified | `smoke:mcp`             |
| Browser semantic driver   |                               Verified | `smoke:browser-semantic` |
| Electron semantic driver  |         Experimental / sample verified | `smoke:electron-driver` |
| Tauri X11 fallback        |                               Verified | manual workflow         |
| Tauri WebDriver driver    | Experimental / configured-app verified | `smoke:tauri-driver`    |
| Driver router             |                               Verified | `smoke:driver-router`   |
| Visual Annotation Handoff |                           MVP verified | `smoke:annotation-repair` |
| Visual diff               |                               Verified | `smoke:visual-qa`       |
| Visual baselines          |                               Verified | `smoke:visual-baseline` |
| Annotation region assertions |                            Verified | `smoke:annotation-repair` |
| Change containment        |                               Verified | `smoke:annotation-repair` |
| noVNC live observer       |            Optional / dependency-gated | `smoke:observer`        |
| X11 fallback              |                               Verified | `smoke:x11`             |
| OCR                       |                        Not implemented | N/A                     |
| Wayland backend           |                                 Future | N/A                     |

## Known Limitations

- Linux/X11/Xvfb-first.
- Real desktop control is not enabled by default.
- Tauri WebDriver semantic support is experimental and may fall back to X11.
- Tauri WebDriver mode usually needs `tauri-driver`, `WebKitWebDriver`, a built app binary, and any `build.devUrl` frontend server started separately or through smoke prelaunch.
- Electron semantic support is experimental and focused on development-mode Electron apps launched through Playwright's Electron API.
- Packaged Electron app support may require a different launch or CDP connection path.
- The driver router reports fallback explicitly; it does not make X11 fallback understand semantic selectors.
- Visual QA is PNG-only, has no OCR, and does not perform automatic layout or element detection.
- Visual change containment is pixel-based and checks known rectangles only.
- noVNC live observer requires optional `x11vnc`, `novnc`, and `websockify` packages and is local-only by default.
- Non-browser GUI interaction fallback is still coordinate-based.
- Browser semantic screenshots are page-content screenshots; desktop screenshots remain X11 root-window screenshots.
- Stable-check screenshots may be moved to `transient/` so reports focus on retained screenshots.
- Built-in annotation UI supports rectangle drawing only.
- HTTP server has no authentication and is local-only by default.
- Sessions are in-memory per server process.
- Visual annotation repair smoke proves handoff and verification, not autonomous LLM repair.
- Evidence may contain sensitive screenshots, local paths, and typed text unless redaction is explicitly used.

## Generated Evidence

The repository intentionally does not commit generated smoke screenshots, visual diffs, baselines, or session evidence by default. Run the smoke commands locally and inspect `.desktop-harness/sessions/<sessionId>/` for screenshots, `report.md`, `visual-handoff.md`, `visual-diffs/`, and `visual-assertions.jsonl`.

## Development Checks

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm --filter @agent-desktop-harness/cli dev -- doctor
```

Release-candidate smoke checks:

```sh
pnpm smoke:x11
pnpm smoke:http
pnpm smoke:mcp
pnpm smoke:vite:http
pnpm smoke:vite:mcp
pnpm smoke:annotation-repair
pnpm smoke:browser-semantic
pnpm smoke:electron-driver
pnpm smoke:driver-router
pnpm smoke:visual-qa
pnpm smoke:visual-baseline
```

Optional or dependency-gated checks:

```sh
pnpm smoke:observer
pnpm smoke:tauri-driver
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Linux Troubleshooting](docs/TROUBLESHOOTING_LINUX.md)
- [MCP Usage](docs/MCP_USAGE.md)
- [Hermes Integration](docs/HERMES_INTEGRATION.md)
- [Driver Router](docs/DRIVER_ROUTER.md)
- [Agent GUI QA Cockpit Workflow](docs/AGENT_GUI_QA_COCKPIT.md)
- [Visual QA Assertions](docs/VISUAL_QA_ASSERTIONS.md)
- [Visual Baselines](docs/VISUAL_BASELINES.md)
- [Live Observer](docs/LIVE_OBSERVER.md)
- [Browser Semantic Driver](docs/BROWSER_SEMANTIC_DRIVER.md)
- [Tauri Workflow](docs/TAURI_WORKFLOW.md)
- [Tauri Driver Spike](docs/TAURI_DRIVER_SPIKE.md)
- [Electron Driver Spike](docs/ELECTRON_DRIVER_SPIKE.md)
- [Visual Annotation Handoff](docs/VISUAL_ANNOTATION_HANDOFF.md)
- [License Decision Notes](docs/LICENSE_DECISION.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [v0.2.0 Release Notes Draft](docs/releases/v0.2.0.md)
- [Standalone Repo Setup](docs/STANDALONE_REPO_SETUP.md)
- [v0.1.0 Release Notes Draft](docs/releases/v0.1.0.md)
- [Contributing](CONTRIBUTING.md)

## License

Apache-2.0
