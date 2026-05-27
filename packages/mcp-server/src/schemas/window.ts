import { z } from "zod";
import { nonEmptyString, nonNegativeInteger, positiveInteger } from "./common.js";

export const focusWindowSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const waitForStableScreenSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const waitForWindowSchema = z
  .object({
    sessionId: nonEmptyString,
    titleIncludes: nonEmptyString.optional(),
    titleExcludes: z.array(nonEmptyString).optional(),
    pid: positiveInteger.optional(),
    timeoutMs: positiveInteger.optional(),
    intervalMs: positiveInteger.optional(),
    preferLargest: z.boolean().optional(),
    excludeDevtools: z.boolean().optional(),
  })
  .strict();

export type FocusWindowInput = z.infer<typeof focusWindowSchema>;
export type WaitForStableScreenInput = z.infer<typeof waitForStableScreenSchema>;
export type WaitForWindowInput = z.infer<typeof waitForWindowSchema>;
