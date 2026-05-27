import { z } from "zod";
import {
  browserTargetSchema,
  hasBrowserTarget,
  nonEmptyString,
  positiveInteger,
} from "./common.js";

export const tauriOpenBodySchema = z
  .object({
    command: nonEmptyString,
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    label: z.string().optional(),
    webdriverPort: positiveInteger.optional(),
    nativePort: positiveInteger.optional(),
    timeoutMs: positiveInteger.optional(),
    windowTitleIncludes: nonEmptyString.optional(),
    applicationPath: nonEmptyString.optional(),
  })
  .strict();

export const tauriClickBodySchema = z
  .object({
    ...browserTargetSchema,
    appId: nonEmptyString.optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict()
  .refine(
    hasBrowserTarget,
    "tauri click requires selector, testId, role, label, placeholder, or text.",
  );

export const tauriFillBodySchema = z
  .object({
    ...browserTargetSchema,
    appId: nonEmptyString.optional(),
    value: z.string(),
    secret: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict()
  .refine(
    hasBrowserTarget,
    "tauri fill requires selector, testId, role, label, placeholder, or text.",
  );

export const tauriAssertTextBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const tauriScreenshotBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    label: z.string().optional(),
  })
  .strict();

export const tauriCloseBodySchema = z.object({ appId: nonEmptyString.optional() }).strict();

export type TauriOpenBody = z.infer<typeof tauriOpenBodySchema>;
export type TauriClickBody = z.infer<typeof tauriClickBodySchema>;
export type TauriFillBody = z.infer<typeof tauriFillBodySchema>;
export type TauriAssertTextBody = z.infer<typeof tauriAssertTextBodySchema>;
export type TauriScreenshotBody = z.infer<typeof tauriScreenshotBodySchema>;
export type TauriCloseBody = z.infer<typeof tauriCloseBodySchema>;
