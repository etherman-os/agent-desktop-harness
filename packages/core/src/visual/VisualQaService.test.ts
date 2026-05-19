import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";
import { VisualQaService } from "./VisualQaService.js";

test("VisualQaService assert-changed passes and fails from diff ratio", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-visual-changed-"));
  const service = new VisualQaService();

  try {
    const beforePath = join(tempRoot, "before.png");
    const afterPath = join(tempRoot, "after.png");
    await writePng(beforePath, [false, false, false, false]);
    await writePng(afterPath, [true, false, false, false]);

    const pass = await service.compare({
      kind: "assert-changed",
      beforePath,
      afterPath,
      minDiffPixelRatio: 0.2
    });
    assert.equal(pass.passed, true);

    const fail = await service.compare({
      kind: "assert-changed",
      beforePath,
      afterPath,
      minDiffPixelRatio: 0.5
    });
    assert.equal(fail.passed, false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("VisualQaService assert-similar passes and fails from diff ratio", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-visual-similar-"));
  const service = new VisualQaService();

  try {
    const beforePath = join(tempRoot, "before.png");
    const afterPath = join(tempRoot, "after.png");
    await writePng(beforePath, [false, false, false, false]);
    await writePng(afterPath, [true, false, false, false]);

    const pass = await service.compare({
      kind: "assert-similar",
      beforePath,
      afterPath,
      maxDiffPixelRatio: 0.3
    });
    assert.equal(pass.passed, true);

    const fail = await service.compare({
      kind: "assert-similar",
      beforePath,
      afterPath,
      maxDiffPixelRatio: 0.1
    });
    assert.equal(fail.passed, false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function writePng(path: string, whitePixels: readonly boolean[]): Promise<void> {
  const png = new PNG({ width: 2, height: 2 });
  for (let index = 0; index < 4; index += 1) {
    const white = whitePixels[index] === true;
    const offset = index * 4;
    png.data[offset] = white ? 255 : 0;
    png.data[offset + 1] = white ? 255 : 0;
    png.data[offset + 2] = white ? 255 : 0;
    png.data[offset + 3] = 255;
  }
  await writeFile(path, PNG.sync.write(png));
}
