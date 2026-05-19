# Release Checklist

## v0.2 Required Checks

- [ ] `pnpm install`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm --filter @agent-desktop-harness/cli dev -- doctor`
- [ ] `pnpm smoke:x11`
- [ ] `pnpm smoke:http`
- [ ] `pnpm smoke:mcp`
- [ ] `pnpm smoke:vite:http`
- [ ] `pnpm smoke:vite:mcp`
- [ ] `pnpm smoke:annotation-repair`
- [ ] `pnpm smoke:browser-semantic`
- [ ] `pnpm smoke:electron-driver`
- [ ] `pnpm smoke:driver-router`
- [ ] `pnpm smoke:visual-qa`
- [ ] `pnpm smoke:visual-baseline`

## v0.2 Optional Checks

- [ ] `pnpm smoke:observer`
- [ ] `pnpm smoke:tauri-driver` with configured app env

Optional checks may skip honestly when local prerequisites are missing. `smoke:observer` requires `x11vnc`, noVNC, and websockify. `smoke:tauri-driver` requires a configured Tauri app environment for a full semantic run.

## v0.2 Documentation Checks

- [ ] README presents Agent Desktop Harness as a Linux-first GUI QA and visual handoff cockpit.
- [ ] README capability matrix matches the current smoke set.
- [ ] `docs/releases/v0.2.0.md` includes required and optional verification commands.
- [ ] `docs/AGENT_GUI_QA_COCKPIT.md` explains the end-to-end agent workflow.
- [ ] Driver Router, browser, Tauri, Electron, Visual QA, Visual Baselines, Visual Annotation Handoff, and Live Observer docs are cross-linked.
- [ ] Security docs mention local-only HTTP, local-only observer, trusted MCP clients, and sensitive evidence.
- [ ] Troubleshooting docs cover Xvfb, scrot, xdotool, wmctrl, browser, Electron, Tauri, Visual QA, noVNC observer, port conflicts, and cleanup.
- [ ] Known limitations are honest and do not overclaim production-grade Tauri/Electron/noVNC support.

## v0.2 Safety Checks

- [ ] HTTP defaults to `127.0.0.1`.
- [ ] Observer defaults to `127.0.0.1`.
- [ ] No arbitrary shell command API is exposed.
- [ ] Command allowlist behavior is documented.
- [ ] Secret typing and fill redaction behavior is documented.
- [ ] No real desktop control is enabled by default.
- [ ] noVNC remote access guidance recommends SSH tunneling, not public binds.
- [ ] No screenshots, visual diffs, baselines, or evidence artifacts are tracked accidentally.
- [ ] `.desktop-harness/` remains ignored.

## v0.2 Pre-Release Repository Checks

- [ ] Confirm license remains `Apache-2.0`.
- [ ] Confirm package metadata uses repository owner `etherman-os`.
- [ ] Confirm package metadata contains no placeholder license or repository values.
- [ ] Confirm no local absolute smoke paths are committed.
- [ ] Confirm no secrets or tokens are committed.
- [ ] Run all verification commands.
- [ ] Create v0.2.0 tag only after all checks pass.

## v0.1 Release Checklist

## Required Checks

- [ ] `pnpm install`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm --filter @agent-desktop-harness/cli dev -- doctor`
- [ ] `pnpm smoke:x11`
- [ ] `pnpm smoke:http`
- [ ] `pnpm smoke:mcp`
- [ ] `pnpm smoke:vite:http`
- [ ] `pnpm smoke:vite:mcp`
- [ ] `pnpm smoke:annotation-repair`

## Documentation Checks

- [ ] README quick start is accurate.
- [ ] Visual Annotation Handoff docs are accurate.
- [ ] MCP usage docs are accurate.
- [ ] Hermes HTTP workflow docs are accurate.
- [ ] Troubleshooting docs include dependency install.
- [ ] Known limitations are honest.
- [x] License status is clear before publishing: Apache-2.0.

## Safety Checks

- [ ] HTTP defaults to `127.0.0.1`.
- [ ] No arbitrary shell command API is exposed.
- [ ] Command allowlist behavior is documented.
- [ ] Secret typing redaction is documented.
- [ ] No real desktop control is enabled by default.
- [ ] No screenshots or evidence artifacts are committed accidentally.
- [ ] `.desktop-harness/` remains ignored.

## v0.1 Release Notes Checks

- [ ] Mention Linux/X11/Xvfb-first scope.
- [ ] Mention coordinate-based X11 fallback limitations.
- [ ] Mention that semantic browser, Tauri, and Electron drivers were planned after v0.1.
- [ ] Mention that Visual Annotation Handoff is rectangle-only in the MVP.
- [ ] Mention that annotation repair smoke proves handoff and verification, not autonomous code repair.

## Pre-Publish Repository Checks

- [x] Choose license: Apache-2.0.
- [x] Add LICENSE file.
- [x] Confirm package metadata uses `Apache-2.0`.
- [x] Replace repository owner placeholders with `etherman-os`.
- [ ] Ensure this is a standalone git repository.
- [ ] Confirm `.desktop-harness/` is ignored.
- [ ] Confirm no smoke screenshots or evidence are tracked.
- [ ] Confirm no local absolute paths are committed.
- [ ] Confirm no secrets or tokens are committed.
- [ ] Run all verification commands.
- [ ] Create v0.1.0 tag only after all checks pass.

## Repository Metadata

- [x] `README.md` quick start uses `https://github.com/etherman-os/agent-desktop-harness.git`.
- [x] Root `package.json` repository URL uses `git+https://github.com/etherman-os/agent-desktop-harness.git`.
- [x] Workspace package metadata uses the same repository URL with package directories.
