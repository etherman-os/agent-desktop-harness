# Agent Desktop Harness

Linux-first GUI QA and visual handoff harness for coding agents.

Let agents see, click, verify, and prove GUI changes.

Coding agents often pass terminal tests while breaking the actual UI. Agent Desktop Harness is an open-source project that gives them an isolated Linux desktop where they can launch apps, interact with them, capture screenshots, and save audit-ready evidence.

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
- A foundation for future semantic drivers for browsers, Tauri, Electron, and native desktop apps.

## What It Is Not

- It is not a generic remote-control tool for the user's real desktop.
- It is not a replacement for Playwright, WebDriver, or accessibility tooling.
- It is not an auth-protected remote desktop service.
- It does not implement browser, Tauri, or Electron semantic drivers yet.
- It does not claim autonomous repair intelligence. The current repair demo proves the handoff and verification workflow.

## Architecture

```text
Claude Code / Codex / Hermes / Cursor
        |
        v
MCP / HTTP / CLI
        |
        v
Agent Desktop Harness
        |
        v
Xvfb isolated Linux desktop
        |
        v
Local web app / Electron / Tauri / native GUI
        |
        v
Screenshots + actions.jsonl + visual-handoff.md
```

The core engine owns session lifecycle, policy checks, process cleanup, screenshot capture, input actions, window actions, and evidence. The adapters call the same core instead of duplicating runtime logic.

## Main Demo

The strongest v0.1 proof path is the annotation-driven repair demo:

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
- stop the browser, HTTP server, Vite server, window manager, and Xvfb cleanly.

The evidence layout is:

```text
.desktop-harness/
  sessions/
    <sessionId>/
      screenshots/
      annotations/
      annotations.jsonl
      visual-handoff.md
      actions.jsonl
      session.json
      report.md
```

## Quick Start

Ubuntu is the primary target for v0.1.

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
POST /sessions/:sessionId/wait-for-stable-screen
POST /sessions/:sessionId/screenshot
POST /sessions/:sessionId/click
POST /sessions/:sessionId/type-text
GET  /sessions/:sessionId/visual-handoff
DELETE /sessions/:sessionId
```

See [Hermes Integration](docs/HERMES_INTEGRATION.md) for curl examples and orchestration guidance.

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

## v0.1 Capabilities

| Capability                | Status           |
| ------------------------- | ---------------- |
| Isolated Xvfb session     | Verified         |
| Screenshot capture        | Verified         |
| Mouse/keyboard input      | Verified         |
| Window list/focus         | Verified         |
| Evidence artifacts        | Verified         |
| CLI smoke                 | Verified         |
| HTTP API smoke            | Verified         |
| MCP stdio smoke           | Verified         |
| Vite GUI demo             | Verified         |
| Visual Annotation Handoff | MVP verified     |
| Browser semantic driver   | Planned v0.2     |
| Tauri driver              | Planned          |
| Electron driver           | Planned          |
| noVNC live observer       | Planned          |
| Wayland backend           | Future/experimental |

## Known Limitations

- Linux/X11/Xvfb-first.
- Real desktop control is not enabled by default.
- Browser, Tauri, and Electron semantic drivers are not implemented yet.
- Current GUI interaction fallback is coordinate-based.
- Built-in annotation UI supports rectangle drawing only.
- HTTP server has no authentication and is local-only by default.
- Sessions are in-memory per server process.
- Visual annotation repair smoke proves handoff and verification, not autonomous LLM repair.
- Evidence may contain sensitive screenshots, local paths, and typed text unless redaction is explicitly used.

## Screenshots

Coming soon:

- isolated Vite GUI smoke;
- visual annotation handoff;
- before/after repair demo.

The repository intentionally does not commit generated smoke screenshots by default.

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
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Linux Troubleshooting](docs/TROUBLESHOOTING_LINUX.md)
- [MCP Usage](docs/MCP_USAGE.md)
- [Hermes Integration](docs/HERMES_INTEGRATION.md)
- [Visual Annotation Handoff](docs/VISUAL_ANNOTATION_HANDOFF.md)
- [License Decision Notes](docs/LICENSE_DECISION.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Standalone Repo Setup](docs/STANDALONE_REPO_SETUP.md)
- [v0.1.0 Release Notes Draft](docs/releases/v0.1.0.md)
- [Contributing](CONTRIBUTING.md)

## License

Apache-2.0
