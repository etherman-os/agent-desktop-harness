# Visual Annotation Handoff

Visual Annotation Handoff lets a human mark the exact problem area on a harness screenshot and turn that mark into evidence an agent can read.

The goal is to solve a common GUI QA problem: a developer can see the broken sprite, overlap, route, modal, or layout area, but it is hard to describe precisely in words. The harness keeps the original screenshot, stores structured annotation coordinates, saves a crop when the browser UI provides one, and regenerates `visual-handoff.md`.

## Current MVP

- Rectangle annotation is the supported drawing interaction.
- Coordinates are stored in original screenshot pixel coordinates.
- Crop PNGs are generated client-side by the local annotation UI.
- Arrow and note shapes are present in the type model for future expansion, but the built-in UI focuses on rectangles.
- The feature is screenshot-based and does not require the future semantic browser driver.

## Artifact Layout

```text
.desktop-harness/
  sessions/
    <sessionId>/
      screenshots/
        0003-game-bug.png
      annotations/
        ann_001-crop.png
      annotations.jsonl
      visual-handoff.md
```

Each saved annotation appends one JSON object to `annotations.jsonl`. `visual-handoff.md` is regenerated after each annotation.

## Human Workflow

1. Start the HTTP server.
2. Start a session and launch the game or app.
3. Capture a screenshot, for example with label `game-bug`.
4. Open `/sessions/<sessionId>/annotate`.
5. Draw a rectangle around the broken area.
6. Write a note such as `Player clips into this platform.`
7. Save the annotation.
8. Give `visual-handoff.md` to the agent.
9. The agent makes a targeted fix.
10. The agent reruns the app through the harness and captures an after screenshot.

Generate the local URL with:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- annotate-url --session <sessionId>
```

With a preferred screenshot:

```sh
pnpm --filter @agent-desktop-harness/cli dev -- annotate-url \
  --session <sessionId> \
  --screenshot 0003-game-bug.png
```

## Agent Prompt

```txt
Use Agent Desktop Harness evidence for this session.
Read visual-handoff.md and inspect the referenced screenshot/crop.
Fix the UI/game issue described in the human annotation.
After making the fix, rerun the app, capture a new screenshot, and compare evidence.
```

A ready-to-copy prompt template is available at:

```text
docs/prompts/ANNOTATION_REPAIR_AGENT_PROMPT.md
```

## Synthetic Repair Demo

Run:

```sh
pnpm smoke:annotation-repair
```

The smoke starts the sample Vite app in broken mode:

```text
http://127.0.0.1:5180/?demoBug=overlap
```

It captures a before screenshot, creates a synthetic rectangle annotation with the same HTTP API used by the annotation UI, verifies `annotations.jsonl`, the crop PNG, and `visual-handoff.md`, then navigates the browser to:

```text
http://127.0.0.1:5180/?demoBug=fixed
```

Finally it captures an after screenshot and verifies that before/after screenshots differ.

This smoke proves the visual handoff pipeline. It does not claim that an autonomous repair agent edited code during the smoke.

## HTTP Routes

```text
GET  /sessions/:sessionId/screenshots
GET  /sessions/:sessionId/screenshots/:fileName
GET  /sessions/:sessionId/annotations
POST /sessions/:sessionId/annotations
GET  /sessions/:sessionId/annotations/:fileName
GET  /sessions/:sessionId/visual-handoff
GET  /sessions/:sessionId/annotate
```

Create an annotation:

```sh
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/annotations \
  -H "Content-Type: application/json" \
  -d '{
    "screenshotFileName": "0003-game-bug.png",
    "type": "rectangle",
    "x": 618,
    "y": 244,
    "width": 188,
    "height": 96,
    "note": "The player sprite clips into the platform here.",
    "color": "#ff0000"
  }'
```

Read the handoff:

```sh
curl http://127.0.0.1:7341/sessions/<sessionId>/visual-handoff
```

## MCP Tools

```text
desktop_list_screenshots
desktop_create_annotation
desktop_list_annotations
desktop_get_visual_handoff
```

MCP tools return JSON metadata and paths. They do not stream binary screenshot data in the current MVP.

## Security Notes

- The HTTP server binds to `127.0.0.1` by default.
- Screenshot and annotation file names are sanitized and path traversal is rejected.
- Only PNG screenshot and annotation image files are served.
- Crop data must decode to PNG bytes before it is saved.
- Evidence may contain private UI data. Treat `.desktop-harness/` as sensitive.

## Future Work

- Arrow drawing in the built-in UI.
- Freehand marks.
- Multiple screenshot comparison view.
- Annotation-aware recheck flow.
- Semantic browser driver integration for DOM-backed element targeting.
