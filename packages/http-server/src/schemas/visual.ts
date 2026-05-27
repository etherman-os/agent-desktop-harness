import { z } from "zod";
import {
  imageRegionSchema,
  metadataSchema,
  nonEmptyString,
  nonNegativeInteger,
  ratio,
} from "./common.js";

export const visualCompareBodySchema = z
  .object({
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    threshold: ratio.optional(),
    maxDiffPixelRatio: ratio.optional(),
    createDiffImage: z.boolean().optional(),
  })
  .strict();

export const visualAssertChangedBodySchema = z
  .object({
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    minDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional(),
  })
  .strict();

export const visualAssertSimilarBodySchema = z
  .object({
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    maxDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional(),
  })
  .strict();

export const saveVisualBaselineBodySchema = z
  .object({
    screenshotPath: nonEmptyString,
    name: nonEmptyString,
    suite: nonEmptyString.optional(),
    overwrite: z.boolean().optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const listVisualBaselinesQuerySchema = z
  .object({ suite: nonEmptyString.optional() })
  .strict();

export const compareVisualBaselineBodySchema = z
  .object({
    screenshotPath: nonEmptyString,
    baselineName: nonEmptyString,
    suite: nonEmptyString.optional(),
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    threshold: ratio.optional(),
    maxDiffPixelRatio: ratio.optional(),
    createDiffImage: z.boolean().optional(),
  })
  .strict();

export const visualAssertAnnotationChangedBodySchema = z
  .object({
    annotationId: nonEmptyString,
    beforePath: nonEmptyString.optional(),
    afterPath: nonEmptyString,
    padding: nonNegativeInteger.optional(),
    minDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional(),
    label: z.string().optional(),
  })
  .strict();

export const visualAssertAnnotationSimilarBodySchema = z
  .object({
    annotationId: nonEmptyString,
    beforePath: nonEmptyString.optional(),
    afterPath: nonEmptyString,
    padding: nonNegativeInteger.optional(),
    maxDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional(),
    label: z.string().optional(),
  })
  .strict();

export const visualAssertChangeContainedBodySchema = z
  .object({
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    allowedRegions: z.array(imageRegionSchema).min(1),
    threshold: ratio.optional(),
    maxOutsideDiffPixelRatio: ratio.optional(),
    minInsideDiffPixelRatio: ratio.optional(),
    createDiffImage: z.boolean().optional(),
  })
  .strict();

export type VisualCompareBody = z.infer<typeof visualCompareBodySchema>;
export type VisualAssertChangedBody = z.infer<typeof visualAssertChangedBodySchema>;
export type VisualAssertSimilarBody = z.infer<typeof visualAssertSimilarBodySchema>;
export type SaveVisualBaselineBody = z.infer<typeof saveVisualBaselineBodySchema>;
export type ListVisualBaselinesQuery = z.infer<typeof listVisualBaselinesQuerySchema>;
export type CompareVisualBaselineBody = z.infer<typeof compareVisualBaselineBodySchema>;
export type VisualAssertAnnotationChangedBody = z.infer<
  typeof visualAssertAnnotationChangedBodySchema
>;
export type VisualAssertAnnotationSimilarBody = z.infer<
  typeof visualAssertAnnotationSimilarBodySchema
>;
export type VisualAssertChangeContainedBody = z.infer<typeof visualAssertChangeContainedBodySchema>;
