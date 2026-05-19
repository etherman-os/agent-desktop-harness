# Live Observer

The live observer is an optional browser view for an isolated Xvfb session. It lets a human watch what the agent sees without giving the harness access to the user's real desktop.

The stack is:

```text
Xvfb isolated display
  -> x11vnc bound to the session DISPLAY
  -> novnc_proxy or websockify/noVNC
  -> localhost browser URL
```

The observer is not required for normal harness operation. Screenshots, semantic drivers, Visual Annotation Handoff, and Visual QA continue to work without it.

For the broader workflow that combines semantic drivers, annotation, Visual QA, and the observer, see [Agent GUI QA Cockpit](AGENT_GUI_QA_COCKPIT.md).

## Install Dependencies

On Ubuntu, install the optional observer packages:

```sh
sudo apt install -y x11vnc novnc websockify
```

Or use the helper:

```sh
./scripts/install-ubuntu-deps.sh --with-observer
```

Package names vary by distribution. The doctor reports observer readiness separately from required runtime dependencies:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- doctor
pnpm --filter @agent-desktop-harness/cli dev -- observer-status
```

Missing observer dependencies do not make the general doctor status fail.

## HTTP Workflow

Start the HTTP server:

```sh
pnpm --filter @agent-desktop-harness/http-server dev
```

Create a session:

```sh
curl -X POST http://127.0.0.1:7341/sessions \
  -H "Content-Type: application/json" \
  -d '{"width":1440,"height":900}'
```

Start a live observer:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/observers \
  -H "Content-Type: application/json" \
  -d '{"viewOnly":true}'
```

The response includes a local URL similar to:

```text
http://127.0.0.1:6081/vnc.html?autoconnect=1&resize=scale&view_only=1
```

List and stop observers:

```sh
curl http://127.0.0.1:7341/sessions/<sessionId>/observers
curl -X DELETE http://127.0.0.1:7341/sessions/<sessionId>/observers/<observerId>
```

Stopping the session also stops live observer processes.

## MCP Tools

The MCP server exposes:

- `observer_get_status`
- `observer_start`
- `observer_list`
- `observer_stop`

`observer_start` returns URL metadata. It does not stream VNC or image data through MCP.

## Smoke Test

Run:

```sh
pnpm smoke:observer
```

The smoke checks observer dependencies, starts an isolated session, starts the observer, verifies that the noVNC URL responds with HTML, then stops the observer and session. If dependencies are missing, it exits with a clear skipped result instead of pretending success.

## Annotation UI Workflow

The live observer helps during long GUI workflows:

1. Start an isolated session.
2. Start the observer and open the returned URL.
3. Let the agent interact with the app through semantic or desktop tools.
4. Capture a screenshot.
5. Open `/sessions/<sessionId>/annotate` and draw a rectangle on the screenshot.
6. Use Visual QA baselines, annotation assertions, or change containment to verify the result.

The observer is for watching the live Xvfb session. The annotation UI still works from saved screenshots and evidence files.

## Security Notes

- The observer is optional.
- It binds to `127.0.0.1` by default.
- The MVP rejects non-local hosts. Use an SSH tunnel for remote viewing.
- `viewOnly` defaults to `true`.
- Live views and screenshots may expose sensitive data.
- If a password is provided, raw password text is not written to action logs or tool results.
- Stop observers after use, or stop the whole session.

Example SSH tunnel:

```sh
ssh -L 6081:127.0.0.1:6081 user@host
```

Then open `http://127.0.0.1:6081/vnc.html?autoconnect=1&resize=scale&view_only=1` locally.

## Troubleshooting

- `x11vnc is missing`: install `x11vnc`.
- `novnc_proxy or websockify is missing`: install `novnc` and `websockify`.
- `noVNC web root was not found`: install the noVNC package or set `AGENT_DESKTOP_HARNESS_NOVNC_WEB_ROOT` to a directory containing `vnc.html`.
- Port already in use: omit explicit ports and let the harness allocate them, or choose free local ports.
- Black screen: confirm the session is still running and the app has opened a window on the harness display.
- URL stops responding: the session or observer process may have been stopped.

## Limitations

- Linux/X11 only.
- noVNC is not vendored.
- No authentication layer is added to the main HTTP server.
- The observer does not replace screenshots, evidence, or Visual QA assertions.
- Remote use should be done through SSH tunneling, not by binding observer services to public interfaces.
