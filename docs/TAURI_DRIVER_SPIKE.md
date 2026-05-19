# Tauri Driver Spike

This document describes the experimental Tauri WebDriver driver spike in Agent Desktop Harness.

The spike tries to add a semantic Tauri path through `tauri-driver` while keeping the existing X11 fallback as the reliable default for real native-window verification.

## Status

Experimental.

The harness can:

- detect Tauri WebDriver prerequisites;
- expose prerequisite status through CLI, HTTP, and MCP;
- start a tracked Tauri app in explicit X11 fallback mode when WebDriver is unavailable;
- attempt a WebDriver session through `tauri-driver` when a built Tauri application path is provided;
- expose experimental Tauri HTTP routes and MCP tools;
- clean up tracked Tauri app and `tauri-driver` processes.

The harness does not claim production-grade Tauri semantic support yet.

## Modes

### X11 Fallback Mode

X11 fallback launches the real native Tauri window inside the isolated Xvfb desktop and uses desktop tools for window wait/focus, screenshots, and coordinate-based input.

Use this mode when:

- you are running `pnpm tauri dev`;
- you need evidence from the real native shell;
- `tauri-driver` or the native WebDriver backend is missing;
- WebDriver cannot connect reliably in the current environment.

### Tauri WebDriver Semantic Mode

Tauri WebDriver semantic mode starts `tauri-driver`, creates a WebDriver session for a built Tauri app binary, and uses WebDriver for selector/text-style actions where possible.

Use this mode when:

- `tauri-driver` is installed;
- the platform native WebDriver backend is installed;
- a built Tauri application binary is available;
- the environment can run native WebDriver under Xvfb.

## Official Requirements

Tauri WebDriver support is based on `tauri-driver`.

The Tauri v2 WebDriver documentation states that desktop support is available on Linux and Windows, while macOS desktop WebDriver is not supported because WKWebView does not provide a WebDriver tool. See:

- <https://v2.tauri.app/develop/tests/webdriver/>
- <https://github.com/tauri-apps/webdriver-example>

Linux uses `WebKitWebDriver`. Some distributions include it with WebKit packages; others ship a separate package such as `webkit2gtk-driver`. Package names vary by distribution.

Install or update `tauri-driver` with:

```sh
cargo install tauri-driver --locked
```

On Ubuntu 24.04, `WebKitWebDriver` is available through:

```sh
sudo apt-get install -y webkit2gtk-driver
```

Verify both binaries:

```sh
command -v tauri-driver
command -v WebKitWebDriver
```

## Prerequisite Checks

Run:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- doctor
```

The doctor includes:

```text
Experimental Tauri driver dependencies:
  tauri-driver      OK/MISSING
  WebKitWebDriver   OK/MISSING
  cargo             OK/MISSING
