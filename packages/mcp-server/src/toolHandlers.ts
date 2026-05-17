import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  CreateAnnotationInput,
  DesktopSession,
  InputActionResult,
  LaunchResult,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotResult,
  SessionConfig,
  SessionId,
  VisualHandoff,
  WaitForStableScreenResult,
  WindowActionResult,
  WindowInfo
} from "@agent-desktop-harness/core";
import { SessionManager } from "@agent-desktop-harness/core";
import {
  clickSchema,
  createAnnotationSchema,
  focusWindowSchema,
  hotkeySchema,
  launchAppSchema,
  noArgsSchema,
  screenshotSchema,
  scrollSchema,
  sessionIdSchema,
  startSessionSchema,
  typeTextSchema,
  waitForStableScreenSchema
} from "./schemas.js";

export interface SessionManagerLike {
  createSession(config: SessionConfig): Promise<DesktopSession>;
  listSessions(): DesktopSession[];
  getSession(sessionId: SessionId): DesktopSession | undefined;
  launchApp(sessionId: SessionId, launch: {
    command: string;
    args?: readonly string[];
    cwd?: string;
    env?: Readonly<Record<string, string>>;
  }): Promise<LaunchResult>;
  captureScreenshot(sessionId: SessionId, options?: {
    label?: string;
  }): Promise<ScreenshotResult>;
  click(sessionId: SessionId, action: {
    x: number;
    y: number;
    button?: "left" | "right" | "middle";
    label?: string;
  }): Promise<InputActionResult>;
  doubleClick(sessionId: SessionId, action: {
    x: number;
    y: number;
    button?: "left" | "right" | "middle";
    label?: string;
  }): Promise<InputActionResult>;
  typeText(sessionId: SessionId, action: {
    text: string;
    secret?: boolean;
    label?: string;
  }): Promise<InputActionResult>;
  hotkey(sessionId: SessionId, action: {
    keys: readonly string[];
    label?: string;
  }): Promise<InputActionResult>;
  scroll(sessionId: SessionId, action: {
    direction: "up" | "down" | "left" | "right";
    amount?: number;
    x?: number;
    y?: number;
    label?: string;
  }): Promise<InputActionResult>;
  getWindows(sessionId: SessionId): Promise<WindowInfo[]>;
  focusWindow(sessionId: SessionId, target: {
    id?: string;
    title?: string;
    titleIncludes?: string;
    pid?: number;
  }): Promise<WindowActionResult>;
  waitForStableScreen(sessionId: SessionId, options?: {
    timeoutMs?: number;
    intervalMs?: number;
    stableChecks?: number;
    label?: string;
  }): Promise<WaitForStableScreenResult>;
  listScreenshots(sessionId: SessionId): Promise<ScreenshotArtifact[]>;
  createAnnotation(
    sessionId: SessionId,
    input: CreateAnnotationInput
  ): Promise<ScreenshotAnnotation>;
  listAnnotations(sessionId: SessionId): Promise<ScreenshotAnnotation[]>;
  getVisualHandoff(sessionId: SessionId): Promise<VisualHandoff>;
  stopSession(sessionId: SessionId): Promise<void>;
}

export class DesktopMcpToolHandlers {
  constructor(
    private readonly sessionManager: SessionManagerLike = new SessionManager(),
    private readonly defaultWorkspaceDir: string = process.cwd()
  ) {}

  async startSession(input: unknown): Promise<unknown> {
    const args = startSessionSchema.parse(input);
    const workspacePath = resolve(args.workspaceDir ?? this.defaultWorkspaceDir);
    const session = await this.sessionManager.createSession({
      name: args.name,
      workspacePath,
      display: {
        width: args.width,
        height: args.height,
        depth: args.depth
      },
      policy: args.policy
    });

    return serializeSession(session);
  }

  listSessions(input: unknown): unknown {
    noArgsSchema.parse(input);
    return {
      sessions: this.sessionManager.listSessions().map(serializeSession)
    };
  }

  getSession(input: unknown): unknown {
    const args = sessionIdSchema.parse(input);
    return serializeSession(this.requireSession(args.sessionId));
  }

