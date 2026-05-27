import { readFile, writeFile } from "node:fs/promises";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { ProcessError } from "../errors.js";
import type {
  ImageContainmentDiffOptions,
  ImageContainmentDiffResult,
  ImageDiffOptions,
  ImageDiffResult,
  ImageRegion,
} from "./visualTypes.js";

const DEFAULT_THRESHOLD = 0.1;

export async function comparePngImages(options: ImageDiffOptions): Promise<ImageDiffResult> {
  const threshold = normalizeThreshold(options.threshold);
  const before = await readPngImage(options.beforePath);
  const after = await readPngImage(options.afterPath);

  if (before.width !== after.width || before.height !== after.height) {
    throwDimensionMismatch(before, after);
  }

  const region = normalizeImageRegion(options.region, before.width, before.height);
  const beforeRegion = copyRegion(before, region);
  const afterRegion = copyRegion(after, region);
  const diff = new PNG({
    width: region.width,
    height: region.height,
  });
  const diffPixels = pixelmatch(
    beforeRegion.data,
    afterRegion.data,
    diff.data,
    region.width,
    region.height,
    {
      threshold,
    },
  );
  const comparedPixels = region.width * region.height;

  if (options.diffPath) {
    await writeFile(options.diffPath, PNG.sync.write(diff));
  }

  return {
    width: region.width,
    height: region.height,
    comparedPixels,
    diffPixels,
    diffPixelRatio: comparedPixels > 0 ? diffPixels / comparedPixels : 0,
    threshold,
    warnings: [],
  };
}

export async function comparePngImagesWithContainment(
  options: ImageContainmentDiffOptions,
): Promise<ImageContainmentDiffResult> {
  const threshold = normalizeThreshold(options.threshold);
  const before = await readPngImage(options.beforePath);
  const after = await readPngImage(options.afterPath);

  if (before.width !== after.width || before.height !== after.height) {
    throwDimensionMismatch(before, after);
  }

  if (options.allowedRegions.length === 0) {
    throw new ProcessError("Change containment requires at least one allowed region.");
  }

  const allowedRegions = options.allowedRegions.map((region) =>
    normalizeImageRegion(region, before.width, before.height),
  );
  const diff = new PNG({
    width: before.width,
    height: before.height,
  });
  const diffPixels = pixelmatch(before.data, after.data, diff.data, before.width, before.height, {
    threshold,
  });
  const comparedPixels = before.width * before.height;
  const mask = makeRegionMask(before.width, before.height, allowedRegions);
  let insideComparedPixels = 0;
  let insideDiffPixels = 0;
  let outsideDiffPixels = 0;

  for (let index = 0; index < comparedPixels; index += 1) {
    const inside = mask[index] === 1;
    if (inside) {
      insideComparedPixels += 1;
    }
    if (!isPixelmatchDiffPixel(diff, index)) {
      continue;
    }
    if (inside) {
      insideDiffPixels += 1;
    } else {
      outsideDiffPixels += 1;
    }
  }

  const outsideComparedPixels = comparedPixels - insideComparedPixels;

  if (options.diffPath) {
    await writeFile(options.diffPath, PNG.sync.write(diff));
  }

  return {
    width: before.width,
    height: before.height,
    comparedPixels,
    diffPixels,
    diffPixelRatio: comparedPixels > 0 ? diffPixels / comparedPixels : 0,
    threshold,
    allowedRegions,
    insideComparedPixels,
    insideDiffPixels,
    insideDiffPixelRatio: insideComparedPixels > 0 ? insideDiffPixels / insideComparedPixels : 0,
    outsideComparedPixels,
    outsideDiffPixels,
    outsideDiffPixelRatio:
      outsideComparedPixels > 0 ? outsideDiffPixels / outsideComparedPixels : 0,
    warnings: [],
  };
}

export async function readPngImage(path: string): Promise<PNG> {
  return PNG.sync.read(await readFile(path));
}

export async function readPngSize(path: string): Promise<{
  readonly width: number;
  readonly height: number;
}> {
  const image = await readPngImage(path);
  return {
    width: image.width,
    height: image.height,
  };
}

export function normalizeThreshold(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_THRESHOLD;
  }
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ProcessError("Visual QA threshold must be a finite number between 0 and 1.");
  }
  return value;
}

export function normalizeRatio(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ProcessError(`${label} must be a finite number between 0 and 1.`);
  }
  return value;
}

export function normalizeImageRegion(
  region: ImageRegion | undefined,
  imageWidth: number,
  imageHeight: number,
): ImageRegion {
  if (!region) {
    return {
      x: 0,
      y: 0,
      width: imageWidth,
      height: imageHeight,
    };
  }

  const values = [region.x, region.y, region.width, region.height];
  if (
    values.some((value) => !Number.isInteger(value)) ||
    region.x < 0 ||
    region.y < 0 ||
    region.width <= 0 ||
    region.height <= 0
  ) {
    throw new ProcessError(
      "Visual QA region requires integer x/y and positive integer width/height.",
    );
  }
  if (region.x + region.width > imageWidth || region.y + region.height > imageHeight) {
    throw new ProcessError(
      `Visual QA region ${region.x},${region.y},${region.width},${region.height} is outside image bounds ${imageWidth}x${imageHeight}.`,
    );
  }

  return region;
}

export function clampImageRegion(
  region: ImageRegion,
  imageWidth: number,
  imageHeight: number,
): ImageRegion {
  const x = Math.max(0, Math.min(imageWidth, Math.floor(region.x)));
  const y = Math.max(0, Math.min(imageHeight, Math.floor(region.y)));
  const right = Math.max(x, Math.min(imageWidth, Math.ceil(region.x + region.width)));
  const bottom = Math.max(y, Math.min(imageHeight, Math.ceil(region.y + region.height)));
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) {
    throw new ProcessError("Visual QA region is empty after clamping to image bounds.");
  }
  return {
    x,
    y,
    width,
    height,
  };
}

function copyRegion(image: PNG, region: ImageRegion): PNG {
  if (
    region.x === 0 &&
    region.y === 0 &&
    region.width === image.width &&
    region.height === image.height
  ) {
    return image;
  }

  const cropped = new PNG({
    width: region.width,
    height: region.height,
  });

  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const sourceIndex = ((region.y + y) * image.width + region.x + x) * 4;
      const targetIndex = (y * region.width + x) * 4;
      cropped.data[targetIndex] = image.data[sourceIndex] ?? 0;
      cropped.data[targetIndex + 1] = image.data[sourceIndex + 1] ?? 0;
      cropped.data[targetIndex + 2] = image.data[sourceIndex + 2] ?? 0;
      cropped.data[targetIndex + 3] = image.data[sourceIndex + 3] ?? 0;
    }
  }

  return cropped;
}

function throwDimensionMismatch(
  before: { readonly width: number; readonly height: number },
  after: { readonly width: number; readonly height: number },
): never {
  throw new ProcessError(
    `Image dimensions differ: before=${before.width}x${before.height}, after=${after.width}x${after.height}.`,
  );
}

function makeRegionMask(
  width: number,
  height: number,
  regions: readonly ImageRegion[],
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

function isPixelmatchDiffPixel(diff: PNG, pixelIndex: number): boolean {
  const offset = pixelIndex * 4;
  const red = diff.data[offset] ?? 0;
  const green = diff.data[offset + 1] ?? 0;
  const blue = diff.data[offset + 2] ?? 0;
  const alpha = diff.data[offset + 3] ?? 0;
  return alpha > 0 && red > 200 && (green < 80 || blue < 80);
}
