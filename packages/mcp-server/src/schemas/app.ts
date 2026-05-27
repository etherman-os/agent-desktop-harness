import { z } from "zod";
import {
  appKindSchema,
  appTargetSchema,
  hasAppTarget,
  nonEmptyString,
  positiveInteger,
  routedDriverSchema,
} from "./common.js";

export const driverRouteSchema = z
  .object({
    sessionId: nonEmptyString,
    appKind: appKindSchema,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    requireSemantic: z.boolean().optional(),
  })
  .strict();

export const appOpenSchema = z
  .object({
    sessionId: nonEmptyString,
    appKind: appKindSchema,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    requireSemantic: z.boolean().optional(),
    url: z.string().url().optional(),
    browserExecutablePath: nonEmptyString.optional(),
    browserName: z.enum(["chromium", "chrome", "firefox"]).optional(),
    viewport: z.object({ width: positiveInteger, height: positiveInteger }).strict().optional(),
    command: nonEmptyString.optional(),
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    appPath: nonEmptyString.optional(),
    executablePath: nonEmptyString.optional(),
    label: z.string().optional(),
    timeoutMs: positiveInteger.optional(),
    windowTitleIncludes: nonEmptyString.optional(),
    excludeDevtools: z.boolean().optional(),
  })
  .strict();

export const appClickSchema = z
  .object({
    sessionId: nonEmptyString,
    ...appTargetSchema,
    appId: nonEmptyString.optional(),
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict()
  .refine(hasAppTarget, "app click requires a semantic target or x/y coordinates.");

export const appFillSchema = z
  .object({
    sessionId: nonEmptyString,
    ...appTargetSchema,
    appId: nonEmptyString.optional(),
    value: z.string(),
    secret: z.boolean().optional(),
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict()
  .refine(hasAppTarget, "app fill requires a semantic target or x/y coordinates.");

export const appPressSchema = z
  .object({
    sessionId: nonEmptyString,
    ...appTargetSchema,
    appId: nonEmptyString.optional(),
    key: nonEmptyString,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const appAssertTextSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const appScreenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    preferredDriver: routedDriverSchema.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional(),
  })
  .strict();

export const appCloseSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
  })
  .strict();

export type DriverRouteInput = z.infer<typeof driverRouteSchema>;
export type AppOpenInput = z.infer<typeof appOpenSchema>;
export type AppClickInput = z.infer<typeof appClickSchema>;
export type AppFillInput = z.infer<typeof appFillSchema>;
export type AppPressInput = z.infer<typeof appPressSchema>;
export type AppAssertTextInput = z.infer<typeof appAssertTextSchema>;
export type AppScreenshotInput = z.infer<typeof appScreenshotSchema>;
export type AppCloseInput = z.infer<typeof appCloseSchema>;
