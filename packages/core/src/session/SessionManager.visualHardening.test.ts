import test from "node:test";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";
import { DisplayAllocator } from "./displayAllocator.js";
import { SessionManager } from "./SessionManager.js";
import type { XvfbDisplayOptions } from "../display/XvfbDisplay.js";
import { EvidenceStore } from "../evidence/EvidenceStore.js";

test("SessionManager saves, lists, and compares visual baselines", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-baseline-"));
  const manager = makeManager();

  try {
    const session = await manager.createSession({
      workspacePath
    });
    const beforePath = join(session.evidencePath, "screenshots", "0001-before.png");
    const afterPath = join(session.evidencePath, "screenshots", "0002-after.png");
    await writePng(beforePath, 2, 2, [[0, 0, 0, 255]]);
    await writePng(afterPath, 2, 2, [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255]
    ]);

    const baseline = await manager.saveVisualBaseline(session.id, {
      screenshotPath: "screenshots/0001-before.png",
      name: "Sample Vite Clean",
      suite: "Smoke",
      overwrite: true,
      metadata: {
        purpose: "unit-test"
      }
    });
    assert.equal(baseline.name, "sample-vite-clean");
    assert.equal(baseline.suite, "smoke");
    await stat(baseline.path);

    const baselines = await manager.listVisualBaselines(session.id, {
      suite: "smoke"
    });
    assert.equal(baselines.length, 1);
    assert.equal(baselines[0]?.metadata?.purpose, "unit-test");

    const same = await manager.compareVisualBaseline(session.id, {
      screenshotPath: "screenshots/0001-before.png",
      baselineName: "sample-vite-clean",
      suite: "smoke",
      maxDiffPixelRatio: 0,
      createDiffImage: true
    });
    assert.equal(same.kind, "compare-baseline");
    assert.equal(same.passed, true);
    assert.equal(same.diffPixelRatio, 0);
    assert.ok(same.diffPath);

    const changed = await manager.compareVisualBaseline(session.id, {
      screenshotPath: "screenshots/0002-after.png",
      baselineName: "sample-vite-clean",
      suite: "smoke",
      createDiffImage: true
    });
    assert.equal(changed.diffPixelRatio, 0.25);

    await new EvidenceStore().writeReport(session);
    const report = await readFile(join(session.evidencePath, "report.md"), "utf8");
    assert.match(report, /compare-baseline/);
    assert.match(report, /baseline=smoke\/sample-vite-clean/);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("SessionManager derives annotation regions and runs annotation assertions", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-ann-region-"));
  const manager = makeManager();

  try {
    const session = await manager.createSession({
      workspacePath
    });
    const beforePath = join(session.evidencePath, "screenshots", "0001-before.png");
    const afterPath = join(session.evidencePath, "screenshots", "0002-after.png");
    await writePng(beforePath, 2, 2, [[0, 0, 0, 255]]);
    await writePng(afterPath, 2, 2, [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255]
    ]);

    const annotation = await manager.createAnnotation(session.id, {
      screenshotFileName: "0001-before.png",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      note: "Expected changed area."
    });

    const region = await manager.getAnnotationRegion(session.id, {
      annotationId: annotation.id,
      padding: 1
    });
    assert.deepEqual(region.region, {
      x: 0,
      y: 0,
      width: 2,
      height: 2
    });

    const changed = await manager.visualAssertAnnotationChanged(session.id, {
      annotationId: annotation.id,
      afterPath: "screenshots/0002-after.png",
      minDiffPixelRatio: 0.01,
      createDiffImage: true
    });
    assert.equal(changed.kind, "assert-annotation-changed");
    assert.equal(changed.annotationId, annotation.id);
    assert.equal(changed.passed, true);

    const arrow = await manager.createAnnotation(session.id, {
      screenshotFileName: "0001-before.png",
      type: "arrow",
      x: 0,
      y: 0,
      x2: 1,
      y2: 1,
      note: "Arrow is unsupported for region extraction."
    });
    await assert.rejects(
      async () =>
        await manager.getAnnotationRegion(session.id, {
          annotationId: arrow.id
        }),
      /not a rectangle/
    );
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("SessionManager counts inside and outside pixels for containment assertions", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-contained-"));
  const manager = makeManager();

  try {
    const session = await manager.createSession({
      workspacePath
    });
    const beforePath = join(session.evidencePath, "screenshots", "0001-before.png");
    const afterPath = join(session.evidencePath, "screenshots", "0002-after.png");
    await writePng(beforePath, 3, 1, [[0, 0, 0, 255]]);
    await writePng(afterPath, 3, 1, [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255]
    ]);

    const result = await manager.visualAssertChangeContained(session.id, {
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      allowedRegions: [
        {
          x: 1,
          y: 0,
          width: 1,
          height: 1
        }
      ],
      maxOutsideDiffPixelRatio: 0,
      minInsideDiffPixelRatio: 1,
      createDiffImage: true
    });

    assert.equal(result.kind, "assert-change-contained");
    assert.equal(result.insideComparedPixels, 1);
    assert.equal(result.insideDiffPixels, 1);
    assert.equal(result.outsideComparedPixels, 2);
    assert.equal(result.outsideDiffPixels, 0);
    assert.equal(result.containmentPassed, true);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

function makeManager(): SessionManager {
  return new SessionManager({
    displayAllocator: new DisplayAllocator({
      min: 191,
      max: 191,
      isDisplayInUse: () => false
    }),
    displayBackend: {
      start: async ({ display, width, height, depth }: XvfbDisplayOptions) => ({
        display,
        width,
        height,
        depth,
        xvfbProcess: { pid: 1000 } as ChildProcess,
        warnings: []
      })
    } as never
  });
}

async function writePng(
  path: string,
  width: number,
  height: number,
  pixels: readonly (readonly [number, number, number, number])[]
): Promise<void> {
  const png = new PNG({ width, height });
  const fallback = pixels[0] ?? [0, 0, 0, 255];
  for (let index = 0; index < width * height; index += 1) {
    const pixel = pixels[index] ?? fallback;
    const offset = index * 4;
    png.data[offset] = pixel[0];
    png.data[offset + 1] = pixel[1];
    png.data[offset + 2] = pixel[2];
    png.data[offset + 3] = pixel[3];
  }
  await writeFile(path, PNG.sync.write(png));
}
