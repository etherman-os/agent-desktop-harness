import { z } from "zod";
import { nonEmptyString, positiveInteger } from "./common.js";

export const startLiveObserverBodySchema = z
  .object({
    host: nonEmptyString.optional(),
    vncPort: positiveInteger.optional(),
    webPort: positiveInteger.optional(),
    viewOnly: z.boolean().optional(),
    password: z.string().optional(),
    label: z.string().optional(),
  })
  .strict();

export type StartLiveObserverBody = z.infer<typeof startLiveObserverBodySchema>;
