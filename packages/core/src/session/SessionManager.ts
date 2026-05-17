import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import type {
  ActionLogRecord,
  ClickAction,
  CreateAnnotationInput,
  DesktopSession,
  FocusWindowTarget,
  HotkeyAction,
  InputActionResult,
  LaunchConfig,
  LaunchResult,
  ScrollAction,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotOptions,
  ScreenshotResult,
  SessionConfig,
  SessionId,
  TypeTextAction,
  WaitForStableScreenOptions,
  WaitForStableScreenResult,
  VisualHandoff,
  WindowActionResult,
  WindowInfo
} from "../types.js";
import { XvfbDisplay } from "../display/XvfbDisplay.js";
import type { StartedXvfbDisplay } from "../display/XvfbDisplay.js";
import { EvidenceStore } from "../evidence/EvidenceStore.js";
import { InputService } from "../input/InputService.js";
import { makeTypeTextDetails } from "../input/XdotoolInputBackend.js";
import { PolicyValidator } from "../policy/PolicyValidator.js";
import { ScreenshotService } from "../screenshot/ScreenshotService.js";
import { WindowService } from "../window/WindowService.js";
import { DisplayAllocator } from "./displayAllocator.js";
import { terminateProcessTree } from "./processTree.js";
import { ProcessError, SessionNotFoundError } from "../errors.js";
import {
  createSanitizedEnvironment,
  findExecutableOnPath,
  waitForSpawn
} from "../utils/command.js";
import { ensureDirectory, fileSize, hashFile } from "../utils/fs.js";
import { isoNow, now } from "../utils/time.js";

export interface SessionManagerOptions {
  readonly displayAllocator?: DisplayAllocator;
  readonly displayBackend?: XvfbDisplay;
  readonly evidenceStore?: EvidenceStore;
  readonly inputService?: InputService;
  readonly policyValidator?: PolicyValidator;
  readonly screenshotService?: ScreenshotService;
  readonly windowService?: WindowService;
}

interface ManagedSession {
  session: DesktopSession;
  readonly xvfbProcess?: ChildProcess;
  readonly windowManagerProcess?: ChildProcess;
  readonly appProcesses: ChildProcess[];
  screenshotSequence: number;
  displayReleased: boolean;
}

export class SessionManager {
  private readonly sessions = new Map<SessionId, ManagedSession>();
  private readonly displayAllocator: DisplayAllocator;
  private readonly displayBackend: XvfbDisplay;
  private readonly evidenceStore: EvidenceStore;
  private readonly inputService: InputService;
  private readonly policyValidator: PolicyValidator;
  private readonly screenshotService: ScreenshotService;
  private readonly windowService: WindowService;

  constructor(options: SessionManagerOptions = {}) {
    this.displayAllocator = options.displayAllocator ?? new DisplayAllocator();
    this.displayBackend = options.displayBackend ?? new XvfbDisplay();
    this.evidenceStore = options.evidenceStore ?? new EvidenceStore();
    this.inputService = options.inputService ?? new InputService();
    this.policyValidator = options.policyValidator ?? new PolicyValidator();
    this.screenshotService = options.screenshotService ?? new ScreenshotService();
    this.windowService = options.windowService ?? new WindowService();
  }

