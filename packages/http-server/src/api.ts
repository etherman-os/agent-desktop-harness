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
  WaitForStableScreenResult,
  VisualHandoff,
  WindowActionResult,
  WindowInfo
} from "@agent-desktop-harness/core";
import { SessionManager } from "@agent-desktop-harness/core";
import { HttpError } from "./errors.js";
import {
  clickBodySchema,
  createAnnotationBodySchema,
  createSessionBodySchema,
  focusWindowBodySchema,
  hotkeyBodySchema,
  launchBodySchema,
  screenshotBodySchema,
  scrollBodySchema,
  sessionIdSchema,
  pngFileNameSchema,
  typeTextBodySchema,
  waitForStableScreenBodySchema
} from "./schemas.js";
import {
  redactErrorMessage,
  redactTypeTextResult,
  serializeLaunchResult,
  serializeScreenshotArtifact,
  serializeScreenshot,
  serializeAnnotation,
  serializeVisualHandoff,
  serializeSession,
  serializeWaitForStableScreenResult
} from "./serializers.js";
import { renderAnnotationUi } from "./annotationUi.js";

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
  getScreenshotFilePath(sessionId: SessionId, fileName: string): string;
  getAnnotationFilePath(sessionId: SessionId, fileName: string): string;
  createAnnotation(
    sessionId: SessionId,
    input: CreateAnnotationInput
  ): Promise<ScreenshotAnnotation>;
  listAnnotations(sessionId: SessionId): Promise<ScreenshotAnnotation[]>;
  getVisualHandoff(sessionId: SessionId): Promise<VisualHandoff>;
  stopSession(sessionId: SessionId): Promise<void>;
}

export class DesktopHttpApi {
  constructor(
    private readonly sessionManager: SessionManagerLike = new SessionManager(),
    private readonly defaultWorkspaceDir: string = process.cwd()
  ) {}

  health(): Record<string, unknown> {
    return {
      ok: true,
      service: "agent-desktop-harness-http",
      version: "0.0.0"
    };
  }

  async createSession(body: unknown): Promise<Record<string, unknown>> {
    const args = createSessionBodySchema.parse(body);
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

    return {
      ok: true,
      session: serializeSession(session)
    };
  }

  listSessions(): Record<string, unknown> {
    return {
      ok: true,
      sessions: this.sessionManager.listSessions().map(serializeSession)
    };
  }

  getSession(sessionId: string): Record<string, unknown> {
    return {
      ok: true,
      session: serializeSession(this.requireSession(sessionId))
    };
  }

  async stopSession(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    await this.sessionManager.stopSession(sessionId);
    return {
      ok: true,
      sessionId
    };
  }

  async launchApp(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = launchBodySchema.parse(body);
    const result = await this.sessionManager.launchApp(sessionId, {
      command: args.command,
      args: args.args ?? [],
      cwd: args.cwd,
      env: args.env
    });

    return {
      ok: true,
      launch: {
        ...serializeLaunchResult(result),
        label: args.label
      }
    };
  }

  async screenshot(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = screenshotBodySchema.parse(body);
    return {
      ok: true,
      screenshot: serializeScreenshot(
        await this.sessionManager.captureScreenshot(sessionId, {
          label: args.label
        })
      )
    };
  }

  async click(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = clickBodySchema.parse(body);
    return {
      ok: true,
      result: await this.sessionManager.click(sessionId, {
        x: args.x,
        y: args.y,
        button: args.button,
        label: args.label
      })
    };
  }

  async doubleClick(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = clickBodySchema.parse(body);
    return {
      ok: true,
      result: await this.sessionManager.doubleClick(sessionId, {
        x: args.x,
        y: args.y,
        button: args.button,
        label: args.label
      })
    };
  }

  async typeText(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = typeTextBodySchema.parse(body);

    try {
      const result = await this.sessionManager.typeText(sessionId, {
        text: args.text,
        secret: args.secret,
        label: args.label
      });

      return {
        ok: true,
        result: args.secret ? redactTypeTextResult(result, args.text.length) : result
      };
    } catch (error) {
      if (args.secret) {
        throw new HttpError(
          500,
          "INTERNAL_ERROR",
          redactErrorMessage(error, args.text)
        );
      }
      throw error;
    }
  }

