import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { SessionManager } from "@agent-desktop-harness/core";
import type { TauriDriverStatus } from "@agent-desktop-harness/core";
import type { DoctorReport } from "./doctor.js";
import { formatMissingRequiredMessage, getMissingRequiredDependencies, runDoctor } from "./doctor.js";
import { collectChildOutput } from "./processUtils.js";
import { defaultWorkspacePath } from "./workspace.js";

export interface SmokeTauriDriverArgs {
  readonly workspacePath: string;
  readonly command?: readonly string[];
  readonly cwd?: string;
  readonly applicationPath?: string;
  readonly prelaunchCommand?: readonly string[];
  readonly prelaunchCwd?: string;
  readonly prelaunchWaitUrl?: string;
  readonly prelaunchTimeoutMs: number;
  readonly windowTitleIncludes?: string;
  readonly webdriverPort?: number;
  readonly assertText?: string;
  readonly timeoutMs: number;
}

export interface SmokeTauriDriverResult {
  readonly skipped: boolean;
  readonly reason?: string;
  readonly status: TauriDriverStatus;
  readonly sessionId?: string;
  readonly evidencePath?: string;
  readonly mode?: "webdriver" | "x11-fallback";
  readonly warnings?: readonly string[];
  readonly appId?: string;
  readonly processId?: number;
  readonly screenshotPath?: string;
  readonly semanticAsserted?: boolean;
  readonly prelaunchStopped?: boolean;
  readonly cleanupSucceeded: boolean;
  readonly stopped: boolean;
}

export interface SmokeTauriDriverOptions {
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
  readonly sessionManager?: SessionManager;
  readonly env?: NodeJS.ProcessEnv;
}

