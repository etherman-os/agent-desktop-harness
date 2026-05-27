import { z } from "zod";
import { nonEmptyString, positiveInteger } from "./common.js";

export const sessionIdSchema = nonEmptyString;

export const policySchema = z
  .object({
    allowedCommands: z.array(nonEmptyString).optional(),
    allowUnlistedCommandsForLocalDevelopment: z.boolean().optional(),
  })
  .strict();

export const createSessionBodySchema = z
  .object({
    name: z.string().optional(),
    width: positiveInteger.optional(),
    height: positiveInteger.optional(),
    depth: positiveInteger.optional(),
    workspaceDir: nonEmptyString.optional(),
    policy: policySchema.optional(),
  })
  .strict();

export const launchBodySchema = z
  .object({
    command: nonEmptyString,
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    label: z.string().optional(),
  })
  .strict();

export const screenshotBodySchema = z
  .object({
    label: z.string().optional(),
  })
  .strict();

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type LaunchBody = z.infer<typeof launchBodySchema>;
export type ScreenshotBody = z.infer<typeof screenshotBodySchema>;
