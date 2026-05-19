import type {
  BrowserActionResult,
  BrowserPageRef,
  DesktopSession,
  AppActionResult,
  AppRef,
  DriverRouteDecision,
  DriverRouterStatus,
  ElectronActionResult,
  ElectronAppRef,
  ElectronDriverStatus,
  InputActionResult,
  LaunchResult,
  LiveObserverRef,
  LiveObserverStatus,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotResult,
  TauriActionResult,
  TauriAppRef,
  TauriDriverStatus,
  VisualBaselineRef,
  VisualCompareResult,
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

export function serializeBrowserPageRef(page: BrowserPageRef): Record<string, unknown> {
  return {
    sessionId: page.sessionId,
    pageId: page.pageId,
    url: page.url,
    title: page.title,
    createdAt: page.createdAt
  };
}

export function serializeBrowserActionResult(
  result: BrowserActionResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    pageId: result.pageId,
    actionType: result.actionType,
    success: result.success,
    createdAt: result.createdAt,
    details: result.details
  };
}

export function serializeTauriDriverStatus(
  status: TauriDriverStatus
): Record<string, unknown> {
  return {
    available: status.available,
    tauriDriverPath: status.tauriDriverPath,
    webKitWebDriverPath: status.webKitWebDriverPath,
    cargoPath: status.cargoPath,
    warnings: status.warnings,
    errors: status.errors
  };
}

export function serializeTauriAppRef(app: TauriAppRef): Record<string, unknown> {
  return {
    sessionId: app.sessionId,
    appId: app.appId,
    webdriverUrl: app.webdriverUrl,
    processId: app.processId,
    createdAt: app.createdAt,
    mode: app.mode,
    warnings: app.warnings
  };
}

export function serializeTauriActionResult(
  result: TauriActionResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    appId: result.appId,
    actionType: result.actionType,
    success: result.success,
    mode: result.mode,
    createdAt: result.createdAt,
    details: result.details,
    warnings: result.warnings
  };
}

export function serializeElectronDriverStatus(
  status: ElectronDriverStatus
): Record<string, unknown> {
  return {
    available: status.available,
    playwrightAvailable: status.playwrightAvailable,
    electronBinaryPath: status.electronBinaryPath,
    warnings: status.warnings,
    errors: status.errors
  };
}

export function serializeElectronAppRef(app: ElectronAppRef): Record<string, unknown> {
  return {
    sessionId: app.sessionId,
    appId: app.appId,
    createdAt: app.createdAt,
    mode: app.mode,
    processId: app.processId,
    windowTitle: app.windowTitle,
    warnings: app.warnings
  };
}

export function serializeElectronActionResult(
  result: ElectronActionResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    appId: result.appId,
    actionType: result.actionType,
    success: result.success,
    mode: result.mode,
    createdAt: result.createdAt,
    details: result.details,
    warnings: result.warnings
  };
}

export function serializeLiveObserverStatus(
  status: LiveObserverStatus
): Record<string, unknown> {
  return {
    available: status.available,
    x11vncPath: status.x11vncPath,
    websockifyPath: status.websockifyPath,
    novncProxyPath: status.novncProxyPath,
    novncPath: status.novncPath,
    noVncWebRootPath: status.noVncWebRootPath,
    warnings: status.warnings,
    errors: status.errors,
    installHints: status.installHints
  };
}

export function serializeLiveObserverRef(
  observer: LiveObserverRef
): Record<string, unknown> {
  return {
    sessionId: observer.sessionId,
    observerId: observer.observerId,
    host: observer.host,
    vncPort: observer.vncPort,
    webPort: observer.webPort,
    viewOnly: observer.viewOnly,
    url: observer.url,
    createdAt: observer.createdAt,
    warnings: observer.warnings
  };
}

export function serializeDriverRouterStatus(
  status: DriverRouterStatus
): Record<string, unknown> {
  return {
    browser: status.browser,
    tauri: status.tauri,
    electron: status.electron,
    x11Fallback: status.x11Fallback
  };
}

export function serializeDriverRouteDecision(
  decision: DriverRouteDecision
): Record<string, unknown> {
  return {
    appKind: decision.appKind,
    selectedDriver: decision.selectedDriver,
    selectionMode: decision.selectionMode,
    semantic: decision.semantic,
    fallbackUsed: decision.fallbackUsed,
    fallbackReason: decision.fallbackReason,
    warnings: decision.warnings,
    errors: decision.errors
  };
}

export function serializeAppRef(app: AppRef): Record<string, unknown> {
  return {
    sessionId: app.sessionId,
    appId: app.appId,
    appKind: app.appKind,
    selectedDriver: app.selectedDriver,
    semantic: app.semantic,
    fallbackUsed: app.fallbackUsed,
    createdAt: app.createdAt,
    processId: app.processId,
    warnings: app.warnings
  };
}

export function serializeAppActionResult(
  result: AppActionResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    appId: result.appId,
    appKind: result.appKind,
    selectedDriver: result.selectedDriver,
    semantic: result.semantic,
    fallbackUsed: result.fallbackUsed,
    actionType: result.actionType,
    success: result.success,
    createdAt: result.createdAt,
    warnings: result.warnings,
    details: result.details
  };
}

export function serializeVisualCompareResult(
  result: VisualCompareResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    label: result.label,
    kind: result.kind,
    baselineName: result.baselineName,
    baselineSuite: result.baselineSuite,
    annotationId: result.annotationId,
    annotationNote: result.annotationNote,
    beforePath: result.beforePath,
    afterPath: result.afterPath,
    diffPath: result.diffPath,
    region: result.region,
    allowedRegions: result.allowedRegions,
    width: result.width,
    height: result.height,
    comparedPixels: result.comparedPixels,
    diffPixels: result.diffPixels,
    diffPixelRatio: result.diffPixelRatio,
    threshold: result.threshold,
    minDiffPixelRatio: result.minDiffPixelRatio,
    maxDiffPixelRatio: result.maxDiffPixelRatio,
    maxOutsideDiffPixelRatio: result.maxOutsideDiffPixelRatio,
    minInsideDiffPixelRatio: result.minInsideDiffPixelRatio,
    insideComparedPixels: result.insideComparedPixels,
    insideDiffPixels: result.insideDiffPixels,
    insideDiffPixelRatio: result.insideDiffPixelRatio,
    outsideComparedPixels: result.outsideComparedPixels,
    outsideDiffPixels: result.outsideDiffPixels,
    outsideDiffPixelRatio: result.outsideDiffPixelRatio,
    containmentPassed: result.containmentPassed,
    passed: result.passed,
    createdAt: result.createdAt,
    warnings: result.warnings
  };
}

export function serializeVisualBaseline(
  baseline: VisualBaselineRef
): Record<string, unknown> {
  return {
    name: baseline.name,
    suite: baseline.suite,
    path: baseline.path,
    sourceScreenshotPath: baseline.sourceScreenshotPath,
    width: baseline.width,
    height: baseline.height,
    createdAt: baseline.createdAt,
    updatedAt: baseline.updatedAt,
    metadata: baseline.metadata
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
    mode: result.mode,
    retainedScreenshots: result.retainedScreenshots?.map(serializeScreenshot),
    discardedScreenshotCount: result.discardedScreenshotCount,
    lastScreenshot: result.lastScreenshot
      ? serializeScreenshot(result.lastScreenshot)
      : undefined,
    reason: result.reason
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
