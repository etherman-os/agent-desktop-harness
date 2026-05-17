# Roadmap

## v0.1 Xvfb Evidence MVP

- Implement Xvfb session manager. Done in core MVP.
- Launch allowlisted commands in isolated workspaces. Done in core MVP.
- Capture screenshots. Done in core MVP with `scrot`.
- Perform X11 fallback input and window control. Done in core MVP with `xdotool` and `wmctrl`.
- Record action logs and session metadata. Done in core MVP.
- Generate `report.md`. Done in core MVP.
- Expose initial MCP, HTTP, and CLI paths as thin adapters. MCP stdio, HTTP JSON API, and CLI smoke paths exist.
- Add dependency doctor and Ubuntu setup helper. Done in CLI/docs.
- Add real isolated X11 smoke verification path. Done in CLI; requires local Linux dependencies to run.
- Add real HTTP and MCP integration smoke verification paths. Done as manual smoke scripts.
- Add sample Vite GUI QA demo over HTTP and MCP. Done with X11 fallback coordinates.
- Add Visual Annotation Handoff for screenshot rectangle annotations, crop artifacts, and `visual-handoff.md`. Done as an MVP.
- Add annotation-driven repair demo with Vite broken/fixed modes and before/after evidence. Done as a reproducible smoke workflow.

## v0.2 Browser Semantic Driver

- Add browser target detection.
- Use Playwright and accessibility information where available.
- Prefer semantic browser actions over raw pixel clicking.

## v0.3 Tauri WebDriver Driver

- Add Tauri app detection.
- Integrate with `tauri-driver` / WebDriver.
- Record driver selection in session metadata.

## v0.4 Electron Driver

- Add Electron app detection.
- Explore Playwright Electron and CDP integration.
- Keep screenshot/X11 fallback available.

## v0.5 Visual QA Assertions

- Add visual assertions for screenshots.
- Support baseline comparison and reviewable diffs.
- Keep evidence artifacts tied to assertions.

## v0.6 noVNC Live Observer

- Add optional live observer mode.
- Allow humans to watch isolated sessions.
- Keep control permissions explicit.

## v0.7 Experimental Wayland Backend

- Explore isolated Wayland session support.
- Keep Xvfb as the stable Linux-first backend until Wayland support is mature.
