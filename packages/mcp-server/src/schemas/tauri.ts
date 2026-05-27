import { z } from "zod";
import {
  browserTargetSchema,
  hasBrowserTarget,
  nonEmptyString,
  positiveInteger,
} from "./common.js";

export const tauriOpenSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const tauriClickSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const tauriFillSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const tauriAssertTextSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const tauriScreenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    label: z.string().optional(),
  })
  .strict();

export const tauriCloseSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
  })
  .strict();

export type TauriOpenInput = z.infer<typeof tauriOpenSchema>;
export type TauriClickInput = z.infer<typeof tauriClickSchema>;
export type TauriFillInput = z.infer<typeof tauriFillSchema>;
export type TauriAssertTextInput = z.infer<typeof tauriAssertTextSchema>;
export type TauriScreenshotInput = z.infer<typeof tauriScreenshotSchema>;
export type TauriCloseInput = z.infer<typeof tauriCloseSchema>;
