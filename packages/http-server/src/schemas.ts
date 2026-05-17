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

export const sessionIdSchema = nonEmptyString;

export const policySchema = z
  .object({
    allowedCommands: z.array(nonEmptyString).optional(),
    allowUnlistedCommandsForLocalDevelopment: z.boolean().optional()
  })
  .strict();

export const createSessionBodySchema = z
  .object({
    name: z.string().optional(),
    width: positiveInteger.optional(),
    height: positiveInteger.optional(),
    depth: positiveInteger.optional(),
    workspaceDir: nonEmptyString.optional(),
    policy: policySchema.optional()
  })
  .strict();

export const launchBodySchema = z
  .object({
    command: nonEmptyString,
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    label: z.string().optional()
  })
  .strict();

export const screenshotBodySchema = z
  .object({
    label: z.string().optional()
  })
  .strict();

export const clickBodySchema = z
  .object({
    x: finiteNumber,
    y: finiteNumber,
    button: z.enum(["left", "right", "middle"]).optional(),
    label: z.string().optional()
  })
  .strict();

export const typeTextBodySchema = z
  .object({
    text: z.string(),
    secret: z.boolean().optional(),
    label: z.string().optional()
  })
  .strict();

export const hotkeyBodySchema = z
  .object({
    keys: z.array(nonEmptyString).min(1),
    label: z.string().optional()
  })
  .strict();

export const scrollBodySchema = z
  .object({
    direction: z.enum(["up", "down", "left", "right"]),
    amount: positiveInteger.optional(),
    x: finiteNumber.optional(),
    y: finiteNumber.optional(),
    label: z.string().optional()
  })
  .strict();

export const focusWindowBodySchema = z
  .object({
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

export const waitForStableScreenBodySchema = z
  .object({
    timeoutMs: positiveInteger.optional(),
    intervalMs: positiveInteger.optional(),
    stableChecks: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const pngFileNameSchema = pngFileName;

export const createAnnotationBodySchema = z
  .object({
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

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type LaunchBody = z.infer<typeof launchBodySchema>;
export type ScreenshotBody = z.infer<typeof screenshotBodySchema>;
export type ClickBody = z.infer<typeof clickBodySchema>;
export type TypeTextBody = z.infer<typeof typeTextBodySchema>;
export type HotkeyBody = z.infer<typeof hotkeyBodySchema>;
export type ScrollBody = z.infer<typeof scrollBodySchema>;
export type FocusWindowBody = z.infer<typeof focusWindowBodySchema>;
export type WaitForStableScreenBody = z.infer<typeof waitForStableScreenBodySchema>;
export type CreateAnnotationBody = z.infer<typeof createAnnotationBodySchema>;
