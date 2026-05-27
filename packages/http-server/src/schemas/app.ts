import { z } from "zod";
import {
  appKindSchema,
  appTargetSchema,
  hasAppTarget,
  nonEmptyString,
  positiveInteger,
  routedDriverSchema,
} from "./common.js";

export const driverRouteBodySchema = z
  .object({
    appKind: appKindSchema,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    requireSemantic: z.boolean().optional(),
  })
  .strict();

export const appOpenBodySchema = z
  .object({
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

export const appClickBodySchema = z
  .object({
    ...appTargetSchema,
    appId: nonEmptyString.optional(),
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict()
  .refine(hasAppTarget, "app click requires a semantic target or x/y coordinates.");

export const appFillBodySchema = z
  .object({
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

export const appPressBodySchema = z
  .object({
    ...appTargetSchema,
    appId: nonEmptyString.optional(),
    key: nonEmptyString,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const appAssertTextBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional(),
  })
  .strict();

export const appScreenshotBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    preferredDriver: routedDriverSchema.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional(),
  })
  .strict();

export const appCloseBodySchema = z.object({ appId: nonEmptyString.optional() }).strict();

export type DriverRouteBody = z.infer<typeof driverRouteBodySchema>;
export type AppOpenBody = z.infer<typeof appOpenBodySchema>;
export type AppClickBody = z.infer<typeof appClickBodySchema>;
export type AppFillBody = z.infer<typeof appFillBodySchema>;
export type AppPressBody = z.infer<typeof appPressBodySchema>;
export type AppAssertTextBody = z.infer<typeof appAssertTextBodySchema>;
export type AppScreenshotBody = z.infer<typeof appScreenshotBodySchema>;
export type AppCloseBody = z.infer<typeof appCloseBodySchema>;
