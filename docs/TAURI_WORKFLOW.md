# Tauri Workflow

Agent Desktop Harness supports a reliable Tauri X11 fallback workflow and an experimental Tauri WebDriver semantic spike.

The default reliable workflow launches the real native Tauri window inside the isolated Xvfb desktop, then uses the X11 fallback for screenshots, window focus, and coordinate-based input.

Use this workflow when browser preview is not enough and you need evidence from the actual Tauri shell.

## X11 Fallback Remains The Default Reliable Path

Use X11 fallback for `pnpm tauri dev`, native shell evidence, devtools-heavy workflows, and environments where `tauri-driver` or native WebDriver backends are unavailable.

The fallback path is verified with real native Tauri windows. It remains the recommended path when the goal is to prove that the packaged/native shell appears and behaves correctly.

## Recommended Session

Start a session with enough space for the native window and allow only the command needed by the app:

```bash
curl -X POST http://127.0.0.1:7341/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "width": 1440,
    "height": 900,
    "policy": {
      "allowedCommands": ["pnpm"]
    }
  }'
```

Launch Tauri dev mode from the app directory:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/launch \
  -H "Content-Type: application/json" \
  -d '{
    "command": "pnpm",
    "args": ["tauri", "dev"],
    "cwd": "/path/to/tauri/project",
    "label": "tauri-dev"
  }'
```

## Wait For The Native Window

Tauri dev mode may return before the real app window is ready. It may also create extra windows such as devtools. Wait for the main window and exclude common devtools titles:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/wait-for-window \
  -H "Content-Type: application/json" \
  -d '{
    "titleIncludes": "My App",
    "excludeDevtools": true,
    "preferLargest": true,
    "timeoutMs": 30000
  }'
```

If the app title is dynamic, omit `titleIncludes` and keep `excludeDevtools` plus `preferLargest`.

## Capture Evidence

Capture a key screenshot after the window is ready:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/screenshot \
  -H "Content-Type: application/json" \
  -d '{ "label": "tauri-initial" }'
```

For screens with small animations or caret blinking, use tolerant stable-screen mode and retain only the final stable-check screenshot:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/wait-for-stable-screen \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "tolerant",
    "fileSizeToleranceBytes": 4096,
    "stableChecks": 1,
    "retainOnlyLast": true,
    "timeoutMs": 5000,
    "intervalMs": 500,
    "label": "tauri-stable"
  }'
```

Stable-check screenshots discarded from the main evidence list are moved under `transient/`, so `report.md` stays focused on retained screenshots.

## MCP Workflow

The same flow is available through MCP tools:

- `desktop_start_session`
- `desktop_launch_app`
- `desktop_wait_for_window`
- `desktop_screenshot`
- `desktop_wait_for_stable_screen`
- `desktop_get_evidence_report`
- `desktop_stop_session`

Use `excludeDevtools: true` when waiting for or focusing a Tauri dev window.

## Sample Agent Prompt

```md
Use Agent Desktop Harness to verify this Tauri app in the real native window.
Do not use browser preview.
Start an isolated Xvfb session, launch `pnpm tauri dev`, wait for the main app window excluding devtools, capture screenshots, interact minimally, and save evidence.
```

## Current Limitations

- Interactions still use the X11 fallback, so clicks are coordinate-based.
- Tauri WebDriver through `tauri-driver` is experimental and environment-sensitive.
- Devtools and extra windows can still affect focus if the app title is ambiguous.
- Evidence may include sensitive app data; treat `.desktop-harness/` as local sensitive output.

## Experimental WebDriver Semantic Path

The experimental Tauri driver spike can check `tauri-driver`, `WebKitWebDriver`, and `cargo`, then attempt a WebDriver session when a built Tauri application binary is available.

Run status checks:

```bash
pnpm --filter @agent-desktop-harness/cli dev -- doctor
curl http://127.0.0.1:7341/tauri/status
```

Run the spike smoke:

```bash
pnpm smoke:tauri-driver
```

Configure a local Tauri app:

```bash
AGENT_DESKTOP_HARNESS_TAURI_COMMAND="pnpm tauri dev" \
AGENT_DESKTOP_HARNESS_TAURI_CWD="/path/to/tauri/app" \
pnpm smoke:tauri-driver
```

For WebDriver semantic mode, also provide a built application binary:

```bash
AGENT_DESKTOP_HARNESS_TAURI_APP_PATH="/path/to/tauri/app/src-tauri/target/debug/app" \
AGENT_DESKTOP_HARNESS_TAURI_ASSERT_TEXT="Ready" \
pnpm smoke:tauri-driver
```

If the debug app binary uses a Tauri `build.devUrl`, start the frontend dev server as a smoke prelaunch process:

```bash
AGENT_DESKTOP_HARNESS_TAURI_COMMAND="pnpm tauri dev" \
AGENT_DESKTOP_HARNESS_TAURI_CWD="/path/to/tauri/app" \
AGENT_DESKTOP_HARNESS_TAURI_APP_PATH="/path/to/tauri/app/src-tauri/target/debug/app" \
AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_COMMAND="pnpm dev" \
AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_CWD="/path/to/tauri/app" \
AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_WAIT_URL="http://127.0.0.1:1420" \
AGENT_DESKTOP_HARNESS_TAURI_ASSERT_TEXT="Ready" \
pnpm smoke:tauri-driver
```

See [Tauri Driver Spike](TAURI_DRIVER_SPIKE.md) for routes, MCP tools, prerequisites, and known failure modes.
