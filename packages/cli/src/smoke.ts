import {
  type DesktopSession,
  type LaunchResult,
  SessionManager,
  type WaitForStableScreenResult,
  type WindowInfo,
} from "@agent-desktop-harness/core";
import {
  type DoctorReport,
  findDependencyStatus,
  formatMissingRequiredMessage,
  getMissingRequiredDependencies,
  runDoctor,
} from "./doctor.js";
import { defaultWorkspacePath } from "./workspace.js";

export interface SmokeX11Args {
  readonly workspacePath: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly text: string;
}

export interface SmokeX11Result {
  readonly sessionId: string;
  readonly display: string;
  readonly evidencePath: string;
  readonly launch: LaunchResult;
  readonly screenshots: readonly string[];
  readonly windows: readonly WindowInfo[];
  readonly focusedWindow?: WindowInfo;
  readonly stableScreen: {
    readonly stable: boolean;
    readonly checks: number;
    readonly elapsedMs: number;
    readonly lastScreenshotPath?: string;
  };
  readonly cleanupSucceeded: boolean;
  readonly stopped: boolean;
}

export interface SmokeX11Options {
  readonly manager?: SessionManager;
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
}

export async function runSmokeX11(
  args: readonly string[],
  options: SmokeX11Options = {},
): Promise<SmokeX11Result> {
  const parsed = parseSmokeX11Args(args);
  const report =
    options.doctorReport ?? (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureSmokeReady(report, parsed.command);

  const manager = options.manager ?? new SessionManager();
  let session: DesktopSession | undefined;
  let cleanupSucceeded = false;
  let cleanupError: unknown;
  let result: Omit<SmokeX11Result, "cleanupSucceeded" | "stopped"> | undefined;

  try {
    session = await manager.createSession({
      workspacePath: parsed.workspacePath,
      policy: {
        allowedCommands: [parsed.command],
      },
    });

    const launch = await manager.launchApp(session.id, {
      command: parsed.command,
      args: parsed.args,
      cwd: parsed.workspacePath,
    });

    await manager.waitForWindow(session.id, {
      excludeDevtools: true,
      preferLargest: true,
      timeoutMs: 5000,
    });
    const windows = await manager.getWindows(session.id);
    const firstScreenshot = await manager.captureScreenshot(session.id, {
      label: "smoke-initial",
    });
    const targetWindow = selectSmokeWindow(windows, parsed.command);
    const focused = await manager.focusWindow(session.id, { id: targetWindow.id });

    await manager.click(session.id, {
      x: 100,
      y: 100,
      label: "smoke-click",
    });
    await manager.typeText(session.id, {
      text: parsed.text,
      label: "smoke-type",
    });

    const secondScreenshot = await manager.captureScreenshot(session.id, {
      label: "smoke-after-type",
    });
    const stableScreen = await manager.waitForStableScreen(session.id, {
      label: "smoke-stable",
      timeoutMs: 3000,
      intervalMs: 500,
      stableChecks: 1,
      mode: "tolerant",
      fileSizeToleranceBytes: 2048,
      retainOnlyLast: true,
    });

    result = {
      sessionId: session.id,
      display: session.display,
      evidencePath: session.evidencePath,
      launch,
      screenshots: [firstScreenshot.path, secondScreenshot.path],
      windows,
      focusedWindow: focused.window,
      stableScreen: formatStableScreenResult(stableScreen),
    };
  } finally {
    if (session) {
      try {
        await manager.stopSession(session.id);
        cleanupSucceeded = true;
      } catch (error) {
        cleanupError = error;
        console.error(
          `Smoke cleanup failed for session ${session.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  if (cleanupError) {
    throw cleanupError;
  }

  if (!result) {
    throw new Error("smoke-x11 did not produce a result.");
  }

  return {
    ...result,
    cleanupSucceeded,
    stopped: cleanupSucceeded,
  };
}

export function parseSmokeX11Args(args: readonly string[]): SmokeX11Args {
  let workspacePath = defaultWorkspacePath();
  let command = "xterm";
  let commandArgs: string[] = [];
  let text = "agent-desktop-harness smoke";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = requireValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--command") {
      command = requireValue(args, index, "--command");
      index += 1;
      continue;
    }

    if (arg === "--args") {
      commandArgs = requireValue(args, index, "--args")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      index += 1;
      continue;
    }

    if (arg === "--text") {
      text = requireValue(args, index, "--text");
      index += 1;
      continue;
    }

    throw new Error(`Unknown smoke-x11 option: ${arg}`);
  }

  return {
    workspacePath,
    command,
    args: commandArgs,
    text,
  };
}

export function ensureSmokeReady(report: DoctorReport, command: string): void {
  const missingRequired = getMissingRequiredDependencies(report.dependencies);
  if (missingRequired.length > 0) {
    throw new Error(formatMissingRequiredMessage(report));
  }

  const xtermStatus = findDependencyStatus(report, "xterm");
  if (command === "xterm" && xtermStatus && !xtermStatus.found) {
    throw new Error(
      [
        "Missing optional smoke dependency for the default demo command: xterm",
        `Install it with: ${xtermStatus.installHint}`,
        "Or pass --command with another allowlisted GUI command.",
      ].join("\n"),
    );
  }
}

function requireValue(args: readonly string[], index: number, optionName: string): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function selectSmokeWindow(windows: readonly WindowInfo[], command: string): WindowInfo {
  const commandName = command.split("/").at(-1)?.toLowerCase() ?? command.toLowerCase();
  const matching = windows.find((window) => window.title.toLowerCase().includes(commandName));

  return matching ?? windows[0]!;
}

async function _waitForWindows(
  manager: SessionManager,
  sessionId: string,
  timeoutMs: number,
): Promise<readonly WindowInfo[]> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const windows = await manager.getWindows(sessionId);
    if (windows.length > 0) {
      return windows;
    }
    await delay(250);
  }

  throw new Error(`No windows appeared within ${timeoutMs}ms during smoke-x11.`);
}

function formatStableScreenResult(
  result: WaitForStableScreenResult,
): SmokeX11Result["stableScreen"] {
  return {
    stable: result.stable,
    checks: result.checks,
    elapsedMs: result.elapsedMs,
    lastScreenshotPath: result.lastScreenshot?.path,
  };
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
