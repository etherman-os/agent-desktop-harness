import { ProcessError } from "../errors.js";
import type {
  ImageRegion,
  RectangleOverlapResult,
  VisualCheckRegionOverlapOptions
} from "./visualTypes.js";

export function checkRegionOverlaps(
  options: VisualCheckRegionOverlapOptions
): RectangleOverlapResult[] {
  if (options.labels && options.labels.length !== options.regions.length) {
    throw new ProcessError("Region overlap labels must match the number of regions.");
  }

  const results: RectangleOverlapResult[] = [];
  for (let leftIndex = 0; leftIndex < options.regions.length; leftIndex += 1) {
    const left = normalizeOverlapRegion(options.regions[leftIndex]);
    for (let rightIndex = leftIndex + 1; rightIndex < options.regions.length; rightIndex += 1) {
      const right = normalizeOverlapRegion(options.regions[rightIndex]);
      const overlapRegion = getOverlapRegion(left, right);
      const overlapArea = overlapRegion ? overlapRegion.width * overlapRegion.height : 0;
      const areaA = left.width * left.height;
      const areaB = right.width * right.height;
      results.push({
        a: left,
        b: right,
        labelA: options.labels?.[leftIndex],
        labelB: options.labels?.[rightIndex],
        overlaps: overlapRegion !== undefined,
        overlapRegion,
        overlapArea,
        overlapRatioA: areaA > 0 ? overlapArea / areaA : 0,
        overlapRatioB: areaB > 0 ? overlapArea / areaB : 0
      });
    }
  }
  return results;
}

function getOverlapRegion(a: ImageRegion, b: ImageRegion): ImageRegion | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return {
    x,
    y,
    width,
    height
  };
}

function normalizeOverlapRegion(region: ImageRegion | undefined): ImageRegion {
  if (!region) {
    throw new ProcessError("Region overlap checks require valid regions.");
  }
  const values = [region.x, region.y, region.width, region.height];
  if (
    values.some((value) => !Number.isFinite(value)) ||
    region.width <= 0 ||
    region.height <= 0
  ) {
    throw new ProcessError("Region overlap checks require positive finite rectangles.");
  }
  return {
    x: Math.floor(region.x),
    y: Math.floor(region.y),
    width: Math.floor(region.width),
    height: Math.floor(region.height)
  };
}
