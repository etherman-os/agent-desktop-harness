import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@agent-desktop-harness/core";
import type { ElectronDriverStatus } from "@agent-desktop-harness/core";
import type { DoctorReport } from "./doctor.js";
import { formatMissingRequiredMessage, getMissingRequiredDependencies, runDoctor } from "./doctor.js";
import { parseCommandLine } from "./tauriDriverSmoke.js";
import { repoRootPath } from "./repo.js";
import { defaultWorkspacePath } from "./workspace.js";

const SAMPLE_ELECTRON_APP_PATH = "examples/sample-electron-app";
const SAMPLE_TEXT = "hello from electron semantic driver";

export interface SmokeElectronDriverArgs {
  readonly workspacePath: string;
  readonly command?: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly executablePath?: string;
  readonly appPath?: string;
  readonly windowTitleIncludes?: string;
  readonly text: string;
  readonly timeoutMs: number;
}

export interface SmokeElectronDriverResult {
  readonly skipped: boolean;
  readonly reason?: string;
  readonly status: ElectronDriverStatus;
  readonly sessionId?: string;
  readonly evidencePath?: string;
  readonly mode?: "playwright-electron" | "x11-fallback";
  readonly warnings?: readonly string[];
  readonly appId?: string;
  readonly processId?: number;
  readonly windowTitle?: string;
  readonly screenshots?: readonly string[];
  readonly semanticAsserted?: boolean;
  readonly cleanupSucceeded: boolean;
  readonly stopped: boolean;
}

export interface SmokeElectronDriverOptions {
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
  readonly sessionManager?: SessionManager;
  readonly env?: NodeJS.ProcessEnv;
  readonly sampleElectronBinaryPath?: string;
}

export async function runSmokeElectronDriver(
  args: readonly string[],
  options: SmokeElectronDriverOptions = {}
): Promise<SmokeElectronDriverResult> {
  const env = options.env ?? process.env;
  const parsed = await resolveSmokeElectronDriverConfig(
    parseSmokeElectronDriverArgs(args, env),
    options.sampleElectronBinaryPath
  );
  const report =
    options.doctorReport ??
    (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureElectronDriverSmokeReady(report);

  const manager = options.sessionManager ?? new SessionManager();
  const status = normalizeSmokeElectronStatus(await manager.getElectronDriverStatus(), parsed);
  if (!status.available) {
    return skippedResult(
      status,
      "Playwright Electron API is unavailable; Electron semantic smoke cannot run."
    );
  }
  if (!parsed.command && !parsed.executablePath) {
    return skippedResult(
      status,
      "No Electron app configured and sample Electron app dependency is not installed. Run pnpm install or set AGENT_DESKTOP_HARNESS_ELECTRON_COMMAND."
    );
  }

  let sessionId: string | undefined;
  let stopped = false;
  let cleanupError: unknown;

  try {
    const allowedCommands = parsed.command ? [parsed.command] : [];
    const session = await manager.createSession({
      workspacePath: parsed.workspacePath,
      policy: {
        allowedCommands
      }
    });
    sessionId = session.id;

    const app = await manager.openElectronApp(session.id, {
      command: parsed.command,
      args: parsed.args,
      cwd: parsed.cwd,
      executablePath: parsed.executablePath,
      appPath: parsed.appPath,
      timeoutMs: parsed.timeoutMs,
      windowTitleIncludes: parsed.windowTitleIncludes,
      excludeDevtools: true,
      label: "electron-driver-smoke"
    });

    const initialScreenshot = await manager.electronScreenshot(session.id, {
      appId: app.appId,
      label: "electron-driver-initial",
      fullPage: false
    });

    let semanticAsserted = false;
    if (app.mode === "playwright-electron") {
      await manager.electronFill(session.id, {
        appId: app.appId,
        placeholder: "Type a message",
        value: parsed.text,
        timeoutMs: parsed.timeoutMs
      });
      await manager.electronClick(session.id, {
        appId: app.appId,
        role: "button",
        name: "Save message",
        timeoutMs: parsed.timeoutMs,
        label: "electron-driver-click-save"
      });
      const saved = await manager.electronAssertText(session.id, {
        appId: app.appId,
        text: "Status: saved",
        timeoutMs: parsed.timeoutMs,
        label: "electron-driver-assert-saved"
      });
      await manager.electronAssertText(session.id, {
        appId: app.appId,
        text: parsed.text,
        timeoutMs: parsed.timeoutMs,
        label: "electron-driver-assert-message"
      });
      await manager.electronClick(session.id, {
        appId: app.appId,
        role: "button",
        name: "Open details",
        timeoutMs: parsed.timeoutMs,
        label: "electron-driver-click-details"
      });
      const details = await manager.electronAssertText(session.id, {
        appId: app.appId,
        text: "Details panel is open",
        timeoutMs: parsed.timeoutMs,
        label: "electron-driver-assert-details"
      });
      semanticAsserted = saved.success && details.success;
    }

    const detailsScreenshot = await manager.electronScreenshot(session.id, {
      appId: app.appId,
      label: "electron-driver-details-open",
      fullPage: false
    });

    await manager.closeElectronApp(session.id, app.appId);
    await manager.stopSession(session.id);
    stopped = true;

    return {
      skipped: false,
      status,
      sessionId: session.id,
      evidencePath: session.evidencePath,
      mode: app.mode,
      warnings: app.warnings,
      appId: app.appId,
      processId: app.processId,
      windowTitle: app.windowTitle,
      screenshots: [initialScreenshot.path, detailsScreenshot.path],
      semanticAsserted,
      cleanupSucceeded: true,
      stopped
    };
  } finally {
    if (sessionId && !stopped) {
      try {
        await manager.stopSession(sessionId);
        stopped = true;
      } catch (error) {
        cleanupError = error;
      }
    }
    if (cleanupError) {
      throw cleanupError;
    }
  }
}

export function parseSmokeElectronDriverArgs(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): SmokeElectronDriverArgs {
  let workspacePath = env.AGENT_DESKTOP_HARNESS_ELECTRON_CWD ?? defaultWorkspacePath();
  let cwd = env.AGENT_DESKTOP_HARNESS_ELECTRON_CWD;
  let command: string | undefined;
  let commandArgs: readonly string[] = [];
  let executablePath = env.AGENT_DESKTOP_HARNESS_ELECTRON_EXECUTABLE_PATH;
  let appPath = env.AGENT_DESKTOP_HARNESS_ELECTRON_APP_PATH;
  let windowTitleIncludes = env.AGENT_DESKTOP_HARNESS_ELECTRON_WINDOW_TITLE;
  let text = env.AGENT_DESKTOP_HARNESS_ELECTRON_TEXT ?? SAMPLE_TEXT;
  let timeoutMs = env.AGENT_DESKTOP_HARNESS_ELECTRON_TIMEOUT_MS
    ? parsePositiveInteger(env.AGENT_DESKTOP_HARNESS_ELECTRON_TIMEOUT_MS, "timeout")
    : 30_000;

  if (env.AGENT_DESKTOP_HARNESS_ELECTRON_COMMAND) {
    const parsedCommand = parseCommandLine(env.AGENT_DESKTOP_HARNESS_ELECTRON_COMMAND);
    command = parsedCommand[0];
    commandArgs = parsedCommand.slice(1);
  }
  if (env.AGENT_DESKTOP_HARNESS_ELECTRON_ARGS) {
    commandArgs = [...commandArgs, ...parseCommandLine(env.AGENT_DESKTOP_HARNESS_ELECTRON_ARGS)];
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = requireValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--cwd") {
      cwd = requireValue(args, index, "--cwd");
      workspacePath = cwd;
      index += 1;
      continue;
    }

    if (arg === "--command") {
      const parsedCommand = parseCommandLine(requireValue(args, index, "--command"));
      command = parsedCommand[0];
      commandArgs = parsedCommand.slice(1);
      index += 1;
      continue;
    }

    if (arg === "--args") {
      commandArgs = parseCommandLine(requireValue(args, index, "--args"));
      index += 1;
      continue;
    }

    if (arg === "--executable-path") {
      executablePath = requireValue(args, index, "--executable-path");
      index += 1;
      continue;
    }

    if (arg === "--app-path") {
      appPath = requireValue(args, index, "--app-path");
      index += 1;
      continue;
    }

    if (arg === "--window-title") {
      windowTitleIncludes = requireValue(args, index, "--window-title");
      index += 1;
      continue;
    }

    if (arg === "--text") {
      text = requireValue(args, index, "--text");
      index += 1;
      continue;
    }

    if (arg === "--timeout-ms") {
      timeoutMs = parsePositiveInteger(requireValue(args, index, "--timeout-ms"), "timeout");
      index += 1;
      continue;
    }

    throw new Error(`Unknown smoke-electron-driver option: ${arg}`);
  }

  return {
    workspacePath,
    command,
    args: commandArgs,
    cwd,
    executablePath,
    appPath,
    windowTitleIncludes,
    text,
    timeoutMs
  };
}