export async function runSmokeTauriDriver(
  args: readonly string[],
  options: SmokeTauriDriverOptions = {}
): Promise<SmokeTauriDriverResult> {
  const env = options.env ?? process.env;
  const parsed = parseSmokeTauriDriverArgs(args, env);
  const report =
    options.doctorReport ??
    (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureTauriDriverSmokeReady(report);

  const manager = options.sessionManager ?? new SessionManager();
  const status = await manager.getTauriDriverStatus();
  if (!parsed.command) {
    return skippedResult(
      status,
      "No Tauri app configured. Set AGENT_DESKTOP_HARNESS_TAURI_COMMAND and AGENT_DESKTOP_HARNESS_TAURI_CWD."
    );
  }
  if (!status.available) {
    return skippedResult(
      status,
      "Tauri WebDriver prerequisites are unavailable; install tauri-driver and the native WebDriver backend before running this semantic smoke."
    );
  }

  let sessionId: string | undefined;
  let prelaunchProcess: ChildProcess | undefined;
  let stopped = false;
  let cleanupError: unknown;

  try {
    if (parsed.prelaunchCommand) {
      prelaunchProcess = startPrelaunchProcess(
        parsed.prelaunchCommand,
        parsed.prelaunchCwd ?? parsed.cwd ?? parsed.workspacePath
      );
      const prelaunchOutput = collectChildOutput(prelaunchProcess);
      if (parsed.prelaunchWaitUrl) {
        await waitForPrelaunchUrl(
          parsed.prelaunchWaitUrl,
          prelaunchProcess,
          prelaunchOutput,
          parsed.prelaunchTimeoutMs
        );
      } else {
        await delay(Math.min(parsed.prelaunchTimeoutMs, 1000));
        if (prelaunchProcess.exitCode !== null || prelaunchProcess.signalCode !== null) {
          throw new Error(formatPrelaunchExitedMessage(prelaunchOutput));
        }
      }
    }

    const [command, ...commandArgs] = parsed.command;
    if (!command) {
      throw new Error("smoke-tauri-driver command cannot be empty.");
    }

    const session = await manager.createSession({
      workspacePath: parsed.workspacePath,
      policy: {
        allowedCommands: [command]
      }
    });
    sessionId = session.id;

    const app = await manager.openTauriApp(session.id, {
      command,
      args: commandArgs,
      cwd: parsed.cwd,
      applicationPath: parsed.applicationPath,
      webdriverPort: parsed.webdriverPort,
      timeoutMs: parsed.timeoutMs,
      windowTitleIncludes: parsed.windowTitleIncludes,
      label: "tauri-driver-smoke"
    });

    if (app.mode === "x11-fallback") {
      await manager.waitForWindow(session.id, {
        titleIncludes: parsed.windowTitleIncludes,
        excludeDevtools: true,
        preferLargest: true,
        timeoutMs: parsed.timeoutMs,
        intervalMs: 500
      });
    }

    let semanticAsserted = false;
    if (app.mode === "webdriver" && parsed.assertText) {
      const assertResult = await manager.tauriAssertText(session.id, {
        appId: app.appId,
        text: parsed.assertText,
        timeoutMs: parsed.timeoutMs,
        label: "tauri-driver-smoke-assert"
      });
      semanticAsserted = assertResult.success;
    }

    const screenshot = await manager.tauriScreenshot(session.id, {
      appId: app.appId,
      label: "tauri-driver-smoke"
    });
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
      screenshotPath: screenshot.path,
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
    if (prelaunchProcess) {
      try {
        await stopPrelaunchProcess(prelaunchProcess);
      } catch (error) {
        cleanupError = cleanupError ?? error;
      }
    }
    if (cleanupError) {
      throw cleanupError;
    }
  }
}

export function parseSmokeTauriDriverArgs(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): SmokeTauriDriverArgs {
  let workspacePath = env.AGENT_DESKTOP_HARNESS_TAURI_CWD ?? defaultWorkspacePath();
  let command = env.AGENT_DESKTOP_HARNESS_TAURI_COMMAND
    ? parseCommandLine(env.AGENT_DESKTOP_HARNESS_TAURI_COMMAND)
    : undefined;
  let cwd = env.AGENT_DESKTOP_HARNESS_TAURI_CWD;
  let applicationPath =
    env.AGENT_DESKTOP_HARNESS_TAURI_APP_PATH ??
    env.AGENT_DESKTOP_HARNESS_TAURI_APPLICATION;
  let prelaunchCommand = env.AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_COMMAND
    ? parseCommandLine(env.AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_COMMAND)
    : undefined;
  let prelaunchCwd = env.AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_CWD;
  let prelaunchWaitUrl = env.AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_WAIT_URL;
  let prelaunchTimeoutMs = env.AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_TIMEOUT_MS
    ? parsePositiveInteger(
        env.AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_TIMEOUT_MS,
        "prelaunch timeout"
      )
    : 10_000;
  let windowTitleIncludes = env.AGENT_DESKTOP_HARNESS_TAURI_WINDOW_TITLE;
  let webdriverPort = env.AGENT_DESKTOP_HARNESS_TAURI_WEBDRIVER_PORT
    ? parsePort(env.AGENT_DESKTOP_HARNESS_TAURI_WEBDRIVER_PORT)
    : undefined;
  let assertText = env.AGENT_DESKTOP_HARNESS_TAURI_ASSERT_TEXT;
  let timeoutMs = env.AGENT_DESKTOP_HARNESS_TAURI_TIMEOUT_MS
    ? parsePositiveInteger(env.AGENT_DESKTOP_HARNESS_TAURI_TIMEOUT_MS, "timeout")
    : 30_000;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = requireValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--command") {
      command = parseCommandLine(requireValue(args, index, "--command"));
      index += 1;
      continue;
    }

    if (arg === "--cwd") {
      cwd = requireValue(args, index, "--cwd");
      workspacePath = cwd;
      index += 1;
      continue;
    }

    if (arg === "--application" || arg === "--app-path") {
      applicationPath = requireValue(args, index, "--application");
      index += 1;
      continue;
    }

    if (arg === "--prelaunch-command") {
      prelaunchCommand = parseCommandLine(requireValue(args, index, "--prelaunch-command"));
      index += 1;
      continue;
    }

    if (arg === "--prelaunch-cwd") {
      prelaunchCwd = requireValue(args, index, "--prelaunch-cwd");
      index += 1;
      continue;
    }

    if (arg === "--prelaunch-wait-url") {
      prelaunchWaitUrl = requireValue(args, index, "--prelaunch-wait-url");
      index += 1;
      continue;
    }

    if (arg === "--prelaunch-timeout-ms") {
      prelaunchTimeoutMs = parsePositiveInteger(
        requireValue(args, index, "--prelaunch-timeout-ms"),
        "prelaunch timeout"
      );
      index += 1;
      continue;
    }

    if (arg === "--window-title") {
      windowTitleIncludes = requireValue(args, index, "--window-title");
      index += 1;
      continue;
    }

    if (arg === "--webdriver-port") {
      webdriverPort = parsePort(requireValue(args, index, "--webdriver-port"));
      index += 1;
      continue;
    }

    if (arg === "--assert-text") {
      assertText = requireValue(args, index, "--assert-text");
      index += 1;
      continue;
    }

    if (arg === "--timeout-ms") {
      timeoutMs = parsePositiveInteger(requireValue(args, index, "--timeout-ms"), "timeout");
      index += 1;
      continue;
    }

    throw new Error(`Unknown smoke-tauri-driver option: ${arg}`);
  }

  return {
    workspacePath,
    command,
    cwd,
    applicationPath,
    prelaunchCommand,
    prelaunchCwd,
    prelaunchWaitUrl,
    prelaunchTimeoutMs,
    windowTitleIncludes,
    webdriverPort,
    assertText,
    timeoutMs
  };
}

