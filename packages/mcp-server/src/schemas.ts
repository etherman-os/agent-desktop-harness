import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const positiveInteger = z.number().int().positive();
const finiteNumber = z.number().finite();
const pngFileName = nonEmptyString.refine(
  (value) =>
    value === value.split(/[\\/]/).pop() &&
    !value.includes("/") &&
    !value.includes("\\") &&
    value.toLowerCase().endsWith(".png"),
  "file name must be a PNG file name without path separators"
);

export const policySchema = z
  .object({
    allowedCommands: z.array(nonEmptyString).optional(),
    allowUnlistedCommandsForLocalDevelopment: z.boolean().optional()
  })
  .strict();

export const startSessionSchema = z
  .object({
    name: z.string().optional(),
    width: positiveInteger.optional(),
    height: positiveInteger.optional(),
    depth: positiveInteger.optional(),
    workspaceDir: nonEmptyString.optional(),
    policy: policySchema.optional()
  })
  .strict();

export const noArgsSchema = z.object({}).strict();

export const sessionIdSchema = z
  .object({
    sessionId: nonEmptyString
  })
  .strict();

export const launchAppSchema = z
  .object({
    sessionId: nonEmptyString,
    command: nonEmptyString,
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    label: z.string().optional()
  })
  .strict();

export const screenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    label: z.string().optional()
  })
  .strict();

export const clickSchema = z
  .object({
    sessionId: nonEmptyString,
    x: finiteNumber,
    y: finiteNumber,
    button: z.enum(["left", "right", "middle"]).optional(),
    label: z.string().optional()
  })
  .strict();

export const typeTextSchema = z
  .object({
    sessionId: nonEmptyString,
    text: z.string(),
    secret: z.boolean().optional(),
    label: z.string().optional()
  })
  .strict();

export const hotkeySchema = z
  .object({
    sessionId: nonEmptyString,
    keys: z.array(nonEmptyString).min(1),
    label: z.string().optional()
  })
  .strict();

export const scrollSchema = z
  .object({
    sessionId: nonEmptyString,
    direction: z.enum(["up", "down", "left", "right"]),
    amount: positiveInteger.optional(),
    x: finiteNumber.optional(),
    y: finiteNumber.optional(),
    label: z.string().optional()
  })
  .strict();

export const focusWindowSchema = z
  .object({
    sessionId: nonEmptyString,
    id: nonEmptyString.optional(),
    title: nonEmptyString.optional(),
    titleIncludes: nonEmptyString.optional(),
    pid: positiveInteger.optional()
  })
  .strict()
  .refine(
    (value) =>
      value.id !== undefined ||
      value.title !== undefined ||
      value.titleIncludes !== undefined ||
      value.pid !== undefined,
    "focusWindow requires id, pid, title, or titleIncludes."
  );

export const waitForStableScreenSchema = z
  .object({
    sessionId: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    intervalMs: positiveInteger.optional(),
    stableChecks: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const createAnnotationSchema = z
  .object({
    sessionId: nonEmptyString,
    screenshotFileName: pngFileName,
    type: z.enum(["rectangle", "arrow", "note"]),
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber.optional(),
    height: finiteNumber.optional(),
    x2: finiteNumber.optional(),
    y2: finiteNumber.optional(),
    note: nonEmptyString,
    color: z.string().optional(),
    cropPngBase64: z.string().optional()
  })
  .strict()
  .refine(
    (value) =>
      value.type !== "rectangle" ||
      (value.width !== undefined &&
        value.height !== undefined &&
        value.width > 0 &&
        value.height > 0),
    "rectangle annotations require positive width and height"
  )
  .refine(
    (value) =>
      value.type !== "arrow" ||
      (value.x2 !== undefined &&
        value.y2 !== undefined &&
        Number.isFinite(value.x2) &&
        Number.isFinite(value.y2)),
    "arrow annotations require x2 and y2"
  );

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type LaunchAppInput = z.infer<typeof launchAppSchema>;
export type ScreenshotInput = z.infer<typeof screenshotSchema>;
export type ClickInput = z.infer<typeof clickSchema>;
export type TypeTextInput = z.infer<typeof typeTextSchema>;
export type HotkeyInput = z.infer<typeof hotkeySchema>;
export type ScrollInput = z.infer<typeof scrollSchema>;
export type FocusWindowInput = z.infer<typeof focusWindowSchema>;
export type WaitForStableScreenInput = z.infer<typeof waitForStableScreenSchema>;
export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;
