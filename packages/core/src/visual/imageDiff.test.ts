import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";
import { comparePngImages, comparePngImagesWithContainment } from "./imageDiff.js";

test("comparePngImages computes full-image PNG diffs", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-visual-diff-"));

  try {
    const beforePath = join(tempRoot, "before.png");
    const afterPath = join(tempRoot, "after.png");
    const diffPath = join(tempRoot, "diff.png");
    await writePng(beforePath, 2, 2, [[0, 0, 0, 255]]);
    await writePng(afterPath, 2, 2, [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ]);

    const result = await comparePngImages({
      beforePath,
      afterPath,
      diffPath,
      threshold: 0.1,
    });

    assert.equal(result.comparedPixels, 4);
    assert.equal(result.diffPixels, 1);
    assert.equal(result.diffPixelRatio, 0.25);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("comparePngImages supports region comparison", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-visual-region-"));

  try {
    const beforePath = join(tempRoot, "before.png");
    const afterPath = join(tempRoot, "after.png");
    await writePng(beforePath, 2, 2, [[0, 0, 0, 255]]);
    await writePng(afterPath, 2, 2, [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ]);

    const result = await comparePngImages({
      beforePath,
      afterPath,
      region: {
        x: 1,
        y: 0,
        width: 1,
        height: 1,
      },
    });

    assert.equal(result.comparedPixels, 1);
    assert.equal(result.diffPixels, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("comparePngImages rejects dimension mismatches", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-visual-size-"));

  try {
    const beforePath = join(tempRoot, "before.png");
    const afterPath = join(tempRoot, "after.png");
    await writePng(beforePath, 2, 2, [[0, 0, 0, 255]]);
    await writePng(afterPath, 1, 1, [[0, 0, 0, 255]]);

    await assert.rejects(
      async () =>
        await comparePngImages({
          beforePath,
          afterPath,
        }),
      /Image dimensions differ/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("comparePngImagesWithContainment counts inside and outside differences", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-visual-contained-"));

  try {
    const beforePath = join(tempRoot, "before.png");
    const afterPath = join(tempRoot, "after.png");
    await writePng(beforePath, 3, 1, [[0, 0, 0, 255]]);
    await writePng(afterPath, 3, 1, [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);

    const result = await comparePngImagesWithContainment({
      beforePath,
      afterPath,
      allowedRegions: [
        {
          x: 1,
          y: 0,
          width: 1,
          height: 1,
        },
      ],
    });

    assert.equal(result.diffPixels, 2);
    assert.equal(result.insideComparedPixels, 1);
    assert.equal(result.insideDiffPixels, 1);
    assert.equal(result.outsideComparedPixels, 2);
    assert.equal(result.outsideDiffPixels, 1);
    assert.equal(result.outsideDiffPixelRatio, 0.5);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function writePng(
  path: string,
  width: number,
  height: number,
  pixels: readonly (readonly [number, number, number, number])[],
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