  async launchApp(input: unknown): Promise<unknown> {
    const args = launchAppSchema.parse(input);
    this.requireSession(args.sessionId);
    const result = await this.sessionManager.launchApp(args.sessionId, {
      command: args.command,
      args: args.args ?? [],
      cwd: args.cwd,
      env: args.env
    });

    return {
      ...serializeLaunchResult(result),
      label: args.label
    };
  }

  async screenshot(input: unknown): Promise<unknown> {
    const args = screenshotSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeScreenshot(
      await this.sessionManager.captureScreenshot(args.sessionId, {
        label: args.label
      })
    );
  }

  async click(input: unknown): Promise<unknown> {
    const args = clickSchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.click(args.sessionId, {
      x: args.x,
      y: args.y,
      button: args.button,
      label: args.label
    });
  }

  async doubleClick(input: unknown): Promise<unknown> {
    const args = clickSchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.doubleClick(args.sessionId, {
      x: args.x,
      y: args.y,
      button: args.button,
      label: args.label
    });
  }

  async typeText(input: unknown): Promise<unknown> {
    const args = typeTextSchema.parse(input);
    this.requireSession(args.sessionId);

    try {
      const result = await this.sessionManager.typeText(args.sessionId, {
        text: args.text,
        secret: args.secret,
        label: args.label
      });
      return args.secret ? redactTypeTextResult(result, args.text.length) : result;
    } catch (error) {
      if (args.secret) {
        throw new Error(redactErrorMessage(error, args.text));
      }
      throw error;
    }
  }

  async hotkey(input: unknown): Promise<unknown> {
    const args = hotkeySchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.hotkey(args.sessionId, {
      keys: args.keys,
      label: args.label
    });
  }

  async scroll(input: unknown): Promise<unknown> {
    const args = scrollSchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.scroll(args.sessionId, {
      direction: args.direction,
      amount: args.amount,
      x: args.x,
      y: args.y,
      label: args.label
    });
  }

  async getWindows(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    return {
      windows: await this.sessionManager.getWindows(args.sessionId)
    };
  }

  async focusWindow(input: unknown): Promise<unknown> {
    const args = focusWindowSchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.focusWindow(args.sessionId, {
      id: args.id,
      title: args.title,
      titleIncludes: args.titleIncludes,
      pid: args.pid
    });
  }

  async waitForStableScreen(input: unknown): Promise<unknown> {
    const args = waitForStableScreenSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeWaitForStableScreenResult(
      await this.sessionManager.waitForStableScreen(args.sessionId, {
        timeoutMs: args.timeoutMs,
        intervalMs: args.intervalMs,
        stableChecks: args.stableChecks,
        label: args.label
      })
    );
  }

  async stopSession(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    await this.sessionManager.stopSession(args.sessionId);
    return {
      sessionId: args.sessionId,
      success: true
    };
  }

  async getEvidenceReport(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    const session = this.requireSession(args.sessionId);
    const path = join(session.evidencePath, "report.md");

    try {
      return {
        sessionId: args.sessionId,
        path,
        text: await readFile(path, "utf8")
      };
    } catch (error) {
      throw new Error(
        `Evidence report is not available for session ${args.sessionId}. Stop the session first to generate report.md.`
      );
    }
  }

  async listScreenshots(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    return {
      screenshots: (await this.sessionManager.listScreenshots(args.sessionId)).map(
        serializeScreenshotArtifact
      )
    };
  }

  async createAnnotation(input: unknown): Promise<unknown> {
    const args = createAnnotationSchema.parse(input);
    this.requireSession(args.sessionId);
    const annotation = await this.sessionManager.createAnnotation(args.sessionId, {
      screenshotFileName: args.screenshotFileName,
      type: args.type,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      x2: args.x2,
      y2: args.y2,
      note: args.note,
      color: args.color,
      cropPngBase64: args.cropPngBase64
    });
    return serializeAnnotation(annotation);
  }

  async listAnnotations(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    return {
      annotations: (await this.sessionManager.listAnnotations(args.sessionId)).map(
        serializeAnnotation
      )
    };
  }

  async getVisualHandoff(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeVisualHandoff(await this.sessionManager.getVisualHandoff(args.sessionId));
  }

  private requireSession(sessionId: SessionId): DesktopSession {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Desktop session not found: ${sessionId}`);
    }
    return session;
  }
}

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

function redactErrorMessage(error: unknown, secretText: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (secretText.length === 0) {
    return message;
  }
  return message.split(secretText).join("[redacted]");
}
