# Sample Vite App

This is a minimal local GUI target for `agent-desktop-harness` smoke verification.

The app exposes stable controls for X11 fallback testing:

- Heading: `Agent Desktop Harness Demo`
- Status badge that starts as `Status: idle`
- Message input with placeholder `Type a message`
- `Save message` button
- `Open details` button
- Details panel that shows `Details panel is open`

## Run Locally

```sh
pnpm --filter @agent-desktop-harness/sample-vite-app dev -- --host 127.0.0.1 --port 5179 --strictPort
```

## Harness Smoke Tests

From the repository root:

```sh
pnpm smoke:vite:http
pnpm smoke:vite:mcp
pnpm smoke:annotation-repair
```

These smokes launch the app inside an isolated Xvfb session through a graphical browser and interact with it through the existing X11 fallback layer. They do not use the future semantic browser driver.

## Annotation Repair Demo

The app also includes a deliberate visual issue for handoff demos:

```text
/?demoBug=overlap
```

The corrected comparison mode is:

```text
/?demoBug=fixed
```

See [REPAIR_DEMO.md](REPAIR_DEMO.md) for the full workflow.
