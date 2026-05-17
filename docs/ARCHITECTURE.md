# Architecture

`agent-desktop-harness` is organized around one shared core engine with thin interface adapters. The current core implements the first Xvfb session lifecycle MVP. The MCP stdio adapter and local HTTP JSON API are implemented.

## Core Engine

The core engine owns session lifecycle, policy checks, X11 input dispatch, X11 window control, screenshots, evidence recording, and future driver selection. MCP, HTTP, and CLI adapters should call the core instead of duplicating behavior.

The core package is `@agent-desktop-harness/core`.

## Session Manager

The session manager creates, tracks, and stops desktop sessions. For v0.1, each session represents an isolated Xvfb display plus optional launched application processes.

Responsibilities:

- Validate `SessionConfig`.
- Apply policy before app launch.
- Allocate a display.
- Start Xvfb and optional `openbox`.
- Launch app commands with `shell: false`.
- Track status and metadata.
- Dispatch X11 fallback input actions to the session display.
- List and focus windows inside the session display.
- Stop processes and clean up resources.

## Display Backend

The v0.1 display backend is Xvfb. It should run without controlling the user's real desktop. Later backends may support other Linux display systems, but Xvfb remains the first target because it is widely available in CI and agent environments.

## Input Backend

The current input backend uses `xdotool` against the session `DISPLAY`. It supports click, double click, text typing, hotkeys, and scroll wheel actions. Text typing uses argument passing and does not shell-interpolate user text.

The input backend should be session-scoped. It must not send events to the host desktop.

## Window Backend

The current window backend uses `wmctrl -lp` against the session `DISPLAY`. It can list windows and focus by window id, exact title, title substring, or pid when available.

## Screenshot Backend

The current screenshot backend uses `scrot` against the session `DISPLAY`. Screenshots include dimensions, capture time, session id, sequence number, label, display, and artifact path.

## Evidence System

Evidence is a core feature, not an optional logger. Each session should produce reviewable artifacts:

- Screenshots.
- Input/action logs.
- Session metadata.
- `report.md`.

The evidence recorder should make it possible to audit what an agent saw and did.

## Policy System

The policy system protects users and workspaces by deciding whether actions are allowed before they happen.

Initial policy concepts:

- Command allowlist.
- Workspace root.
- Explicitly disabled real desktop control.
- Secret redaction patterns.
- Human approval gates for dangerous actions.

## Interface Adapters

### MCP

The MCP stdio server is intended for agent clients that speak the Model Context Protocol. It exposes safe, typed tools backed by the core engine. It does not expose arbitrary shell execution.

### HTTP

The HTTP JSON API is intended for local integrations, Hermes Agent orchestration, and test harnesses. It uses the same core policy, session, input, screenshot, and evidence paths as the MCP server. It binds to `127.0.0.1:7341` by default.

### CLI

The CLI is intended for local development, debugging, and CI scripts. It should remain a thin wrapper around the core.

## Future Driver Router

The driver-router will choose the most useful driver for a session:

```text
session
  -> probe app/runtime
  -> browser driver when a browser target is available
  -> Tauri WebDriver driver when tauri-driver is available
  -> Electron driver when Electron debugging hooks are available
  -> native screenshot/X11 fallback otherwise
```

This keeps pixel interaction as a fallback while allowing richer semantic inspection when the app supports it.
