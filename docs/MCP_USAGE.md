# MCP Usage

The MCP stdio server is implemented in `@agent-desktop-harness/mcp-server`. It exposes the core desktop harness APIs as MCP tools while keeping all session lifecycle, policy, screenshot, input, window, and cleanup behavior in `@agent-desktop-harness/core`.

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
3. `desktop_wait_for_stable_screen`
4. `desktop_screenshot`
5. `desktop_click`
6. `desktop_screenshot`
7. `desktop_stop_session`

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
- `desktop_wait_for_stable_screen`
- `desktop_stop_session`
- `desktop_get_evidence_report`
- `desktop_list_screenshots`
- `desktop_create_annotation`
- `desktop_list_annotations`
- `desktop_get_visual_handoff`

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

This is an X11 fallback demo, not semantic browser automation. The future browser driver should replace coordinate clicks with Playwright/accessibility-backed actions.

Browser override:

```sh
AGENT_DESKTOP_HARNESS_BROWSER=/usr/bin/firefox pnpm smoke:vite:mcp
```

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
- v0.1 targets isolated Xvfb sessions, not the user's real desktop.