```

Missing experimental Tauri dependencies do not make the general desktop harness doctor fail. They only make the Tauri semantic driver unavailable.

HTTP status:

```sh
curl http://127.0.0.1:7341/tauri/status
```

MCP status:

```text
tauri_get_status
```

## HTTP Routes

Experimental routes:

```text
GET  /tauri/status
POST /sessions/:sessionId/tauri/open
POST /sessions/:sessionId/tauri/click
POST /sessions/:sessionId/tauri/fill
POST /sessions/:sessionId/tauri/assert-text
POST /sessions/:sessionId/tauri/screenshot
POST /sessions/:sessionId/tauri/close
```

Fallback responses include:

```json
{
  "experimental": true,
  "mode": "x11-fallback",
  "warnings": ["Tauri WebDriver semantic mode is unavailable; use desktop_* X11 fallback tools."]
}
```

WebDriver responses include:

```json
{
  "experimental": true,
  "mode": "webdriver"
}
```

## MCP Tools

Experimental MCP tools:

- `tauri_get_status`
- `tauri_open`
- `tauri_click`
- `tauri_fill`
- `tauri_assert_text`
- `tauri_screenshot`
- `tauri_close`

Tools return explicit fallback guidance when semantic WebDriver mode is unavailable. They do not claim semantic action success in fallback mode.

## Smoke Command

Run:

```sh
pnpm smoke:tauri-driver
```

Without app configuration, the smoke prints prerequisite status and exits as skipped:

```text
No Tauri app configured. Set AGENT_DESKTOP_HARNESS_TAURI_COMMAND and AGENT_DESKTOP_HARNESS_TAURI_CWD.
```

Configure a local app:

```sh
AGENT_DESKTOP_HARNESS_TAURI_COMMAND="pnpm tauri dev" \
AGENT_DESKTOP_HARNESS_TAURI_CWD="/path/to/tauri/app" \
pnpm smoke:tauri-driver
```

For WebDriver semantic mode, provide a built application binary:

```sh
AGENT_DESKTOP_HARNESS_TAURI_COMMAND="pnpm tauri dev" \
AGENT_DESKTOP_HARNESS_TAURI_CWD="/path/to/tauri/app" \
AGENT_DESKTOP_HARNESS_TAURI_APP_PATH="/path/to/tauri/app/src-tauri/target/debug/app" \
AGENT_DESKTOP_HARNESS_TAURI_ASSERT_TEXT="Ready" \
pnpm smoke:tauri-driver
```

`AGENT_DESKTOP_HARNESS_TAURI_APPLICATION` is still accepted as a compatibility alias.

Some debug Tauri binaries are configured with `build.devUrl` and need the frontend dev server to be running before WebDriver opens the app. Use a prelaunch command for that case:

```sh
AGENT_DESKTOP_HARNESS_TAURI_COMMAND="pnpm tauri dev" \
AGENT_DESKTOP_HARNESS_TAURI_CWD="/path/to/tauri/app" \
AGENT_DESKTOP_HARNESS_TAURI_APP_PATH="/path/to/tauri/app/src-tauri/target/debug/app" \
AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_COMMAND="pnpm dev" \
AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_CWD="/path/to/tauri/app" \
AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_WAIT_URL="http://127.0.0.1:1420" \
AGENT_DESKTOP_HARNESS_TAURI_ASSERT_TEXT="Ready" \
pnpm smoke:tauri-driver
```

Do not hardcode local app paths in source code or docs.

## Local Validation Notes

On a local Ubuntu 24.04 machine, `cargo install tauri-driver --locked` installed `tauri-driver` and `sudo apt-get install -y webkit2gtk-driver` installed `WebKitWebDriver`. Doctor then reported the experimental Tauri WebDriver semantic path as available.

A real local Tauri app using `build.devUrl` first opened through WebDriver with a `Could not connect to localhost` page when the frontend dev server was not running. With the frontend dev server started through the smoke prelaunch command, the smoke opened the app in `webdriver` mode, captured a WebDriver screenshot, and passed a text assertion. This verifies the experimental path in that local setup, but it is not a production-grade support claim.

## Known Risks

- `tauri-driver` may be missing.
- `WebKitWebDriver` may be missing or packaged under a distro-specific name.
- A port conflict may block `tauri-driver`.
- `pnpm tauri dev` is useful for X11 fallback but may not be enough for WebDriver; a built app binary is usually required.
- Debug binaries configured with `build.devUrl` may require a frontend dev server prelaunch command.
- Headless and container environments can be fragile with WebKit/WebDriver.
- Devtools and inspector windows can confuse window targeting unless `excludeDevtools` is used.
- WebDriver selector support is lower-level than Playwright; role/name, label, and text targets are best-effort XPath/CSS mappings.

## Fallback Policy

Fallback is explicit, not silent.

If WebDriver prerequisites or connection fail, Tauri actions return `success: false` with fallback guidance. Use desktop tools such as `desktop_wait_for_window`, `desktop_screenshot`, `desktop_click`, and Visual Annotation Handoff for the reliable native-window workflow.
