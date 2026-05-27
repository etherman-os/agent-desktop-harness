import { z } from "zod";
import { finiteNumber, nonEmptyString, pngFileName } from "./common.js";

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
    cropPngBase64: z.string().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.type !== "rectangle" ||
      (value.width !== undefined &&
        value.height !== undefined &&
        value.width > 0 &&
        value.height > 0),
    "rectangle annotations require positive width and height",
  )
  .refine(
    (value) =>
      value.type !== "arrow" ||
      (value.x2 !== undefined &&
        value.y2 !== undefined &&
        Number.isFinite(value.x2) &&
        Number.isFinite(value.y2)),
    "arrow annotations require x2 and y2",
  );

export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;
