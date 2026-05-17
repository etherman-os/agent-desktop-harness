import type {
  DesktopSession,
  InputActionResult,
  LaunchResult,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotResult,
  VisualHandoff,
  WaitForStableScreenResult
} from "@agent-desktop-harness/core";

export function serializeSession(session: DesktopSession): Record<string, unknown> {
  return {
    id: session.id,
    name: session.config.name,
    status: session.status,
    display: session.display,
    displayNumber: session.displayNumber,
    width: session.width,
    height: session.height,
    depth: session.depth,
    workspacePath: session.workspacePath,
    evidencePath: session.evidencePath,
    createdAt: session.createdAt.toISOString(),
    stoppedAt: session.stoppedAt?.toISOString(),
    processIds: session.processIds,
    warnings: session.warnings
  };
}

export function serializeLaunchResult(result: LaunchResult): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    processId: result.processId,
    command: result.command,
    args: result.args,
    cwd: result.cwd,
    display: result.display,
    startedAt: result.startedAt.toISOString()
  };
}

export function serializeScreenshot(result: ScreenshotResult): Record<string, unknown> {
  return {
    artifactId: result.artifactId,
    sessionId: result.sessionId,
    path: result.path,
    width: result.width,
    height: result.height,
    capturedAt: result.capturedAt.toISOString(),
    createdAt: result.createdAt.toISOString(),
    display: result.display,
    sequence: result.sequence,
    label: result.label
  };
}

export function serializeScreenshotArtifact(
  artifact: ScreenshotArtifact
): Record<string, unknown> {
  return {
    sessionId: artifact.sessionId,
    fileName: artifact.fileName,
    path: artifact.path,
    sequence: artifact.sequence,
    label: artifact.label,
    createdAt: artifact.createdAt
  };
}

export function serializeAnnotation(
  annotation: ScreenshotAnnotation
): Record<string, unknown> {
  return {
    id: annotation.id,
    sessionId: annotation.sessionId,
    screenshotPath: annotation.screenshotPath,
    screenshotFileName: annotation.screenshotFileName,
    type: annotation.type,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
    x2: annotation.x2,
    y2: annotation.y2,
    note: annotation.note,
    color: annotation.color,
    cropPath: annotation.cropPath,
    createdAt: annotation.createdAt
  };
}

export function serializeVisualHandoff(handoff: VisualHandoff): Record<string, unknown> {
  return {
    sessionId: handoff.sessionId,
    path: handoff.path,
    text: handoff.text,
    annotations: handoff.annotations.map(serializeAnnotation)
  };
}

export function serializeWaitForStableScreenResult(
  result: WaitForStableScreenResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    stable: result.stable,
    checks: result.checks,
    elapsedMs: result.elapsedMs,
    lastScreenshot: result.lastScreenshot
      ? serializeScreenshot(result.lastScreenshot)
      : undefined
  };
}

export function redactTypeTextResult(
  result: InputActionResult,
  textLength: number
): InputActionResult {
  return {
    ...result,
    details: {
      redacted: true,
      textLength
    }
  };
}

export function redactErrorMessage(error: unknown, secretText: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (secretText.length === 0) {
    return message;
  }
  return message.split(secretText).join("[redacted]");
}
