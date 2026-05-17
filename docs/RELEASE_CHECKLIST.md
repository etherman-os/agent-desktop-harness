# v0.1 Release Checklist

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

## Release Notes Checks

- [ ] Mention Linux/X11/Xvfb-first scope.
- [ ] Mention coordinate-based X11 fallback limitations.
- [ ] Mention that semantic browser, Tauri, and Electron drivers are planned.
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
