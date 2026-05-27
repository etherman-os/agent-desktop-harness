import { z } from "zod";
import { finiteNumber, nonEmptyString, positiveInteger } from "./common.js";

export const clickSchema = z
  .object({
    sessionId: nonEmptyString,
    x: finiteNumber,
    y: finiteNumber,
    button: z.enum(["left", "right", "middle"]).optional(),
    label: z.string().optional(),
  })
  .strict();

export const typeTextSchema = z
  .object({
    sessionId: nonEmptyString,
    text: z.string(),
    secret: z.boolean().optional(),
    label: z.string().optional(),
  })
  .strict();

export const hotkeySchema = z
  .object({
    sessionId: nonEmptyString,
    keys: z.array(nonEmptyString).min(1),
    label: z.string().optional(),
  })
  .strict();

export const scrollSchema = z
  .object({
    sessionId: nonEmptyString,
    direction: z.enum(["up", "down", "left", "right"]),
    amount: positiveInteger.optional(),
    x: finiteNumber.optional(),
    y: finiteNumber.optional(),
    label: z.string().optional(),
  })
  .strict();

export type ClickInput = z.infer<typeof clickSchema>;
export type TypeTextInput = z.infer<typeof typeTextSchema>;
export type HotkeyInput = z.infer<typeof hotkeySchema>;
export type ScrollInput = z.infer<typeof scrollSchema>;