  async createSession(config: SessionConfig): Promise<DesktopSession> {
    const workspacePath = resolve(config.workspacePath);
    const normalizedConfig: SessionConfig = {
      ...config,
      workspacePath,
      evidenceRootPath: config.evidenceRootPath
        ? resolve(config.evidenceRootPath)
        : undefined
    };

    this.policyValidator.validateSessionConfig(normalizedConfig);
    await ensureDirectory(workspacePath);

    const width = normalizedConfig.display?.width ?? 1440;
    const height = normalizedConfig.display?.height ?? 900;
    const depth = normalizedConfig.display?.depth ?? 24;
    const allocatedDisplay = await this.displayAllocator.allocate(
      normalizedConfig.display?.displayNumberRange
    );
    const sessionId = randomUUID();
    const evidencePath = this.evidenceStore.getSessionPath(
      workspacePath,
      sessionId,
      normalizedConfig.evidenceRootPath
    );

    let session: DesktopSession = {
      id: sessionId,
      config: normalizedConfig,
      driverKind: "unknown",
      status: "starting",
      createdAt: now(),
      workspacePath,
      evidencePath,
      display: allocatedDisplay.value,
      displayNumber: allocatedDisplay.number,
      width,
      height,
      depth,
      processIds: {
        apps: []
      },
      warnings: []
    };

    let startedDisplay: StartedXvfbDisplay | undefined;

    try {
      await this.evidenceStore.createSession(session);
      await this.appendAction(session, "session.created", "ok", {
        display: session.display,
        width,
        height,
        depth,
        workspacePath,
        evidencePath
      });

      startedDisplay = await this.displayBackend.start({
        display: allocatedDisplay.value,
        width,
        height,
        depth
      });

      session = {
        ...session,
        status: "running",
        processIds: {
          xvfb: startedDisplay.xvfbProcess.pid,
          windowManager: startedDisplay.windowManagerProcess?.pid,
          apps: []
        },
        warnings: startedDisplay.warnings
      };

      const managed: ManagedSession = {
        session,
        xvfbProcess: startedDisplay.xvfbProcess,
        windowManagerProcess: startedDisplay.windowManagerProcess,
        appProcesses: [],
        screenshotSequence: 0,
        displayReleased: false
      };
      this.sessions.set(session.id, managed);

      await this.evidenceStore.writeSession(session);
      await this.appendAction(session, "display.started", "ok", {
        display: session.display,
        pid: session.processIds.xvfb,
        width,
        height,
        depth
      });
      await this.appendAction(session, "window_manager.started", "ok", {
        command: "openbox",
        pid: session.processIds.windowManager,
        skipped: session.processIds.windowManager === undefined,
        warnings: session.warnings
      });

      if (normalizedConfig.command) {
        const [command, ...args] = normalizedConfig.command;
        if (!command) {
          throw new ProcessError("SessionConfig.command cannot be an empty array.");
        }
        await this.launchApp(session.id, {
          command,
          args,
          cwd: workspacePath
        });
        session = this.requireManagedSession(session.id).session;
      }

      return session;
    } catch (error) {
      const failedSession = {
        ...session,
        status: "failed" as const,
        warnings: [
          ...session.warnings,
          error instanceof Error ? error.message : String(error)
        ]
      };

      try {
        await this.appendAction(failedSession, "error", "failed", {
          phase: "createSession"
        }, error);
        await this.evidenceStore.writeSession(failedSession);
      } catch {
        // If evidence creation itself failed, preserve the original startup error.
      }
      if (startedDisplay) {
        await terminateProcessTree(startedDisplay.windowManagerProcess).catch(() => undefined);
        await terminateProcessTree(startedDisplay.xvfbProcess).catch(() => undefined);
      }
      this.sessions.delete(session.id);
      this.displayAllocator.release(allocatedDisplay.number);
      throw error;
    }
  }

  async launchApp(sessionId: SessionId, launch: LaunchConfig): Promise<LaunchResult> {
    const managed = this.requireManagedSession(sessionId);
    const session = managed.session;
    this.ensureRunning(session);
    this.policyValidator.validateLaunchConfig(session, launch);

    const args = [...(launch.args ?? [])];
    const cwd = resolve(launch.cwd ?? session.workspacePath);
    const executable = await findExecutableOnPath(launch.command, process.env, cwd);
    if (!executable) {
      const error = new ProcessError(
        `Launch command was not found or is not executable: ${launch.command}`
      );
      await this.appendAction(session, "app.launched", "failed", {
        command: launch.command,
        argCount: args.length,
        cwd
      }, error);
      throw error;
    }

    const child = spawn(launch.command, args, {
      cwd,
      detached: true,
      env: createSanitizedEnvironment({
        ...session.config.env,
        ...launch.env,
        DISPLAY: session.display,
        AGENT_DESKTOP_HARNESS_SESSION_ID: session.id
      }),
      shell: false,
      stdio: "ignore"
    });

    try {
      await waitForSpawn(child, launch.command);
    } catch (error) {
      await this.appendAction(session, "app.launched", "failed", {
        command: launch.command,
        argCount: args.length,
        cwd
      }, error);
      throw error;
    }

    managed.appProcesses.push(child);
    const updatedSession = this.updateManagedSession(managed, {
      processIds: {
        ...session.processIds,
        apps: managed.appProcesses
          .map((processHandle) => processHandle.pid)
          .filter((pid): pid is number => pid !== undefined)
      }
    });
    await this.evidenceStore.writeSession(updatedSession);
    await this.appendAction(updatedSession, "app.launched", "ok", {
      command: launch.command,
      args,
      cwd,
      pid: child.pid
    });

    if (child.pid === undefined) {
      throw new ProcessError(`Launch command started without a process id: ${launch.command}`);
    }

    return {
      sessionId: session.id,
      processId: child.pid,
      command: launch.command,
      args,
      cwd,
      display: session.display,
      startedAt: now()
    };
  }

