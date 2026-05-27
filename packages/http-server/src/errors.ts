import {
  MissingDependencyError,
  PolicyError,
  SessionNotFoundError,
} from "@agent-desktop-harness/core";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface ErrorResponse {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export function errorToHttpResponse(error: unknown): {
  readonly statusCode: number;
  readonly body: ErrorResponse;
} {
  if (error instanceof HttpError) {
    return makeError(error.statusCode, error.code, error.message);
  }

  if (error instanceof z.ZodError) {
    return makeError(400, "VALIDATION_ERROR", formatZodError(error));
  }

  if (error instanceof SessionNotFoundError) {
    return makeError(404, "SESSION_NOT_FOUND", error.message);
  }

  if (error instanceof PolicyError) {
    return makeError(403, "POLICY_DENIED", error.message);
  }

  if (error instanceof MissingDependencyError) {
    return makeError(503, "MISSING_DEPENDENCY", error.message);
  }

  if (error instanceof Error && error.message.startsWith("Desktop session not found:")) {
    return makeError(404, "SESSION_NOT_FOUND", error.message);
  }

  return makeError(500, "INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
}

function makeError(
  statusCode: number,
  code: string,
  message: string,
): { readonly statusCode: number; readonly body: ErrorResponse } {
  return {
    statusCode,
    body: {
      ok: false,
      error: {
        code,
        message,
      },
    },
  };
}

function formatZodError(error: z.ZodError): string {
  return `Invalid request: ${error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ")}`;
}
