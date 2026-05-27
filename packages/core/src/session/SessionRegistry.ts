import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { StartedXvfbDisplay } from "../display/XvfbDisplay.js";
import { XvfbDisplay } from "../display/XvfbDisplay.js";
import { ProcessError, SessionNotFoundError } from "../errors.js";
import { EvidenceStore } from "../evidence/EvidenceStore.js";
import type { PolicyValidator } from "../policy/PolicyValidator.js";
import type {
  ActionLogRecord,
  DesktopSession,
  LaunchConfig,
  LaunchResult,
  SessionConfig,
  SessionId,
} from "../types.js";
import {
  createSanitizedEnvironment,
  findExecutableOnPath,
  waitForSpawn,
} from "../utils/command.js";
import { ensureDirectory } from "../utils/fs.js";
import { isoNow, now } from "../utils/time.js";
import { DisplayAllocator } from "./displayAllocator.js";
import { terminateProcessTree } from "./processTree.js";

export interface ManagedSession {
  session: DesktopSession;
  readonly xvfbProcess?: ChildProcess;
  readonly windowManagerProcess?: ChildProcess;
  readonly appProcesses: ChildProcess[];
  screenshotSequence: number;
  displayReleased: boolean;
}

export class SessionRegistry {
  readonly sessions = new Map<SessionId, ManagedSession>();
  readonly displayAllocator: DisplayAllocator;
  readonly displayBackend: XvfbDisplay;
  readonly evidenceStore: EvidenceStore;

  constructor(
    displayAllocator?: DisplayAllocator,
    displayBackend?: XvfbDisplay,
    evidenceStore?: EvidenceStore,
  ) {
    this.displayAllocator = displayAllocator ?? new DisplayAllocator();
    this.displayBackend = displayBackend ?? new XvfbDisplay();
    this.evidenceStore = evidenceStore ?? new EvidenceStore();
  }

  async createSession(
    config: SessionConfig,
    policyValidator: PolicyValidator,
  ): Promise<DesktopSession> {
    const workspacePath = resolve(config.workspacePath);
    const normalizedConfig: SessionConfig = {
      ...config,
      workspacePath,
      evidenceRootPath: config.evidenceRootPath ? resolve(config.evidenceRootPath) : undefined,
    };

    policyValidator.validateSessionConfig(normalizedConfig);
    await ensureDirectory(workspacePath);

    const width = normalizedConfig.display?.width ?? 1440;
    const height = normalizedConfig.display?.height ?? 900;
    const depth = normalizedConfig.display?.depth ?? 24;
    const allocatedDisplay = await this.displayAllocator.allocate(
      normalizedConfig.display?.displayNumberRange,
    );
    const sessionId = randomUUID();
    const evidencePath = this.evidenceStore.getSessionPath(
      workspacePath,
      sessionId,
      normalizedConfig.evidenceRootPath,
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
      processIds: { apps: [] },
      warnings: [],
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
        evidencePath,
      });

      startedDisplay = await this.displayBackend.start({
        display: allocatedDisplay.value,
        width,
        height,
        depth,
      });

      session = {
        ...session,
        status: "running",
        processIds: {
          xvfb: startedDisplay.xvfbProcess.pid,
          windowManager: startedDisplay.windowManagerProcess?.pid,
          apps: [],
        },
        warnings: startedDisplay.warnings,
      };

      const managed: ManagedSession = {
        session,
        xvfbProcess: startedDisplay.xvfbProcess,
        windowManagerProcess: startedDisplay.windowManagerProcess,
        appProcesses: [],
        screenshotSequence: 0,
        displayReleased: false,
      };
      this.sessions.set(session.id, managed);

      await this.evidenceStore.writeSession(session);
      await this.appendAction(session, "display.started", "ok", {
        display: session.display,
        pid: session.processIds.xvfb,
        width,
        height,
        depth,
      });
      await this.appendAction(session, "window_manager.started", "ok", {
        command: "openbox",
        pid: session.processIds.windowManager,
        skipped: session.processIds.windowManager === undefined,
        warnings: session.warnings,
      });

