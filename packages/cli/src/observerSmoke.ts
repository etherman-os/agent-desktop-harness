import type {
  DesktopSession,
  LiveObserverRef,
  LiveObserverStatus,
} from "@agent-desktop-harness/core";
import { SessionManager } from "@agent-desktop-harness/core";
import {
  type DoctorReport,
  formatMissingRequiredMessage,
  getMissingRequiredDependencies,
  runDoctor,
} from "./doctor.js";
import type { FetchLike } from "./httpSmoke.js";
import { defaultWorkspacePath } from "./workspace.js";

export interface ObserverStatusCommandResult {
  readonly status: LiveObserverStatus;
}
export interface SmokeObserverArgs {
  readonly workspacePath: string;
  readonly vncPort?: number;
  readonly webPort?: number;
}

export interface SmokeObserverResult {
  readonly skipped: boolean;
  readonly skipReason?: string;
  readonly observerStatus: LiveObserverStatus;
  readonly sessionId?: string;
  readonly display?: string;
  readonly evidencePath?: string;
  readonly observer?: LiveObserverRef;
  readonly observerHttpStatus?: number;
  readonly cleanupSucceeded: boolean;
  readonly observerStopped: boolean;
  readonly stopped: boolean;
}

export interface SmokeObserverOptions {
  readonly manager?: SessionManager;
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
  readonly fetch?: FetchLike;
}

export async function runObserverStatusCommand(
  manager = new SessionManager(),
): Promise<ObserverStatusCommandResult> {
  return {
    status: await manager.getLiveObserverStatus(),
  };
}

export async function runSmokeObserver(
  args: readonly string[],
  options: SmokeObserverOptions = {},
): Promise<SmokeObserverResult> {
  const parsed = parseSmokeObserverArgs(args);
  const report =
    options.doctorReport ?? (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureObserverSmokeBaseReady(report);

  const manager = options.manager ?? new SessionManager();
  const observerStatus = await manager.getLiveObserverStatus();
  if (!observerStatus.available) {
    return {
      skipped: true,
      skipReason: [
        "Live observer dependencies are unavailable.",
        ...observerStatus.errors,
        ...observerStatus.installHints.map((hint) => `Install hint: ${hint}`),
      ].join(" "),
      observerStatus,
      cleanupSucceeded: true,
      observerStopped: false,
      stopped: false,
    };
  }

  const fetchLike = options.fetch ?? globalThis.fetch;
  let session: DesktopSession | undefined;
  let observer: LiveObserverRef | undefined;
  let observerStopped = false;
  let stopped = false;
  let result:
    | Omit<SmokeObserverResult, "cleanupSucceeded" | "observerStopped" | "stopped">
    | undefined;
  let runError: unknown;
  let cleanupError: unknown;

  try {
    session = await manager.createSession({
      workspacePath: parsed.workspacePath,
    });

    observer = await manager.startLiveObserver(session.id, {
      vncPort: parsed.vncPort,
      webPort: parsed.webPort,
      viewOnly: true,
      label: "observer-smoke",
    });

    const response = await fetchLike(observer.url);
    if (!response.ok) {
      throw new Error(`Observer URL did not respond OK: HTTP ${response.status}.`);
    }
    const html = await response.text();
    if (!html.toLowerCase().includes("novnc") && !html.toLowerCase().includes("vnc")) {
      throw new Error("Observer URL responded, but it did not look like noVNC HTML.");
    }

    await manager.stopLiveObserver(session.id, observer.observerId);
    observerStopped = true;

    await manager.stopSession(session.id);
    stopped = true;

    result = {
      skipped: false,
      observerStatus,
      sessionId: session.id,
      display: session.display,
      evidencePath: session.evidencePath,
      observer,
      observerHttpStatus: response.status,
    };
  } catch (error) {
    runError = error;
  } finally {
    if (session && observer && !observerStopped) {
      try {
        await manager.stopLiveObserver(session.id, observer.observerId);
        observerStopped = true;
      } catch (error) {
        cleanupError = cleanupError ?? error;
      }
    }
    if (session && !stopped) {
      try {
        await manager.stopSession(session.id);
        stopped = true;
      } catch (error) {
        cleanupError = cleanupError ?? error;
      }
    }
  }

  if (runError) {
    throw runError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
  if (!result) {
    throw new Error("smoke-observer did not produce a result.");
  }

  return {
    ...result,
    cleanupSucceeded: observerStopped && stopped,
    observerStopped,
    stopped,
  };
}

export function parseSmokeObserverArgs(args: readonly string[]): SmokeObserverArgs {
  let workspacePath = defaultWorkspacePath();
  let vncPort: number | undefined;
  let webPort: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = requireValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--vnc-port") {
      vncPort = parsePort(requireValue(args, index, "--vnc-port"));
      index += 1;
      continue;
    }

    if (arg === "--web-port") {
      webPort = parsePort(requireValue(args, index, "--web-port"));
      index += 1;
      continue;
    }

    throw new Error(`Unknown smoke-observer option: ${arg}`);
  }

  return {
    workspacePath,
    vncPort,
    webPort,
  };
}

function ensureObserverSmokeBaseReady(report: DoctorReport): void {
  const missingRequired = getMissingRequiredDependencies(report.dependencies);
  if (missingRequired.length > 0) {
    throw new Error(formatMissingRequiredMessage(report));
  }
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function requireValue(args: readonly string[], index: number, optionName: string): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}