  async captureScreenshot(
    sessionId: SessionId,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotResult> {
    const managed = this.requireManagedSession(sessionId);
    const session = managed.session;
    this.ensureRunning(session);

    const sequence = managed.screenshotSequence + 1;
    const filePath = this.evidenceStore.getScreenshotPath(session, sequence, options);

    try {
      const result = await this.screenshotService.capture(
        session,
        filePath,
        sequence,
        options
      );
      managed.screenshotSequence = sequence;
      await this.appendAction(session, "screenshot.captured", "ok", {
        path: result.path,
        display: result.display,
        sequence: result.sequence,
        label: result.label
      });
      return result;
    } catch (error) {
      await this.appendAction(session, "screenshot.captured", "failed", {
        display: session.display,
        sequence,
        label: options.label
      }, error);
      throw error;
    }
  }

  async click(sessionId: SessionId, action: ClickAction): Promise<InputActionResult> {
    return await this.performInputAction(
      sessionId,
      "input.click",
      {
        x: action.x,
        y: action.y,
        button: action.button ?? "left",
        label: action.label
      },
      async (session) => await this.inputService.click(session, action)
    );
  }

  async doubleClick(sessionId: SessionId, action: ClickAction): Promise<InputActionResult> {
    return await this.performInputAction(
      sessionId,
      "input.double_click",
      {
        x: action.x,
        y: action.y,
        button: action.button ?? "left",
        label: action.label
      },
      async (session) => await this.inputService.doubleClick(session, action)
    );
  }

  async typeText(sessionId: SessionId, action: TypeTextAction): Promise<InputActionResult> {
    const details = makeTypeTextDetails(action);
    return await this.performInputAction(
      sessionId,
      "input.type_text",
      details,
      async (session) => await this.inputService.typeText(session, action)
    );
  }

  async hotkey(sessionId: SessionId, action: HotkeyAction): Promise<InputActionResult> {
    return await this.performInputAction(
      sessionId,
      "input.hotkey",
      {
        keys: action.keys,
        label: action.label
      },
      async (session) => await this.inputService.hotkey(session, action)
    );
  }

  async scroll(sessionId: SessionId, action: ScrollAction): Promise<InputActionResult> {
    return await this.performInputAction(
      sessionId,
      "input.scroll",
      {
        direction: action.direction,
        amount: action.amount ?? 1,
        x: action.x,
        y: action.y,
        label: action.label
      },
      async (session) => await this.inputService.scroll(session, action)
    );
  }

  async getWindows(sessionId: SessionId): Promise<WindowInfo[]> {
    const managed = this.requireManagedSession(sessionId);
    const session = managed.session;
    this.ensureRunning(session);

    try {
      const windows = await this.windowService.getWindows(session);
      await this.appendAction(session, "window.list", "ok", {
        count: windows.length,
        windows: windows.map((window) => ({
          id: window.id,
          title: window.title,
          pid: window.pid,
          desktop: window.desktop
        }))
      });
      return windows;
    } catch (error) {
      await this.appendFailure(session, "window.list", {}, error);
      throw error;
    }
  }

  async focusWindow(
    sessionId: SessionId,
    target: FocusWindowTarget
  ): Promise<WindowActionResult> {
    const managed = this.requireManagedSession(sessionId);
    const session = managed.session;
    this.ensureRunning(session);

    try {
      const result = await this.windowService.focusWindow(session, target);
      await this.appendAction(session, "window.focus", "ok", {
        target,
        window: result.window
      });
      return result;
    } catch (error) {
      await this.appendFailure(session, "window.focus", { target }, error);
      throw error;
    }
  }

  async waitForStableScreen(
    sessionId: SessionId,
    options: WaitForStableScreenOptions = {}
  ): Promise<WaitForStableScreenResult> {
    const managed = this.requireManagedSession(sessionId);
    const session = managed.session;
    this.ensureRunning(session);

    const timeoutMs = options.timeoutMs ?? 5000;
    const intervalMs = options.intervalMs ?? 500;
    const stableChecks = options.stableChecks ?? 2;
    const label = options.label ?? "stable-check";

    if (timeoutMs <= 0 || intervalMs <= 0 || stableChecks < 1) {
      throw new ProcessError(
        "waitForStableScreen requires positive timeoutMs, intervalMs, and stableChecks."
      );
    }

    const startTime = Date.now();
    let checks = 0;
    let stableMatches = 0;
    let previousFingerprint: ScreenshotFingerprint | undefined;
    let lastScreenshot: ScreenshotResult | undefined;

    try {
      while (Date.now() - startTime <= timeoutMs) {
        checks += 1;
        lastScreenshot = await this.captureScreenshot(sessionId, {
          label: `${label}-${String(checks).padStart(4, "0")}`
        });

        const currentFingerprint = await fingerprintScreenshot(lastScreenshot.path);
        if (previousFingerprint && fingerprintsMatch(previousFingerprint, currentFingerprint)) {
          stableMatches += 1;
        } else {
          stableMatches = 0;
        }

        if (stableMatches >= stableChecks) {
          const result = {
            sessionId,
            stable: true,
            checks,
            elapsedMs: Date.now() - startTime,
            lastScreenshot
          };
          await this.appendAction(session, "screen.wait_for_stable", "ok", {
            stable: result.stable,
            checks: result.checks,
            elapsedMs: result.elapsedMs,
            lastScreenshot: lastScreenshot.path
          });
          return result;
        }

        previousFingerprint = currentFingerprint;
        await sleep(intervalMs);
      }

      const result = {
        sessionId,
        stable: false,
        checks,
        elapsedMs: Date.now() - startTime,
        lastScreenshot
      };
      await this.appendAction(session, "screen.wait_for_stable", "ok", {
        stable: result.stable,
        checks: result.checks,
        elapsedMs: result.elapsedMs,
        lastScreenshot: lastScreenshot?.path
      });
      return result;
    } catch (error) {
      await this.appendFailure(session, "screen.wait_for_stable", {
        timeoutMs,
        intervalMs,
        stableChecks,
        label
      }, error);
      throw error;
    }
  }

  async stopSession(sessionId: SessionId): Promise<void> {
    const managed = this.requireManagedSession(sessionId);
    const session = managed.session;

    if (session.status === "stopped") {
      return;
    }

    this.updateManagedSession(managed, { status: "stopping" });
    await this.evidenceStore.writeSession(managed.session);

    const cleanupErrors: string[] = [];

    for (const appProcess of [...managed.appProcesses].reverse()) {
      try {
        await terminateProcessTree(appProcess);
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
    }

    try {
      await terminateProcessTree(managed.windowManagerProcess);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }

    try {
      await terminateProcessTree(managed.xvfbProcess);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    } finally {
      if (!managed.displayReleased) {
        this.displayAllocator.release(session.displayNumber);
        managed.displayReleased = true;
      }
    }

    const stoppedSession = this.updateManagedSession(managed, {
      status: cleanupErrors.length === 0 ? "stopped" : "failed",
      stoppedAt: now(),
      warnings: [...managed.session.warnings, ...cleanupErrors]
    });

    await this.appendAction(stoppedSession, "session.stopped", cleanupErrors.length === 0 ? "ok" : "failed", {
      display: stoppedSession.display,
      processIds: stoppedSession.processIds
    }, cleanupErrors.length > 0 ? new Error(cleanupErrors.join("; ")) : undefined);
    await this.evidenceStore.writeSession(stoppedSession);
    await this.evidenceStore.writeReport(stoppedSession);

    if (cleanupErrors.length > 0) {
      throw new ProcessError(`Session cleanup failed: ${cleanupErrors.join("; ")}`);
    }
  }

  async listScreenshots(sessionId: SessionId): Promise<ScreenshotArtifact[]> {
    const managed = this.requireManagedSession(sessionId);
    return await this.evidenceStore.listScreenshots(managed.session);
  }

  getScreenshotFilePath(sessionId: SessionId, fileName: string): string {
    const managed = this.requireManagedSession(sessionId);
    return this.evidenceStore.getScreenshotFilePath(managed.session, fileName);
  }

  getAnnotationFilePath(sessionId: SessionId, fileName: string): string {
    const managed = this.requireManagedSession(sessionId);
    return this.evidenceStore.getAnnotationFilePath(managed.session, fileName);
  }

  async createAnnotation(
    sessionId: SessionId,
    input: CreateAnnotationInput
  ): Promise<ScreenshotAnnotation> {
    const managed = this.requireManagedSession(sessionId);
    const annotation = await this.evidenceStore.createAnnotation(managed.session, input);
    await this.appendAction(managed.session, "annotation.created", "ok", {
      annotationId: annotation.id,
      screenshotFileName: annotation.screenshotFileName,
      type: annotation.type,
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
      x2: annotation.x2,
      y2: annotation.y2,
      hasCrop: annotation.cropPath !== undefined
    });
    return annotation;
  }

  async listAnnotations(sessionId: SessionId): Promise<ScreenshotAnnotation[]> {
    const managed = this.requireManagedSession(sessionId);
    return await this.evidenceStore.listAnnotations(managed.session);
  }

  async getVisualHandoff(sessionId: SessionId): Promise<VisualHandoff> {
    const managed = this.requireManagedSession(sessionId);
    return await this.evidenceStore.getVisualHandoff(managed.session);
  }

  async regenerateVisualHandoff(sessionId: SessionId): Promise<VisualHandoff> {
    const managed = this.requireManagedSession(sessionId);
    return await this.evidenceStore.regenerateVisualHandoff(managed.session);
  }

  getSession(sessionId: SessionId): DesktopSession | undefined {
    return this.sessions.get(sessionId)?.session;
  }

  listSessions(): DesktopSession[] {
    return [...this.sessions.values()].map((managed) => managed.session);
  }

  async start(config: SessionConfig): Promise<DesktopSession> {
    return await this.createSession(config);
  }

  async stop(sessionId: SessionId): Promise<void> {
    await this.stopSession(sessionId);
  }

  get(sessionId: SessionId): DesktopSession | undefined {
    return this.getSession(sessionId);
  }

  private async performInputAction(
    sessionId: SessionId,
    type: Extract<ActionLogRecord["type"], `input.${string}`>,
    details: Readonly<Record<string, unknown>>,
    action: (session: DesktopSession) => Promise<InputActionResult>
  ): Promise<InputActionResult> {
    const managed = this.requireManagedSession(sessionId);
    const session = managed.session;
    this.ensureRunning(session);

    try {
      const result = await action(session);
      await this.appendAction(session, type, "ok", details);
      return result;
    } catch (error) {
      await this.appendFailure(session, type, details, error);
      throw error;
    }
  }

  private requireManagedSession(sessionId: SessionId): ManagedSession {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      throw new SessionNotFoundError(sessionId);
    }
    return managed;
  }

  private updateManagedSession(
    managed: ManagedSession,
    patch: Partial<DesktopSession>
  ): DesktopSession {
    managed.session = {
      ...managed.session,
      ...patch
    };
    return managed.session;
  }

  private ensureRunning(session: DesktopSession): void {
    if (session.status !== "running") {
      throw new ProcessError(`Session ${session.id} is not running; status is ${session.status}.`);
    }
  }

  private async appendAction(
    session: DesktopSession,
    type: ActionLogRecord["type"],
    status: ActionLogRecord["status"],
    details?: Readonly<Record<string, unknown>>,
    error?: unknown
  ): Promise<void> {
    await this.evidenceStore.appendAction(session, {
      timestamp: isoNow(),
      sessionId: session.id,
      type,
      status,
      details,
      errorMessage: error instanceof Error ? error.message : undefined
    });
  }

  private async appendFailure(
    session: DesktopSession,
    type: ActionLogRecord["type"],
    details: Readonly<Record<string, unknown>>,
    error: unknown
  ): Promise<void> {
    await this.appendAction(session, type, "failed", details, error);
    await this.appendAction(session, "error", "failed", {
      phase: type,
      ...details
    }, error);
  }
}

interface ScreenshotFingerprint {
  readonly size: number;
  readonly hash: string;
}

async function fingerprintScreenshot(path: string): Promise<ScreenshotFingerprint> {
  return {
    size: await fileSize(path),
    hash: await hashFile(path)
  };
}

function fingerprintsMatch(
  left: ScreenshotFingerprint,
  right: ScreenshotFingerprint
): boolean {
  return left.size === right.size && left.hash === right.hash;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
