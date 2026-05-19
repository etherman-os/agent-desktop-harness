# Roadmap

## v0.2 Release Candidate

v0.2 presents Agent Desktop Harness as a Linux-first GUI QA and visual handoff cockpit for coding agents. The current release candidate combines isolated Xvfb sessions, CLI/HTTP/MCP adapters, semantic browser/Electron/Tauri paths, driver routing, Visual Annotation Handoff, Visual QA, visual baselines, and an optional local noVNC observer.

Required smokes are `smoke:x11`, `smoke:http`, `smoke:mcp`, `smoke:vite:http`, `smoke:vite:mcp`, `smoke:annotation-repair`, `smoke:browser-semantic`, `smoke:electron-driver`, `smoke:driver-router`, `smoke:visual-qa`, and `smoke:visual-baseline`.

Dependency-gated smokes are `smoke:observer` and `smoke:tauri-driver`. They should pass when prerequisites are installed and configured, and skip honestly otherwise.

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

## v0.1.1 Xvfb Workflow Hardening

- Add tolerant stable-screen checks without heavy image diff dependencies. Done.
- Limit stable-check screenshot clutter with retained screenshot summaries and a `transient/` evidence folder. Done.
- Improve window selection with devtools exclusion, geometry parsing, and best-window helpers. Done.
- Add `waitForWindow` for app-ready polling through core, HTTP, and MCP. Done.
- Document the current Tauri native-window fallback workflow. Done.

## v0.2 Browser Semantic Driver

- Add Playwright-powered browser sessions inside isolated Xvfb sessions. Done as an MVP with `playwright-core`.
- Add semantic browser actions for selector, test id, role/name, label, placeholder, and text targets. Done.
- Expose browser semantic actions through core, HTTP, and MCP. Done.
- Add browser-content screenshots to the existing evidence store and reports. Done.
- Add a Vite semantic browser smoke that avoids coordinate clicking for app interactions. Done.
- Keep X11 fallback available for native windows and visual evidence. Done.

## v0.2 Tauri WebDriver Driver

- Keep verified Tauri X11 fallback as the reliable default path. Done.
- Add Tauri WebDriver prerequisite detection for `tauri-driver`, `WebKitWebDriver`, and `cargo`. Done as an experimental spike.
- Expose experimental Tauri status/open/action/screenshot/close APIs through core, HTTP, and MCP. Done as an experimental spike.
- Add `smoke:tauri-driver` with honest skipped/unavailable behavior when dependencies or app config are missing. Done.
- Continue hardening real WebDriver sessions against built Tauri apps on Linux/Windows. Planned.
- Record driver selection in session metadata. Initial `driverKind: "tauri"` wiring done.

## v0.2 Electron Driver

- Add experimental Playwright Electron readiness detection. Done.
- Add development-mode Electron launch through Playwright Electron inside Xvfb. Done as an experimental spike.
- Add selector, test id, role/name, label, placeholder, text, press, assert, and renderer screenshot actions. Done.
- Expose experimental Electron APIs through core, HTTP, and MCP. Done.
- Add a minimal sample Electron app and `smoke:electron-driver`. Done.
- Keep screenshot/X11 fallback available. Done.
- Explore packaged Electron app and CDP connection workflows. Planned.
- Add richer multi-window driver routing. Planned.

## v0.2 Driver Router

- Add a high-level router for browser, Tauri, Electron, native, and unknown app kinds. Done as an MVP.
- Return explicit route decisions with `selectedDriver`, `semantic`, `fallbackUsed`, fallback reason, warnings, and errors. Done.
- Expose high-level `app_*` APIs through core, HTTP, and MCP while preserving driver-specific APIs. Done.
- Track routed app refs per session and clean them up on app close and session stop. Done.
- Add `smoke:driver-router` using the sample Vite app and browser semantic path. Done.
- Add richer multi-window and packaged-app routing policies. Planned.

## v0.2 Visual QA Assertions

- Add lightweight PNG screenshot diffing with `pngjs` and `pixelmatch`. Done as an MVP.
- Support full-image and region comparison. Done.
- Add `visualCompare`, `visualAssertChanged`, and `visualAssertSimilar` through core, HTTP, and MCP. Done.
- Generate reviewable diff PNG artifacts under `visual-diffs/`. Done.
- Keep evidence artifacts tied to assertions in `visual-assertions.jsonl`, `report.md`, and annotation handoff summaries. Done.
- Add `smoke:visual-qa` and wire annotation repair smoke through Visual QA. Done.
- Add local visual baselines with save/list/compare APIs. Done.
- Add annotation-to-region assertions and change containment checks. Done.
- Add geometry-only overlap helpers for known rectangles. Done.
- Add `smoke:visual-baseline`. Done.
- Add DOM-bounding-box-assisted overlap workflows. Planned.

## v0.2 noVNC Live Observer

- Add optional live observer mode. Done as an experimental MVP.
- Detect `x11vnc`, `novnc_proxy`, `websockify`, and noVNC web root readiness. Done.
- Start/list/stop live observers through core, HTTP, MCP, and CLI. Done.
- Bind observers to `127.0.0.1` by default and reject non-local hosts in the MVP. Done.
- Stop observer processes during `stopSession`. Done.
- Add `smoke:observer` with honest pass/skip behavior. Done.
- Add optional install helper flag for observer packages. Done.
- Add richer view permissions and authenticated remote observer workflows. Planned.

## Future Experimental Wayland Backend

- Explore isolated Wayland session support.
- Keep Xvfb as the stable Linux-first backend until Wayland support is mature.
