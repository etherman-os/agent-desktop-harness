# Contributing

Thanks for helping improve Agent Desktop Harness.

## Project Scope

This project is a Linux-first GUI QA and visual handoff harness for coding agents. The v0.1 scope is isolated Xvfb sessions, screenshots, input actions, window control, evidence artifacts, HTTP, MCP, CLI smoke workflows, and Visual Annotation Handoff.

Please avoid adding real-desktop control as default behavior. Real desktop control has a different risk profile and is intentionally outside the v0.1 default path.

## Development Setup

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

For real GUI verification on Ubuntu:

```sh
./scripts/install-ubuntu-deps.sh
pnpm --filter @agent-desktop-harness/cli dev -- doctor
pnpm smoke:x11
pnpm smoke:http
pnpm smoke:mcp
pnpm smoke:vite:http
pnpm smoke:vite:mcp
pnpm smoke:annotation-repair
```

The smoke commands require local Linux GUI dependencies and should not be added to normal unit test runs.

## Public Language

Public repo files, docs, comments, package names, and issue templates should be written in English.

## Safety Expectations

- Do not expose arbitrary shell execution through MCP or HTTP.
- Use structured command and argument arrays with `shell: false`.
- Preserve command allowlist behavior.
- Keep HTTP bound to `127.0.0.1` by default.
- Treat screenshots and evidence as sensitive output.
- Preserve secret text redaction when `secret: true`.
- Do not commit generated `.desktop-harness/` evidence.

## Driver Proposals

Driver work should fit the planned router model:

- browser: Playwright and accessibility tree;
- Tauri: `tauri-driver` / WebDriver;
- Electron: Playwright Electron or CDP;
- unknown/native: screenshot plus X11 fallback.

Open a driver request issue with the target platform, expected behavior, fallback expectations, and links to relevant framework docs.
