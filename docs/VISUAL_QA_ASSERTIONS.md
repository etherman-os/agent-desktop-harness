# Visual QA Assertions

Visual QA assertions compare PNG evidence screenshots and record before/after proof in the session evidence directory.

They complement screenshots and Visual Annotation Handoff: screenshots show what happened, annotations show where to look, and Visual QA records measurable pixel change plus an optional diff PNG.

## What It Provides

- `visualCompare`: measure pixel differences between two PNG artifacts.
- `visualAssertChanged`: pass when a full image or region changed by at least `minDiffPixelRatio`.
- `visualAssertSimilar`: pass when a full image or region stays within `maxDiffPixelRatio`.
- `compareVisualBaseline`: compare a screenshot with a named local baseline.
- `visualAssertAnnotationChanged`: derive the region from a rectangle annotation and assert it changed.
- `visualAssertAnnotationSimilar`: derive the region from a rectangle annotation and assert it stayed similar.
- `visualAssertChangeContained`: verify that diff pixels are contained inside expected rectangles.
- Optional diff PNG artifacts under `visual-diffs/`.
- One JSONL result per comparison in `visual-assertions.jsonl`.
- Visual QA summaries in `report.md` and, when annotations exist, `visual-handoff.md`.

## Artifact Layout

```text
.desktop-harness/
  sessions/
    <sessionId>/
      screenshots/
      annotations/
      visual-diffs/
        diff_001-before-after.png
      visual-assertions.jsonl
      visual-handoff.md
      report.md
  baselines/
    smoke/
      sample-vite-clean.png
    baselines.jsonl
```

## Compare Vs Assert

Use `visualCompare` when the agent needs metrics and a diff artifact without deciding pass/fail.

Use `visualAssertChanged` when a repair should visibly change a known area, such as an annotated bug region.

Use `visualAssertSimilar` when a UI should remain stable within a tolerated amount of pixel noise.

Use `compareVisualBaseline` when the current screenshot should be checked against a named local reference image.

Use `visualAssertChangeContained` when a repair should only affect known rectangles. It counts diff pixels inside and outside the allowed rectangles; it does not infer UI element boundaries.

## Full Image Vs Region

Full-image comparison is useful for broad before/after evidence. Region comparison is better when browser chrome, timestamps, blinking cursors, animations, or unrelated UI changes would make a full screenshot noisy.

Regions use original screenshot pixel coordinates:

```json
{
  "x": 620,
  "y": 240,
  "width": 180,
  "height": 100
}
```

## HTTP Examples

Compare two screenshots and create a diff PNG:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/compare \
  -H "Content-Type: application/json" \
  -d '{
    "beforePath": "screenshots/0001-before.png",
    "afterPath": "screenshots/0002-after.png",
    "label": "before-after",
    "createDiffImage": true,
    "threshold": 0.1
  }'
```

Assert that an annotated region changed:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/assert-changed \
  -H "Content-Type: application/json" \
  -d '{
    "beforePath": "screenshots/0001-before.png",
    "afterPath": "screenshots/0002-after.png",
    "label": "annotated-region-change",
    "region": { "x": 620, "y": 240, "width": 180, "height": 100 },
    "minDiffPixelRatio": 0.01,
    "createDiffImage": true
  }'
```

Assert that two screenshots are similar:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/assert-similar \
  -H "Content-Type: application/json" \
  -d '{
    "beforePath": "screenshots/0001-before.png",
    "afterPath": "screenshots/0002-after.png",
    "maxDiffPixelRatio": 0.005
  }'
```

List recorded visual assertions:

```bash
curl http://127.0.0.1:7341/sessions/<sessionId>/visual/assertions
```

Save and compare a local visual baseline:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/baselines \
  -H "Content-Type: application/json" \
  -d '{
    "screenshotPath": "screenshots/0001-clean.png",
    "name": "sample-vite-clean",
    "suite": "smoke",
    "overwrite": true
  }'

curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/compare-baseline \
  -H "Content-Type: application/json" \
  -d '{
    "screenshotPath": "screenshots/0002-current.png",
    "baselineName": "sample-vite-clean",
    "suite": "smoke",
    "maxDiffPixelRatio": 0.01,
    "createDiffImage": true
  }'
```

Assert an annotation-derived region changed:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/assert-annotation-changed \
  -H "Content-Type: application/json" \
  -d '{
    "annotationId": "ann_001",
    "afterPath": "screenshots/0002-after.png",
    "padding": 4,
    "minDiffPixelRatio": 0.01,
    "createDiffImage": true
  }'
```

Assert changes are contained inside expected rectangles:

```bash
curl -X POST http://127.0.0.1:7341/sessions/<sessionId>/visual/assert-change-contained \
  -H "Content-Type: application/json" \
  -d '{
    "beforePath": "screenshots/0001-before.png",
    "afterPath": "screenshots/0002-after.png",
    "allowedRegions": [
      { "x": 620, "y": 240, "width": 180, "height": 100 }
    ],
    "maxOutsideDiffPixelRatio": 0.001,
    "createDiffImage": true
  }'
```

Fetch a diff image:

```bash
curl http://127.0.0.1:7341/sessions/<sessionId>/visual/diffs/diff_001-before-after.png \
  --output diff.png
```

## MCP Examples

Compare:

```json
{
  "sessionId": "session-id",
  "beforePath": "screenshots/0001-before.png",
  "afterPath": "screenshots/0002-after.png",
  "label": "before-after",
  "createDiffImage": true
}
```

Assert changed:

```json
{
  "sessionId": "session-id",
  "beforePath": "screenshots/0001-before.png",
  "afterPath": "screenshots/0002-after.png",
  "region": { "x": 620, "y": 240, "width": 180, "height": 100 },
  "minDiffPixelRatio": 0.01
}
```

Compare baseline:

```json
{
  "sessionId": "session-id",
  "screenshotPath": "screenshots/0002-current.png",
  "baselineName": "sample-vite-clean",
  "suite": "smoke",
  "createDiffImage": true
}
```

Annotation changed:

```json
{
  "sessionId": "session-id",
  "annotationId": "ann_001",
  "afterPath": "screenshots/0002-after.png",
  "padding": 4,
  "minDiffPixelRatio": 0.01
}
```

MCP returns paths and metrics, not binary image data.

## Smoke Test

Run:

```bash
pnpm smoke:visual-qa
pnpm smoke:visual-baseline
```

The smoke starts the sample Vite app, opens it through the driver router browser semantic path, captures before/after screenshots, creates a diff PNG, runs `visualAssertChanged`, checks `visual-assertions.jsonl`, verifies that `report.md` includes Visual QA, and cleans up.

`pnpm smoke:visual-baseline` verifies save/list/compare baseline behavior and report summaries.

`pnpm smoke:annotation-repair` also uses Visual QA for its before/after repair evidence, including annotation-derived region assertions.

## Security And Path Rules

- Visual QA accepts PNG evidence paths.
- Relative paths are resolved inside the session evidence directory.
- Absolute paths are allowed only when they are inside the session evidence directory.
- Path traversal is rejected.
- Diff serving is limited to files under `visual-diffs/`.
- Baselines are written only under `.desktop-harness/baselines/`.

## Limitations

- PNG only in the MVP.
- No OCR.
- No layout semantics or automatic overlap detection yet.
- Region overlap helpers only compare known rectangles; they do not detect elements from pixels.
- Images must have identical dimensions; the MVP does not resize.
- Diff thresholds may need tuning for animations, caret blinking, or antialiasing.
