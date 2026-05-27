import { z } from "zod";

export const nonEmptyString = z.string().trim().min(1);
export const positiveInteger = z.number().int().positive();
export const nonNegativeInteger = z.number().int().nonnegative();
export const finiteNumber = z.number().finite();

export const pngFileName = nonEmptyString.refine(
  (value) =>
    value === value.split(/[\\/]/).pop() &&
    !value.includes("/") &&
    !value.includes("\\") &&
    value.toLowerCase().endsWith(".png"),
  "file name must be a PNG file name without path separators",
);

export const browserTargetSchema = {
  selector: nonEmptyString.optional(),
  text: nonEmptyString.optional(),
  role: nonEmptyString.optional(),
  name: nonEmptyString.optional(),
  label: nonEmptyString.optional(),
  placeholder: nonEmptyString.optional(),
  testId: nonEmptyString.optional(),
} as const;

export const appKindSchema = z.enum(["browser", "tauri", "electron", "native", "unknown"]);

export const routedDriverSchema = z.enum([
  "browser-playwright",
  "tauri-webdriver",
  "electron-playwright",
  "x11-fallback",
]);

export const appTargetSchema = {
  ...browserTargetSchema,
  x: finiteNumber.optional(),
  y: finiteNumber.optional(),
  button: z.enum(["left", "right", "middle"]).optional(),
} as const;

export const ratio = z.number().finite().min(0).max(1);

export const imageRegionSchema = z
  .object({
    x: nonNegativeInteger,
    y: nonNegativeInteger,
    width: positiveInteger,
    height: positiveInteger,
  })
  .strict();

export const metadataSchema = z.record(z.string(), z.unknown());

export const hasBrowserTarget = (value: {
  readonly selector?: string;
  readonly text?: string;
  readonly role?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly testId?: string;
}): boolean =>
  value.selector !== undefined ||
  value.text !== undefined ||
  value.role !== undefined ||
  value.label !== undefined ||
  value.placeholder !== undefined ||
  value.testId !== undefined;

export const hasAppTarget = (value: {
  readonly selector?: string;
  readonly text?: string;
  readonly role?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly testId?: string;
  readonly x?: number;
  readonly y?: number;
}): boolean => hasBrowserTarget(value) || (value.x !== undefined && value.y !== undefined);
