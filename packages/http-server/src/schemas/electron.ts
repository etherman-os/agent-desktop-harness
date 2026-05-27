import { z } from "zod";
import {
  browserTargetSchema,
  hasBrowserTarget,
  nonEmptyString,
  positiveInteger,
} from "./common.js";

export const electronOpenBodySchema = z
  .object({
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

export const electronClickBodySchema = z
  .object({
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

export const electronFillBodySchema = z
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
    "electron fill requires selector, testId, role, label, placeholder, or text.",
  );

export const electronPressBodySchema = z
  .object({
    ...browserTargetSchema,
    appId: nonEmptyString.optional(),
    key: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const electronAssertTextBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const electronScreenshotBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional(),
  })
  .strict();

export const electronCloseBodySchema = z.object({ appId: nonEmptyString.optional() }).strict();

export type ElectronOpenBody = z.infer<typeof electronOpenBodySchema>;
export type ElectronClickBody = z.infer<typeof electronClickBodySchema>;
export type ElectronFillBody = z.infer<typeof electronFillBodySchema>;
export type ElectronPressBody = z.infer<typeof electronPressBodySchema>;
export type ElectronAssertTextBody = z.infer<typeof electronAssertTextBodySchema>;
export type ElectronScreenshotBody = z.infer<typeof electronScreenshotBodySchema>;
export type ElectronCloseBody = z.infer<typeof electronCloseBodySchema>;