  async hotkey(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = hotkeyBodySchema.parse(body);
    return {
      ok: true,
      result: await this.sessionManager.hotkey(sessionId, {
        keys: args.keys,
        label: args.label
      })
    };
  }

  async scroll(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = scrollBodySchema.parse(body);
    return {
      ok: true,
      result: await this.sessionManager.scroll(sessionId, {
        direction: args.direction,
        amount: args.amount,
        x: args.x,
        y: args.y,
        label: args.label
      })
    };
  }

  async getWindows(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    return {
      ok: true,
      windows: await this.sessionManager.getWindows(sessionId)
    };
  }

  async focusWindow(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = focusWindowBodySchema.parse(body);
    return {
      ok: true,
      result: await this.sessionManager.focusWindow(sessionId, {
        id: args.id,
        title: args.title,
        titleIncludes: args.titleIncludes,
        pid: args.pid
      })
    };
  }

  async waitForStableScreen(
    sessionId: string,
    body: unknown
  ): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = waitForStableScreenBodySchema.parse(body);
    return {
      ok: true,
      result: serializeWaitForStableScreenResult(
        await this.sessionManager.waitForStableScreen(sessionId, {
          timeoutMs: args.timeoutMs,
          intervalMs: args.intervalMs,
          stableChecks: args.stableChecks,
          label: args.label
        })
      )
    };
  }

  async getEvidenceReport(sessionId: string): Promise<Record<string, unknown>> {
    const session = this.requireSession(sessionId);
    const path = join(session.evidencePath, "report.md");

    try {
      return {
        ok: true,
        sessionId,
        path,
        text: await readFile(path, "utf8")
      };
    } catch {
      throw new HttpError(
        404,
        "EVIDENCE_REPORT_NOT_FOUND",
        `Evidence report is not available for session ${sessionId}. Stop the session first to generate report.md.`
      );
    }
  }

  async listScreenshots(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    return {
      ok: true,
      screenshots: (await this.sessionManager.listScreenshots(sessionId)).map(
        serializeScreenshotArtifact
      )
    };
  }

  async getScreenshotFile(
    sessionId: string,
    fileName: string
  ): Promise<{ readonly path: string; readonly body: Buffer }> {
    this.requireSession(sessionId);
    const safeFileName = pngFileNameSchema.parse(fileName);
    const path = this.sessionManager.getScreenshotFilePath(sessionId, safeFileName);
    try {
      return {
        path,
        body: await readFile(path)
      };
    } catch {
      throw new HttpError(404, "SCREENSHOT_NOT_FOUND", `Screenshot not found: ${safeFileName}`);
    }
  }

  async listAnnotations(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    return {
      ok: true,
      annotations: (await this.sessionManager.listAnnotations(sessionId)).map(serializeAnnotation)
    };
  }

  async createAnnotation(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = createAnnotationBodySchema.parse(body);
    return {
      ok: true,
      annotation: serializeAnnotation(
        await this.sessionManager.createAnnotation(sessionId, args)
      )
    };
  }

  async getAnnotationFile(
    sessionId: string,
    fileName: string
  ): Promise<{ readonly path: string; readonly body: Buffer }> {
    this.requireSession(sessionId);
    const safeFileName = pngFileNameSchema.parse(fileName);
    const path = this.sessionManager.getAnnotationFilePath(sessionId, safeFileName);
    try {
      return {
        path,
        body: await readFile(path)
      };
    } catch {
      throw new HttpError(404, "ANNOTATION_FILE_NOT_FOUND", `Annotation file not found: ${safeFileName}`);
    }
  }

  async getVisualHandoff(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    return {
      ok: true,
      ...serializeVisualHandoff(await this.sessionManager.getVisualHandoff(sessionId))
    };
  }

  getAnnotationUi(sessionId: string, screenshotFileName?: string): string {
    this.requireSession(sessionId);
    const safeFileName =
      screenshotFileName && screenshotFileName.length > 0
        ? pngFileNameSchema.parse(screenshotFileName)
        : undefined;
    return renderAnnotationUi(sessionId, safeFileName);
  }

  private requireSession(sessionId: string): DesktopSession {
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const session = this.sessionManager.getSession(parsedSessionId);
    if (!session) {
      throw new HttpError(
        404,
        "SESSION_NOT_FOUND",
        `Desktop session not found: ${parsedSessionId}`
      );
    }
    return session;
  }
}
