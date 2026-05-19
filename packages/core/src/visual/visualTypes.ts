import type { SessionId } from "../types.js";

export interface ImageRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface VisualCompareOptions {
  readonly beforePath: string;
  readonly afterPath: string;
  readonly label?: string;
  readonly region?: ImageRegion;
  readonly threshold?: number;
  readonly maxDiffPixelRatio?: number;
  readonly createDiffImage?: boolean;
}

export interface VisualAssertChangedOptions {
  readonly beforePath: string;
  readonly afterPath: string;
  readonly label?: string;
  readonly region?: ImageRegion;
  readonly minDiffPixelRatio?: number;
  readonly threshold?: number;
  readonly createDiffImage?: boolean;
}

export interface VisualAssertSimilarOptions {
  readonly beforePath: string;
  readonly afterPath: string;
  readonly label?: string;
  readonly region?: ImageRegion;
  readonly maxDiffPixelRatio?: number;
  readonly threshold?: number;
  readonly createDiffImage?: boolean;
}

export interface VisualBaselineRef {
  readonly name: string;
  readonly suite?: string;
  readonly path: string;
  readonly sourceScreenshotPath: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SaveVisualBaselineOptions {
  readonly screenshotPath: string;
  readonly name: string;
  readonly suite?: string;
  readonly overwrite?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CompareVisualBaselineOptions {
  readonly screenshotPath: string;
  readonly baselineName: string;
  readonly suite?: string;
  readonly label?: string;
  readonly region?: ImageRegion;
  readonly threshold?: number;
  readonly maxDiffPixelRatio?: number;
  readonly createDiffImage?: boolean;
}

export interface ListVisualBaselinesOptions {
  readonly suite?: string;
}

export interface AnnotationRegionOptions {
  readonly annotationId: string;
  readonly padding?: number;
}

export interface AnnotationRegionResult {
  readonly annotationId: string;
  readonly region: ImageRegion;
  readonly screenshotPath: string;
  readonly note: string;
}

export interface VisualAssertAnnotationChangedOptions {
  readonly annotationId: string;
  readonly beforePath?: string;
  readonly afterPath: string;
  readonly padding?: number;
  readonly minDiffPixelRatio?: number;
  readonly threshold?: number;
  readonly createDiffImage?: boolean;
  readonly label?: string;
}

export interface VisualAssertAnnotationSimilarOptions {
  readonly annotationId: string;
  readonly beforePath?: string;
  readonly afterPath: string;
  readonly padding?: number;
  readonly maxDiffPixelRatio?: number;
  readonly threshold?: number;
  readonly createDiffImage?: boolean;
  readonly label?: string;
}

export interface VisualAssertChangeContainedOptions {
  readonly beforePath: string;
  readonly afterPath: string;
  readonly label?: string;
  readonly allowedRegions: readonly ImageRegion[];
  readonly threshold?: number;
  readonly maxOutsideDiffPixelRatio?: number;
  readonly minInsideDiffPixelRatio?: number;
  readonly createDiffImage?: boolean;
}

export type VisualAssertionKind =
  | "compare"
  | "assert-changed"
  | "assert-similar"
  | "compare-baseline"
  | "assert-annotation-changed"
  | "assert-annotation-similar"
  | "assert-change-contained";

export interface VisualCompareResult {
  readonly sessionId?: SessionId;
  readonly label?: string;
  readonly kind?: VisualAssertionKind;
  readonly baselineName?: string;
  readonly baselineSuite?: string;
  readonly annotationId?: string;
  readonly annotationNote?: string;
  readonly beforePath: string;
  readonly afterPath: string;
  readonly diffPath?: string;
  readonly region?: ImageRegion;
  readonly allowedRegions?: readonly ImageRegion[];
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly diffPixels: number;
  readonly diffPixelRatio: number;
  readonly threshold: number;
  readonly minDiffPixelRatio?: number;
  readonly maxDiffPixelRatio?: number;
  readonly maxOutsideDiffPixelRatio?: number;
  readonly minInsideDiffPixelRatio?: number;
  readonly insideComparedPixels?: number;
  readonly insideDiffPixels?: number;
  readonly insideDiffPixelRatio?: number;
  readonly outsideComparedPixels?: number;
  readonly outsideDiffPixels?: number;
  readonly outsideDiffPixelRatio?: number;
  readonly containmentPassed?: boolean;
  readonly passed?: boolean;
  readonly createdAt: string;
  readonly warnings: readonly string[];
}

export interface VisualChangeContainmentResult extends VisualCompareResult {
  readonly allowedRegions: readonly ImageRegion[];
  readonly insideComparedPixels: number;
  readonly insideDiffPixels: number;
  readonly insideDiffPixelRatio: number;
  readonly outsideComparedPixels: number;
  readonly outsideDiffPixels: number;
  readonly outsideDiffPixelRatio: number;
  readonly containmentPassed: boolean;
}

export interface RectangleOverlapResult {
  readonly a: ImageRegion;
  readonly b: ImageRegion;
  readonly labelA?: string;
  readonly labelB?: string;
  readonly overlaps: boolean;
  readonly overlapRegion?: ImageRegion;
  readonly overlapArea: number;
  readonly overlapRatioA: number;
  readonly overlapRatioB: number;
}

export interface VisualCheckRegionOverlapOptions {
  readonly regions: readonly ImageRegion[];
  readonly labels?: readonly string[];
}

export interface ImageDiffOptions {
  readonly beforePath: string;
  readonly afterPath: string;
  readonly diffPath?: string;
  readonly region?: ImageRegion;
  readonly threshold?: number;
}

export interface ImageContainmentDiffOptions {
  readonly beforePath: string;
  readonly afterPath: string;
  readonly diffPath?: string;
  readonly allowedRegions: readonly ImageRegion[];
  readonly threshold?: number;
}

export interface ImageDiffResult {
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly diffPixels: number;
  readonly diffPixelRatio: number;
  readonly threshold: number;
  readonly warnings: readonly string[];
}

export interface ImageContainmentDiffResult extends ImageDiffResult {
  readonly allowedRegions: readonly ImageRegion[];
  readonly insideComparedPixels: number;
  readonly insideDiffPixels: number;
  readonly insideDiffPixelRatio: number;
  readonly outsideComparedPixels: number;
  readonly outsideDiffPixels: number;
  readonly outsideDiffPixelRatio: number;
}
