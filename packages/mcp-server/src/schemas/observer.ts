import { z } from "zod";
import { nonEmptyString, positiveInteger } from "./common.js";

export const observerStartSchema = z
  .object({
    sessionId: nonEmptyString,
    host: nonEmptyString.optional(),
    vncPort: positiveInteger.optional(),
    webPort: positiveInteger.optional(),
    viewOnly: z.boolean().optional(),
    password: z.string().optional(),
    label: z.string().optional(),
  })
  .strict();

export const observerListSchema = z.object({ sessionId: nonEmptyString.optional() }).strict();

export const observerStopSchema = z
  .object({
    sessionId: nonEmptyString,
    observerId: nonEmptyString.optional(),
  })
  .strict();

export type ObserverStartInput = z.infer<typeof observerStartSchema>;
export type ObserverListInput = z.infer<typeof observerListSchema>;
export type ObserverStopInput = z.infer<typeof observerStopSchema>;