export async function resolveSmokeElectronDriverConfig(
  parsed: SmokeElectronDriverArgs,
  sampleElectronBinaryPath = defaultSampleElectronBinaryPath()
): Promise<SmokeElectronDriverArgs> {
  if (parsed.command || parsed.executablePath) {
    return parsed;
  }

  if (!(await isExecutable(sampleElectronBinaryPath))) {
    return parsed;
  }

  const samplePath = join(repoRootPath(), SAMPLE_ELECTRON_APP_PATH);
  return {
    ...parsed,
    workspacePath: samplePath,
    cwd: samplePath,
    command: sampleElectronBinaryPath,
    args: ["."],
    windowTitleIncludes: parsed.windowTitleIncludes ?? "Agent Desktop Harness Electron Demo"
  };
}

export function ensureElectronDriverSmokeReady(report: DoctorReport): void {
  if (getMissingRequiredDependencies(report.dependencies).length > 0) {
    throw new Error(formatMissingRequiredMessage(report));
  }
}

function skippedResult(status: ElectronDriverStatus, reason: string): SmokeElectronDriverResult {
  return {
    skipped: true,
    reason,
    status,
    cleanupSucceeded: true,
    stopped: true
  };
}

function normalizeSmokeElectronStatus(
  status: ElectronDriverStatus,
  parsed: SmokeElectronDriverArgs
): ElectronDriverStatus {
  if (status.electronBinaryPath || !parsed.command?.includes("/")) {
    return status;
  }

  return {
    ...status,
    electronBinaryPath: parsed.command,
    warnings: status.warnings.filter(
      (warning) => !warning.includes("No electron binary was found")
    )
  };
}

function defaultSampleElectronBinaryPath(): string {
  return join(repoRootPath(), SAMPLE_ELECTRON_APP_PATH, "node_modules", ".bin", "electron");
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function requireValue(
  args: readonly string[],
  index: number,
  optionName: string
): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}
