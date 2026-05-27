import { z } from "zod";
import {
  imageRegionSchema,
  metadataSchema,
  nonEmptyString,
  nonNegativeInteger,
  ratio,
} from "./common.js";

export const visualCompareSchema = z
  .object({
    sessionId: nonEmptyString,
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    threshold: ratio.optional(),
    maxDiffPixelRatio: ratio.optional(),
    createDiffImage: z.boolean().optional(),
  })
  .strict();

export const visualAssertChangedSchema = z
  .object({
    sessionId: nonEmptyString,
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    minDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional(),
  })
  .strict();

export const visualAssertSimilarSchema = z
  .object({
    sessionId: nonEmptyString,
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    maxDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional(),
  })
  .strict();

export const visualSaveBaselineSchema = z
  .object({
    sessionId: nonEmptyString,
    screenshotPath: nonEmptyString,
    name: nonEmptyString,
    suite: nonEmptyString.optional(),
    overwrite: z.boolean().optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const visualListBaselinesSchema = z
  .object({
    sessionId: nonEmptyString,
    suite: nonEmptyString.optional(),
  })
  .strict();

export const visualCompareBaselineSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const visualAssertAnnotationChangedSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const visualAssertAnnotationSimilarSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const visualAssertChangeContainedSchema = z
  .object({
    sessionId: nonEmptyString,
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

export type VisualCompareInput = z.infer<typeof visualCompareSchema>;
export type VisualAssertChangedInput = z.infer<typeof visualAssertChangedSchema>;
export type VisualAssertSimilarInput = z.infer<typeof visualAssertSimilarSchema>;
export type VisualSaveBaselineInput = z.infer<typeof visualSaveBaselineSchema>;
export type VisualListBaselinesInput = z.infer<typeof visualListBaselinesSchema>;
export type VisualCompareBaselineInput = z.infer<typeof visualCompareBaselineSchema>;
export type VisualAssertAnnotationChangedInput = z.infer<
  typeof visualAssertAnnotationChangedSchema
>;
export type VisualAssertAnnotationSimilarInput = z.infer<
  typeof visualAssertAnnotationSimilarSchema
>;
export type VisualAssertChangeContainedInput = z.infer<typeof visualAssertChangeContainedSchema>;
