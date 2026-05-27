import { z } from "zod";
import { finiteNumber, nonEmptyString, positiveInteger } from "./common.js";

export const clickBodySchema = z
  .object({
    x: finiteNumber,
    y: finiteNumber,
    button: z.enum(["left", "right", "middle"]).optional(),
    label: z.string().optional(),
  })
  .strict();

export const typeTextBodySchema = z
  .object({
    text: z.string(),
    secret: z.boolean().optional(),
    label: z.string().optional(),
  })
  .strict();

export const hotkeyBodySchema = z
  .object({
    keys: z.array(nonEmptyString).min(1),
    label: z.string().optional(),
  })
  .strict();

export const scrollBodySchema = z
  .object({
    direction: z.enum(["up", "down", "left", "right"]),
    amount: positiveInteger.optional(),
    x: finiteNumber.optional(),
    y: finiteNumber.optional(),
    label: z.string().optional(),
  })
  .strict();

export type ClickBody = z.infer<typeof clickBodySchema>;
export type TypeTextBody = z.infer<typeof typeTextBodySchema>;
export type HotkeyBody = z.infer<typeof hotkeyBodySchema>;
export type ScrollBody = z.infer<typeof scrollBodySchema>;
