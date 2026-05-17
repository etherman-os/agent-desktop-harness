# Security

`agent-desktop-harness` is designed for isolated GUI QA, not unrestricted desktop automation.

v0.1 is local developer tooling. It is intended to run on a developer-controlled machine or CI worker where the caller already has permission to launch the target app and inspect generated evidence.

## Real Desktop Control Is Disabled by Default

The v0.1 target is Xvfb sessions created for the harness. The harness must not send input to the user's real desktop. This boundary reduces the risk of accidental clicks, data exposure, credential leakage, and destructive actions in unrelated applications.

## Command Allowlist

Sessions should launch only commands that policy allows. MCP tools and HTTP routes must not accept arbitrary shell strings and execute them directly.

The core launch model uses structured commands:

```json
{
  "command": "pnpm",
  "args": ["dev"]
}
```

Shell strings are intentionally not accepted:

```sh
pnpm dev && arbitrary-command
```

`HarnessPolicy.allowedCommands` can restrict launch commands to an explicit allowlist. If no allowlist is provided, app launch is rejected unless `allowUnlistedCommandsForLocalDevelopment` is explicitly set to `true`. That flag is unsafe for general use and is intended only for local development experiments.

## Workspace Isolation

Each session should run inside an explicit workspace root. Evidence should be written to a predictable session directory. The harness should avoid reading or writing outside the configured workspace and evidence directories unless explicitly allowed.

## No Arbitrary Shell Execution via MCP

MCP clients should receive typed GUI QA tools, not a general shell. Shell execution belongs to the calling coding agent's own environment and approval model, not this harness.

The current core implementation uses `child_process.spawn(command, args, { shell: false })` for app launch.

The MCP server exposes `desktop_launch_app` with structured `{ command, args, cwd, env }` input only. The HTTP server exposes `POST /sessions/:sessionId/launch` with the same structured model. Both delegate policy checks and process launch to the core `SessionManager`.

## HTTP Local Binding

The HTTP server is intended for local agent orchestration. It binds to `127.0.0.1` by default and should not be exposed to the public internet. CORS is not enabled by default.

Do not run the HTTP server on `0.0.0.0` or behind a public proxy without adding an authentication and authorization layer first.

## MCP Client Trust

MCP tools can launch allowlisted local commands, send input to the isolated Xvfb display, and read evidence paths. Use the MCP server only with trusted local clients and trusted agent workflows.

The MCP server should write protocol data to stdout only. Diagnostic logs should go to stderr so MCP clients do not receive malformed protocol messages.

## Screenshot and Evidence Sensitivity

Screenshots and action logs may contain source code, credentials, private URLs, tokens, customer data, or local file paths. Evidence storage must be treated as sensitive output.

Current safeguards:

- Typed secret redaction support for input text. `typeText({ secret: true })` records only a redacted marker and text length.
- Clear evidence directory paths.
- Session metadata that records policy configuration.
- User-controlled retention and cleanup.

Secret text redaction only applies when the caller sets `secret: true`. If `secret` is omitted or false, typed text may appear in action logs and tool results.

## Input Targeting

Core input actions use `xdotool` with the session `DISPLAY` environment variable. They are scoped to isolated Xvfb sessions and must not target the user's host desktop.

Text input is passed as process arguments, not through shell interpolation. Secret text must be sent with `secret: true` so the action log does not include raw text.

## Network Policy Future Plan

Future versions should support network policy controls for launched sessions. Potential controls include offline mode, allowlisted hosts, blocked hosts, and per-session network metadata.

## Human Approval Gates

Dangerous actions should support human approval gates before execution. Examples include launching non-allowlisted commands, enabling real desktop control in a future version, attaching to external processes, or using broader network access.
