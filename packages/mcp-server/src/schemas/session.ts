import { z } from "zod";
import { nonEmptyString, positiveInteger } from "./common.js";

export const policySchema = z
  .object({
    allowedCommands: z.array(nonEmptyString).optional(),
    allowUnlistedCommandsForLocalDevelopment: z.boolean().optional(),
  })
  .strict();

export const startSessionSchema = z
  .object({
    name: z.string().optional(),
    width: positiveInteger.optional(),
    height: positiveInteger.optional(),
    depth: positiveInteger.optional(),
    workspaceDir: nonEmptyString.optional(),
    policy: policySchema.optional(),
  })
  .strict();

export const noArgsSchema = z.object({}).strict();

export const sessionIdSchema = z.object({ sessionId: nonEmptyString }).strict();

export const launchAppSchema = z
  .object({
    sessionId: nonEmptyString,
    command: nonEmptyString,
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    label: z.string().optional(),
  })
  .strict();

export const screenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    label: z.string().optional(),
  })
  .strict();

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type LaunchAppInput = z.infer<typeof launchAppSchema>;
export type ScreenshotInput = z.infer<typeof screenshotSchema>;
