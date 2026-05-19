import {
  comparePngImages,
  comparePngImagesWithContainment,
  normalizeRatio
} from "./imageDiff.js";
import type {
  ImageContainmentDiffResult,
  ImageDiffResult,
  ImageRegion,
  VisualAssertChangeContainedOptions,
  VisualAssertionKind
} from "./visualTypes.js";

export interface VisualQaCompareInput {
  readonly kind: VisualAssertionKind;
  readonly beforePath: string;
  readonly afterPath: string;
  readonly diffPath?: string;
  readonly region?: ImageRegion;
  readonly threshold?: number;
  readonly minDiffPixelRatio?: number;
  readonly maxDiffPixelRatio?: number;
}

export interface VisualQaCompareOutput extends ImageDiffResult {
  readonly passed?: boolean;
  readonly minDiffPixelRatio?: number;
  readonly maxDiffPixelRatio?: number;
}

export interface VisualQaContainmentOutput extends ImageContainmentDiffResult {
  readonly maxOutsideDiffPixelRatio: number;
  readonly minInsideDiffPixelRatio?: number;
  readonly containmentPassed: boolean;
  readonly passed: boolean;
}

export class VisualQaService {
  async compare(input: VisualQaCompareInput): Promise<VisualQaCompareOutput> {
    const diff = await comparePngImages(input);
    const minDiffPixelRatio = input.minDiffPixelRatio === undefined
      ? undefined
      : normalizeRatio(input.minDiffPixelRatio, "minDiffPixelRatio");
    const maxDiffPixelRatio = input.maxDiffPixelRatio === undefined
      ? undefined
      : normalizeRatio(input.maxDiffPixelRatio, "maxDiffPixelRatio");

    let passed: boolean | undefined;
    if (input.kind === "assert-changed") {
      const minRatio = minDiffPixelRatio ?? 0.01;
      passed = diff.diffPixelRatio >= minRatio;
      return {
        ...diff,
        minDiffPixelRatio: minRatio,
        passed
      };
    }

    if (input.kind === "assert-similar") {
      const maxRatio = maxDiffPixelRatio ?? 0.01;
      passed = diff.diffPixelRatio <= maxRatio;
      return {
        ...diff,
        maxDiffPixelRatio: maxRatio,
        passed
      };
    }

    if (maxDiffPixelRatio !== undefined) {
      passed = diff.diffPixelRatio <= maxDiffPixelRatio;
    }

    return {
      ...diff,
      maxDiffPixelRatio,
      passed
    };
  }

  async assertChangeContained(
    input: VisualAssertChangeContainedOptions & {
      readonly beforePath: string;
      readonly afterPath: string;
      readonly diffPath?: string;
    }
  ): Promise<VisualQaContainmentOutput> {
    const maxOutsideDiffPixelRatio = input.maxOutsideDiffPixelRatio === undefined
      ? 0.001
      : normalizeRatio(input.maxOutsideDiffPixelRatio, "maxOutsideDiffPixelRatio");
    const minInsideDiffPixelRatio = input.minInsideDiffPixelRatio === undefined
      ? undefined
      : normalizeRatio(input.minInsideDiffPixelRatio, "minInsideDiffPixelRatio");
    const diff = await comparePngImagesWithContainment({
      beforePath: input.beforePath,
      afterPath: input.afterPath,
      diffPath: input.diffPath,
      allowedRegions: input.allowedRegions,
      threshold: input.threshold
    });
    const outsideOk = diff.outsideDiffPixelRatio <= maxOutsideDiffPixelRatio;
    const insideOk = minInsideDiffPixelRatio === undefined
      ? true
      : diff.insideDiffPixelRatio >= minInsideDiffPixelRatio;
    const containmentPassed = outsideOk && insideOk;
    return {
      ...diff,
      maxOutsideDiffPixelRatio,
      minInsideDiffPixelRatio,
      containmentPassed,
      passed: containmentPassed
    };
  }
}
