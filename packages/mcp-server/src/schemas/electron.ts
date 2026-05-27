import { z } from "zod";
import {
  browserTargetSchema,
  hasBrowserTarget,
  nonEmptyString,
  positiveInteger,
} from "./common.js";

export const electronOpenSchema = z
  .object({
    sessionId: nonEmptyString,
    command: nonEmptyString.optional(),
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    executablePath: nonEmptyString.optional(),
    appPath: nonEmptyString.optional(),
    label: z.string().optional(),
    timeoutMs: positiveInteger.optional(),
    windowTitleIncludes: nonEmptyString.optional(),
    excludeDevtools: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.command !== undefined ||
      value.executablePath !== undefined ||
      value.appPath !== undefined,
    "electron open requires command, executablePath, or appPath",
  );

export const electronClickSchema = z
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
    "electron click requires selector, testId, role, label, placeholder, or text.",
  );

export const electronFillSchema = z
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
    "electron fill requires selector, testId, role, label, placeholder, or text.",
  );

export const electronPressSchema = z
  .object({
    sessionId: nonEmptyString,
    ...browserTargetSchema,
    appId: nonEmptyString.optional(),
    key: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const electronAssertTextSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const electronScreenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional(),
  })
  .strict();

export const electronCloseSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
  })
  .strict();

export type ElectronOpenInput = z.infer<typeof electronOpenSchema>;
export type ElectronClickInput = z.infer<typeof electronClickSchema>;
export type ElectronFillInput = z.infer<typeof electronFillSchema>;
export type ElectronPressInput = z.infer<typeof electronPressSchema>;
export type ElectronAssertTextInput = z.infer<typeof electronAssertTextSchema>;
export type ElectronScreenshotInput = z.infer<typeof electronScreenshotSchema>;
export type ElectronCloseInput = z.infer<typeof electronCloseSchema>;
