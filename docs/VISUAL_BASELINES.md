# Visual Baselines

Visual baselines are local reference PNGs for lightweight GUI regression checks. They are useful when an agent should prove that the current screenshot still matches a known clean state, or that a targeted repair changed only the expected area.

Baselines build on Visual QA screenshot diffing. They do not replace direct before/after comparisons; they add a named reference image that can be reused across runs on the same machine.

## Storage

Baselines are stored under the local harness artifact directory:

```text
.desktop-harness/
  baselines/
    <suite>/
      <baselineName>.png
    baselines.jsonl
```

The default suite is `default`. Baseline names and suite names are sanitized before they become file paths. Path traversal is rejected.

`.desktop-harness/` is local evidence and is not intended to be committed by default. Treat it as sensitive because screenshots can contain private UI data.

## Workflow

1. Start a harness session.
2. Capture a clean PNG screenshot.
3. Save it as a named baseline.
4. Capture a current PNG screenshot later.
5. Compare the current screenshot to the named baseline.
6. Inspect `visual-assertions.jsonl`, `report.md`, and any diff PNG under `visual-diffs/`.

## HTTP Examples

Save a session screenshot as a baseline:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/baselines \
  -H "Content-Type: application/json" \
  -d '{
    "screenshotPath": "screenshots/0001-clean.png",
    "name": "sample-vite-clean",
    "suite": "smoke",
    "overwrite": true
  }'
```

List baselines:

```bash
curl 'http://127.0.0.1:7341/sessions/<sessionId>/visual/baselines?suite=smoke'
```

Compare a current screenshot to a baseline:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/compare-baseline \
  -H "Content-Type: application/json" \
  -d '{
    "screenshotPath": "screenshots/0002-current.png",
    "baselineName": "sample-vite-clean",
    "suite": "smoke",
    "label": "clean-regression",
    "maxDiffPixelRatio": 0.01,
    "createDiffImage": true
  }'
```

## MCP Tools

- `visual_save_baseline`
- `visual_list_baselines`
- `visual_compare_baseline`

MCP returns paths and metrics. It does not return binary PNG data.

## Annotation And Containment Checks

When a human annotation identifies the expected change area, use annotation-aware assertions:

- `visual_assert_annotation_changed`
- `visual_assert_annotation_similar`
- `visual_assert_change_contained`

`visual_assert_change_contained` is pixel containment only. It counts diff pixels inside allowed rectangles and outside them. It does not detect UI elements automatically.

## Smoke Test

Run:

```bash
pnpm smoke:visual-baseline
```

The smoke opens the sample Vite app through the driver router browser path, saves a clean screenshot baseline, compares the same screenshot to the baseline, changes the UI through semantic actions, compares the changed screenshot to the baseline, verifies the diff artifact and report summary, and cleans up.

## Limits

- PNG only.
- Screenshot dimensions must match.
- No OCR.
- No semantic layout detection.
- Animations, timestamps, browser chrome, and caret blinking can affect pixel diffs.
- Prefer browser-content screenshots when page-level visual state matters; use desktop screenshots when native window chrome or full desktop state matters.