      return session;
    } catch (error) {
      const failedSession = {
        ...session,
        status: "failed" as const,
        warnings: [...session.warnings, error instanceof Error ? error.message : String(error)],
      };

      try {
        await this.appendAction(
          failedSession,
          "error",
          "failed",
          { phase: "createSession" },
          error,
        );
        await this.evidenceStore.writeSession(failedSession);
      } catch (evidenceError) {
        console.error("Failed to record session evidence:", evidenceError);
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

  async launchApp(session: DesktopSession, launch: LaunchConfig): Promise<LaunchResult> {
    const managed = this.requireManagedSession(session.id);
    const args = [...(launch.args ?? [])];
    const cwd = resolve(launch.cwd ?? session.workspacePath);
    const executable = await findExecutableOnPath(launch.command, process.env, cwd);
    if (!executable) {
      const error = new ProcessError(
        `Launch command was not found or is not executable: ${launch.command}`,
      );
      await this.appendAction(
        session,
        "app.launched",
        "failed",
        {
          command: launch.command,
          argCount: args.length,
          cwd,
        },
        error,
      );
      throw error;
    }

    const child = spawn(launch.command, args, {
      cwd,
      detached: true,
      env: createSanitizedEnvironment({
        ...session.config.env,
        ...launch.env,
        DISPLAY: session.display,
        AGENT_DESKTOP_HARNESS_SESSION_ID: session.id,
      }),
      shell: false,
      stdio: "ignore",
    });

    try {
      await waitForSpawn(child, launch.command);
    } catch (error) {
      await this.appendAction(
        session,
        "app.launched",
        "failed",
        {
          command: launch.command,
          argCount: args.length,
          cwd,
        },
        error,
      );
      throw error;
    }

    managed.appProcesses.push(child);
    this.updateManagedSession(managed, {
      processIds: {
        ...session.processIds,
        apps: managed.appProcesses
          .map((p) => p.pid)
          .filter((pid): pid is number => pid !== undefined),
      },
    });
    await this.evidenceStore.writeSession(managed.session);
    await this.appendAction(managed.session, "app.launched", "ok", {
      command: launch.command,
      args,
      cwd,
      pid: child.pid,
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
      startedAt: now(),
    };
  }

  getSession(sessionId: SessionId): DesktopSession | undefined {
    return this.sessions.get(sessionId)?.session;
  }

  listSessions(): DesktopSession[] {
    return [...this.sessions.values()].map((m) => m.session);
  }

  requireManagedSession(sessionId: SessionId): ManagedSession {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      throw new SessionNotFoundError(sessionId);
    }
    return managed;
  }

  updateManagedSession(managed: ManagedSession, patch: Partial<DesktopSession>): DesktopSession {
    managed.session = { ...managed.session, ...patch };
    return managed.session;
  }

  ensureRunning(session: DesktopSession): void {
    if (session.status !== "running") {
      throw new ProcessError(`Session ${session.id} is not running; status is ${session.status}.`);
    }
  }

  async appendAction(
    session: DesktopSession,
    type: ActionLogRecord["type"],
    status: ActionLogRecord["status"],
    details?: Readonly<Record<string, unknown>>,
    error?: unknown,
  ): Promise<void> {
    await this.evidenceStore.appendAction(session, {
      timestamp: isoNow(),
      sessionId: session.id,
      type,
      status,
      details,
      errorMessage: error instanceof Error ? error.message : undefined,
    });
  }

  async appendFailure(
    session: DesktopSession,
    type: ActionLogRecord["type"],
    details: Readonly<Record<string, unknown>>,
    error: unknown,
  ): Promise<void> {
    await this.appendAction(session, type, "failed", details, error);
    await this.appendAction(session, "error", "failed", { phase: type, ...details }, error);
  }
}
