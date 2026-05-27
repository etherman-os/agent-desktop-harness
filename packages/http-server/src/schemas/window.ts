import { z } from "zod";
import { nonEmptyString, nonNegativeInteger, positiveInteger } from "./common.js";

export const focusWindowBodySchema = z
  .object({
    id: nonEmptyString.optional(),
    title: nonEmptyString.optional(),
    titleIncludes: nonEmptyString.optional(),
    titleExcludes: z.array(nonEmptyString).optional(),
    pid: positiveInteger.optional(),
    preferLargest: z.boolean().optional(),
    excludeDevtools: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.id !== undefined ||
      value.title !== undefined ||
      value.titleIncludes !== undefined ||
      value.pid !== undefined,
    "focusWindow requires id, pid, title, or titleIncludes.",
  );

export const waitForStableScreenBodySchema = z
  .object({
    timeoutMs: positiveInteger.optional(),
    intervalMs: positiveInteger.optional(),
    stableChecks: positiveInteger.optional(),
    label: z.string().optional(),
    mode: z.enum(["hash", "fileSize", "tolerant"]).optional(),
    fileSizeToleranceBytes: nonNegativeInteger.optional(),
    maxRetainedScreenshots: positiveInteger.optional(),
    retainOnlyLast: z.boolean().optional(),
  })
  .strict();

export const waitForWindowBodySchema = z
  .object({
    titleIncludes: nonEmptyString.optional(),
    titleExcludes: z.array(nonEmptyString).optional(),
    pid: positiveInteger.optional(),
    timeoutMs: positiveInteger.optional(),
    intervalMs: positiveInteger.optional(),
    preferLargest: z.boolean().optional(),
    excludeDevtools: z.boolean().optional(),
  })
  .strict();

export type FocusWindowBody = z.infer<typeof focusWindowBodySchema>;
export type WaitForStableScreenBody = z.infer<typeof waitForStableScreenBodySchema>;
export type WaitForWindowBody = z.infer<typeof waitForWindowBodySchema>;