export function parseCommandLine(commandLine: string): readonly string[] {
  const result: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const char of commandLine.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        result.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping || quote) {
    throw new Error("Invalid command line: unterminated escape or quote.");
  }
  if (current.length > 0) {
    result.push(current);
  }
  if (result.length === 0) {
    throw new Error("Command line cannot be empty.");
  }
  return result;
}

export function ensureTauriDriverSmokeReady(report: DoctorReport): void {
  if (getMissingRequiredDependencies(report.dependencies).length > 0) {
    throw new Error(formatMissingRequiredMessage(report));
  }
}

function skippedResult(status: TauriDriverStatus, reason: string): SmokeTauriDriverResult {
  return {
    skipped: true,
    reason,
    status,
    cleanupSucceeded: true,
    stopped: true
  };
}

function startPrelaunchProcess(command: readonly string[], cwd: string): ChildProcess {
  const [binary, ...args] = command;
  if (!binary) {
    throw new Error("Tauri prelaunch command cannot be empty.");
  }

  return spawn(binary, args, {
    cwd,
    env: process.env,
    shell: false,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function waitForPrelaunchUrl(
  url: string,
  child: ChildProcess,
  output: { readonly stdout: string; readonly stderr: string },
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(formatPrelaunchExitedMessage(output));
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(200);
  }

  throw new Error(
    `Tauri prelaunch command did not become ready at ${url} within ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function stopPrelaunchProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (!isNoSuchProcessError(error)) {
      child.kill("SIGTERM");
    }
  }

  if (await waitForExit(child, 3000)) {
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (!isNoSuchProcessError(error)) {
      child.kill("SIGKILL");
    }
  }
  await waitForExit(child, 1000);
}

function formatPrelaunchExitedMessage(output: {
  readonly stdout: string;
  readonly stderr: string;
}): string {
  return [
    "Tauri prelaunch command exited before it became ready.",
    output.stderr.trim() ? `stderr:\n${output.stderr.trim()}` : undefined,
    output.stdout.trim() ? `stdout:\n${output.stdout.trim()}` : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onExit = (): void => {
      cleanup();
      resolve(true);
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      child.off("exit", onExit);
    };

    child.once("exit", onExit);
  });
}

function isNoSuchProcessError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ESRCH"
  );
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

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
