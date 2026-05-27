import { z } from "zod";
import {
  browserTargetSchema,
  hasBrowserTarget,
  nonEmptyString,
  positiveInteger,
} from "./common.js";

export const browserOpenBodySchema = z
  .object({
    url: z.string().url(),
    browserExecutablePath: nonEmptyString.optional(),
    browserName: z.enum(["chromium", "chrome", "firefox"]).optional(),
    viewport: z.object({ width: positiveInteger, height: positiveInteger }).strict().optional(),
    userDataDir: nonEmptyString.optional(),
    label: z.string().optional(),
    timeoutMs: positiveInteger.optional(),
  })
  .strict();

export const browserClickBodySchema = z
  .object({
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    timeoutMs: positiveInteger.optional(),
  })
  .strict()
  .refine(
    hasBrowserTarget,
    "browser click requires selector, testId, role, label, placeholder, or text.",
  );

export const browserFillBodySchema = z
  .object({
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

export const browserPressBodySchema = z
  .object({
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    key: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
  })
  .strict();

export const browserAssertTextBodySchema = z
  .object({
    pageId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const browserScreenshotBodySchema = z
  .object({
    pageId: nonEmptyString.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional(),
  })
  .strict();

export const browserCloseBodySchema = z.object({ pageId: nonEmptyString.optional() }).strict();

export type BrowserOpenBody = z.infer<typeof browserOpenBodySchema>;
export type BrowserClickBody = z.infer<typeof browserClickBodySchema>;
export type BrowserFillBody = z.infer<typeof browserFillBodySchema>;
export type BrowserPressBody = z.infer<typeof browserPressBodySchema>;
export type BrowserAssertTextBody = z.infer<typeof browserAssertTextBodySchema>;
export type BrowserScreenshotBody = z.infer<typeof browserScreenshotBodySchema>;
export type BrowserCloseBody = z.infer<typeof browserCloseBodySchema>;
