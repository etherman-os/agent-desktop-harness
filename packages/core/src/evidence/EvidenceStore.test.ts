import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DesktopSession } from "../types.js";
import { EvidenceStore, assertSafePngFileName, parsePngBase64 } from "./EvidenceStore.js";

const tinyPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADgwGZVfZtNwAAAABJRU5ErkJggg==";

test("EvidenceStore creates session files and appends action logs", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-evidence-"));
  const store = new EvidenceStore();
  const session: DesktopSession = {
    id: "session-test",
    config: {
      workspacePath: tempRoot
    },
    driverKind: "unknown",
    status: "running",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    workspacePath: tempRoot,
    evidencePath: store.getSessionPath(tempRoot, "session-test"),
    display: ":90",
    displayNumber: 90,
    width: 1440,
    height: 900,
    depth: 24,
    processIds: {
      xvfb: 123,
      apps: []
    },
    warnings: []
  };

  try {
    await store.createSession(session);
    await store.appendAction(session, {
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: session.id,
      type: "session.created",
      status: "ok",
      details: {
        display: session.display
      }
    });

    const paths = store.getPaths(tempRoot, session.id);
    await stat(paths.sessionJsonPath);
    await stat(paths.screenshotsPath);

    const actions = await readFile(paths.actionsJsonlPath, "utf8");
    const [firstLine] = actions.trim().split("\n");
    assert.equal(JSON.parse(firstLine).type, "session.created");

    const screenshotPath = store.getScreenshotPath(session, 1, {
      label: "Initial State"
    });
    assert.equal(screenshotPath.endsWith("0001-initial-state.png"), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("EvidenceStore lists screenshots and creates visual annotations", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-annotations-"));
  const store = new EvidenceStore();
  const session = makeSession(tempRoot, store);

  try {
    await store.createSession(session);
    const paths = store.getPaths(tempRoot, session.id);
    const screenshotPath = join(paths.screenshotsPath, "0001-game-bug.png");
    await writeFile(screenshotPath, parsePngBase64(tinyPngDataUrl));
    await store.appendAction(session, {
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: session.id,
      type: "screenshot.captured",
      status: "ok",
      details: {
        path: screenshotPath,
        sequence: 1,
        label: "game-bug"
      }
    });

    const screenshots = await store.listScreenshots(session);
    assert.equal(screenshots.length, 1);
    assert.equal(screenshots[0]?.fileName, "0001-game-bug.png");
    assert.equal(screenshots[0]?.label, "game-bug");

    const annotation = await store.createAnnotation(session, {
      screenshotFileName: "0001-game-bug.png",
      type: "rectangle",
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      note: "Player clips into this platform.",
      color: "#ff0000",
      cropPngBase64: tinyPngDataUrl
    });

    assert.equal(annotation.id, "ann_001");
    assert.equal(annotation.cropPath?.endsWith("annotations/ann_001-crop.png"), true);
    assert.equal((await store.listAnnotations(session)).length, 1);

    const annotationsJsonl = await readFile(paths.annotationsJsonlPath, "utf8");
    assert.match(annotationsJsonl, /Player clips into this platform/);
    await stat(join(paths.annotationsPath, "ann_001-crop.png"));

    const handoff = await store.getVisualHandoff(session);
    assert.match(handoff.text, /# Visual Handoff/);
    assert.match(handoff.text, /## Recommended agent next steps/);
    assert.match(handoff.text, /Make a minimal targeted fix/);
    assert.match(handoff.text, /Annotation ann_001/);
    assert.match(handoff.text, /screenshots\/0001-game-bug\.png/);
    assert.match(handoff.text, /annotations\/ann_001-crop\.png/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("EvidenceStore appends visual assertions and includes them in reports", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-visual-assertions-"));
  const store = new EvidenceStore();
  const session = makeSession(tempRoot, store);

  try {
    await store.createSession(session);
    const paths = store.getPaths(tempRoot, session.id);
    const beforePath = join(paths.screenshotsPath, "0001-before.png");
    const afterPath = join(paths.screenshotsPath, "0002-after.png");
    const diffPath = await store.getNextVisualDiffPath(session, "before-after");
    await writeFile(beforePath, parsePngBase64(tinyPngDataUrl));
    await writeFile(afterPath, parsePngBase64(tinyPngDataUrl));
    await writeFile(diffPath, parsePngBase64(tinyPngDataUrl));

    await store.appendVisualAssertion(session, {
      sessionId: session.id,
      label: "before-after",
      kind: "assert-similar",
      beforePath,
      afterPath,
      diffPath,
      width: 1,
      height: 1,
      comparedPixels: 1,
      diffPixels: 0,
      diffPixelRatio: 0,
      threshold: 0.1,
      maxDiffPixelRatio: 0.01,
      passed: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      warnings: []
    });

    const assertions = await store.listVisualAssertions(session);
    assert.equal(assertions.length, 1);
    assert.equal(assertions[0]?.label, "before-after");
    assert.equal(diffPath.endsWith("visual-diffs/diff_001-before-after.png"), true);

    await store.writeReport(session);
    const report = await readFile(paths.reportPath, "utf8");
    assert.match(report, /## Visual QA/);
    assert.match(report, /label=before-after/);
    assert.match(report, /passed=true/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("EvidenceStore rejects traversal and invalid crop payloads", () => {
  assert.throws(
    () => assertSafePngFileName("../0001-bug.png", "screenshot file name"),
    /Invalid screenshot file name/
  );
  assert.throws(
    () => parsePngBase64("data:text/plain;base64,SGVsbG8="),
    /PNG data URL/
  );
  assert.throws(
    () => parsePngBase64("SGVsbG8="),
    /PNG image/
  );
});

test("EvidenceStore rejects visual QA path traversal", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-visual-paths-"));
  const store = new EvidenceStore();
  const session = makeSession(tempRoot, store);

  try {
    await store.createSession(session);
    assert.throws(
      () => store.resolveEvidencePath(session, "../outside.png"),
      /outside the session evidence directory/
    );
    assert.throws(
      () => store.resolveEvidencePath(session, "screenshots/not-png.jpg"),
      /PNG files/
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

function makeSession(tempRoot: string, store: EvidenceStore): DesktopSession {
  return {
    id: "session-test",
    config: {
      workspacePath: tempRoot
    },
    driverKind: "unknown",
    status: "running",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    workspacePath: tempRoot,
    evidencePath: store.getSessionPath(tempRoot, "session-test"),
    display: ":90",
    displayNumber: 90,
    width: 1440,
    height: 900,
    depth: 24,
    processIds: {
      xvfb: 123,
      apps: []
    },
    warnings: []
  };
}
