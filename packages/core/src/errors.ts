export class HarnessError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "HarnessError";
  }
}

export class MissingDependencyError extends HarnessError {
  constructor(command: string, installHint: string, cause?: unknown) {
    super(
      "MISSING_DEPENDENCY",
      `Missing dependency: ${command}. ${installHint}`,
      cause
    );
    this.name = "MissingDependencyError";
  }
}

export class PolicyError extends HarnessError {
  constructor(message: string) {
    super("POLICY_DENIED", message);
    this.name = "PolicyError";
  }
}

export class SessionNotFoundError extends HarnessError {
  constructor(sessionId: string) {
    super("SESSION_NOT_FOUND", `Desktop session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

export class ProcessError extends HarnessError {
  constructor(message: string, cause?: unknown) {
    super("PROCESS_ERROR", message, cause);
    this.name = "ProcessError";
  }
}
