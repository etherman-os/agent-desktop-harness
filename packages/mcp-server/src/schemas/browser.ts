import { z } from "zod";
import {
  browserTargetSchema,
  hasBrowserTarget,
  nonEmptyString,
  positiveInteger,
} from "./common.js";

export const browserOpenSchema = z
  .object({
    sessionId: nonEmptyString,
    url: z.string().url(),
    browserExecutablePath: nonEmptyString.optional(),
    browserName: z.enum(["chromium", "chrome", "firefox"]).optional(),
    viewport: z.object({ width: positiveInteger, height: positiveInteger }).strict().optional(),
    userDataDir: nonEmptyString.optional(),
    label: z.string().optional(),
    timeoutMs: positiveInteger.optional(),
  })
  .strict();

export const browserClickSchema = z
  .object({
    sessionId: nonEmptyString,
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    timeoutMs: positiveInteger.optional(),
  })
  .strict()
  .refine(
    hasBrowserTarget,
    "browser click requires selector, testId, role, label, placeholder, or text.",
  );

export const browserFillSchema = z
  .object({
    sessionId: nonEmptyString,
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    value: z.string(),
    secret: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
  })
  .strict()
  .refine(
    hasBrowserTarget,
    "browser fill requires selector, testId, role, label, placeholder, or text.",
  );

export const browserPressSchema = z
  .object({
    sessionId: nonEmptyString,
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    key: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
  })
  .strict();

export const browserAssertTextSchema = z
  .object({
    sessionId: nonEmptyString,
    pageId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const browserScreenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    pageId: nonEmptyString.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional(),
  })
  .strict();

export const browserCloseSchema = z
  .object({
    sessionId: nonEmptyString,
    pageId: nonEmptyString.optional(),
  })
  .strict();

export type BrowserOpenInput = z.infer<typeof browserOpenSchema>;
export type BrowserClickInput = z.infer<typeof browserClickSchema>;
export type BrowserFillInput = z.infer<typeof browserFillSchema>;
export type BrowserPressInput = z.infer<typeof browserPressSchema>;
export type BrowserAssertTextInput = z.infer<typeof browserAssertTextSchema>;
export type BrowserScreenshotInput = z.infer<typeof browserScreenshotSchema>;
export type BrowserCloseInput = z.infer<typeof browserCloseSchema>;
