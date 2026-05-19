import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createServer } from "node:net";
import type { DesktopSession, SessionId } from "../types.js";
import { ProcessError } from "../errors.js";
import { createSanitizedEnvironment, waitForSpawn } from "../utils/command.js";
import { terminateProcessTree } from "../session/processTree.js";
import { isoNow } from "../utils/time.js";
import { getLiveObserverStatus } from "./observerStatus.js";
import type {
  LiveObserverRef,
  LiveObserverStatus,
  ManagedLiveObserver,
  StartLiveObserverOptions,
  StopLiveObserverResult
} from "./observerTypes.js";

export interface NoVncObserverOptions {
  readonly portAllocator?: (host: string) => Promise<number>;
}

export interface X11VncCommandOptions {
  readonly display: string;
  readonly vncPort: number;
  readonly viewOnly: boolean;
  readonly passwordFilePath?: string;
}

export interface NoVncProxyCommandOptions {
  readonly host: string;
  readonly webPort: number;
  readonly vncPort: number;
}

export interface WebsockifyCommandOptions extends NoVncProxyCommandOptions {
  readonly noVncWebRootPath: string;
}

export class NoVncObserver {
  private readonly observers = new Map<string, ManagedLiveObserver>();
  private readonly observersBySession = new Map<SessionId, Set<string>>();
  private readonly portAllocator: (host: string) => Promise<number>;

  constructor(options: NoVncObserverOptions = {}) {
    this.portAllocator = options.portAllocator ?? allocateTcpPort;
  }

  async status(): Promise<LiveObserverStatus> {
    return await getLiveObserverStatus();
  }

  async start(
    session: DesktopSession,
    options: StartLiveObserverOptions = {}
  ): Promise<LiveObserverRef> {
    const host = normalizeObserverHost(options.host);
    const viewOnly = options.viewOnly ?? true;
    const status = await this.status();

    if (!status.available) {
      throw new ProcessError(
        [
          "Live observer dependencies are unavailable.",
          ...status.errors,
          ...status.installHints.map((hint) => `Install hint: ${hint}`)
        ].join(" ")
      );
    }

    const vncPort = await resolvePort(host, options.vncPort, this.portAllocator);
    const webPort = await resolvePort(host, options.webPort, this.portAllocator);
    if (vncPort === webPort) {
      throw new ProcessError("Live observer requires distinct VNC and web ports.");
    }

    const passwordFilePath = options.password
      ? await writeObserverPasswordFile(options.password)
      : undefined;

    const x11vncArgs = buildX11VncArgs({
      display: session.display,
      vncPort,
      viewOnly,
      passwordFilePath
    });
    const x11vncCommand = status.x11vncPath ?? "x11vnc";
    const x11vncProcess = spawn(x11vncCommand, x11vncArgs, {
      detached: true,
      env: createSanitizedEnvironment({
        DISPLAY: session.display,
        AGENT_DESKTOP_HARNESS_SESSION_ID: session.id
      }),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    try {
      await waitForSpawn(x11vncProcess, "x11vnc");
      await assertStillRunning(x11vncProcess, "x11vnc");
    } catch (error) {
      await terminateProcessTree(x11vncProcess).catch(() => undefined);
      if (passwordFilePath) {
        await removeObserverPasswordFile(passwordFilePath);
      }
      throw error;
    }

    const proxy = status.novncProxyPath
      ? {
          command: status.novncProxyPath,
          args: buildNoVncProxyArgs({ host, webPort, vncPort })
        }
      : {
          command: status.websockifyPath ?? "websockify",
          args: buildWebsockifyArgs({
            host,
            webPort,
            vncPort,
            noVncWebRootPath: requireNoVncWebRoot(status)
          })
        };

    const proxyProcess = spawn(proxy.command, proxy.args, {
      detached: true,
      env: createSanitizedEnvironment({
        DISPLAY: session.display,
        AGENT_DESKTOP_HARNESS_SESSION_ID: session.id
      }),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    try {
      await waitForSpawn(proxyProcess, proxy.command);
      await assertStillRunning(proxyProcess, proxy.command);
    } catch (error) {
      await terminateProcessTree(proxyProcess).catch(() => undefined);
      await terminateProcessTree(x11vncProcess).catch(() => undefined);
      if (passwordFilePath) {
        await removeObserverPasswordFile(passwordFilePath);
      }
      throw error;
    }

    const observerId = randomUUID();
    const observer: ManagedLiveObserver = {
      sessionId: session.id,
      observerId,
      host,
      vncPort,
      webPort,
      viewOnly,
      url: makeNoVncUrl(host, webPort, viewOnly),
      createdAt: isoNow(),
      warnings: status.warnings,
      x11vncProcess,
      proxyProcess,
      passwordFilePath,
      x11vncCommand: [x11vncCommand, ...redactPasswordFileArg(x11vncArgs)],
      proxyCommand: [proxy.command, ...proxy.args]
    };

    this.remember(observer);
    return toObserverRef(observer);
  }

  list(sessionId?: SessionId): LiveObserverRef[] {
    if (!sessionId) {
      return [...this.observers.values()].map(toObserverRef);
    }

    const observerIds = this.observersBySession.get(sessionId) ?? new Set<string>();
    return [...observerIds]
      .map((observerId) => this.observers.get(observerId))
      .filter((observer): observer is ManagedLiveObserver => observer !== undefined)
      .map(toObserverRef);
  }

  async stop(
    sessionId: SessionId,
    observerId?: string
  ): Promise<StopLiveObserverResult> {
    const observer = this.resolveObserver(sessionId, observerId);
    if (!observer) {
      const resolvedObserverId = observerId ?? "";
      return {
        sessionId,
        observerId: resolvedObserverId,
        stopped: false
      };
    }

    await terminateProcessTree(observer.proxyProcess).catch(() => undefined);
    await terminateProcessTree(observer.x11vncProcess).catch(() => undefined);
    if (observer.passwordFilePath) {
      await removeObserverPasswordFile(observer.passwordFilePath);
    }
    this.forget(observer);

    return {
      sessionId,
      observerId: observer.observerId,
      stopped: true
    };
  }

  async stopAll(sessionId?: SessionId): Promise<void> {
    const observers = sessionId
      ? this.list(sessionId)
      : this.list();

    for (const observer of observers) {
      await this.stop(observer.sessionId, observer.observerId);
    }
  }

  private remember(observer: ManagedLiveObserver): void {
    this.observers.set(observer.observerId, observer);
    const observerIds = this.observersBySession.get(observer.sessionId) ?? new Set<string>();
    observerIds.add(observer.observerId);
    this.observersBySession.set(observer.sessionId, observerIds);
  }

  private forget(observer: ManagedLiveObserver): void {
    this.observers.delete(observer.observerId);
    const observerIds = this.observersBySession.get(observer.sessionId);
    observerIds?.delete(observer.observerId);
    if (observerIds && observerIds.size === 0) {
      this.observersBySession.delete(observer.sessionId);
    }
  }

  private resolveObserver(
    sessionId: SessionId,
    observerId?: string
  ): ManagedLiveObserver | undefined {
    if (observerId) {
      const observer = this.observers.get(observerId);
      return observer?.sessionId === sessionId ? observer : undefined;
    }

    const observerIds = this.observersBySession.get(sessionId);
    const lastObserverId = observerIds ? [...observerIds].at(-1) : undefined;
    return lastObserverId ? this.observers.get(lastObserverId) : undefined;
  }
}

export function buildX11VncArgs(options: X11VncCommandOptions): string[] {
  const args = [
    "-display",
    options.display,
    "-rfbport",
    String(options.vncPort),
    "-localhost",
    "-forever",
    "-shared",
    "-quiet"
  ];

  if (options.viewOnly) {
    args.push("-viewonly");
  }

  if (options.passwordFilePath) {
    args.push("-passwdfile", options.passwordFilePath);
  } else {
    args.push("-nopw");
  }

  return args;
}

export function buildNoVncProxyArgs(options: NoVncProxyCommandOptions): string[] {
  return [
    "--listen",
    `${options.host}:${options.webPort}`,
    "--vnc",
    `${options.host}:${options.vncPort}`
  ];
}

export function buildWebsockifyArgs(options: WebsockifyCommandOptions): string[] {
  return [
    "--web",
    options.noVncWebRootPath,
    `${options.host}:${options.webPort}`,
    `${options.host}:${options.vncPort}`
  ];
}

export function normalizeObserverHost(host = "127.0.0.1"): string {
  if (host !== "127.0.0.1") {
    throw new ProcessError(
      "Live observer is local-only in this MVP. Use host 127.0.0.1 and an SSH tunnel for remote viewing."
    );
  }

  return host;
}

export function makeNoVncUrl(host: string, webPort: number, viewOnly: boolean): string {
  const url = new URL(`http://${host}:${webPort}/vnc.html`);
  url.searchParams.set("autoconnect", "1");
  url.searchParams.set("resize", "scale");
  if (viewOnly) {
    url.searchParams.set("view_only", "1");
  }
  return url.toString();
}

export function redactObserverStartDetails(
  options: StartLiveObserverOptions
): Record<string, unknown> {
  return {
    host: options.host ?? "127.0.0.1",
    vncPort: options.vncPort,
    webPort: options.webPort,
    viewOnly: options.viewOnly ?? true,
    passwordProvided: options.password !== undefined,
    label: options.label
  };
}

async function resolvePort(
  host: string,
  port: number | undefined,
  portAllocator: (host: string) => Promise<number>
): Promise<number> {
  if (port === undefined) {
    return await portAllocator(host);
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ProcessError(`Invalid observer port: ${String(port)}`);
  }

  await assertPortAvailable(host, port);
  return port;
}

export async function allocateTcpPort(host = "127.0.0.1"): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new ProcessError("Could not allocate an observer TCP port."));
        }
      });
    });
  });
}

async function assertPortAvailable(host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", () => {
      reject(new ProcessError(`Observer port is not available: ${host}:${port}`));
    });
    server.listen(port, host, () => {
      server.close(() => resolve());
    });
  });
}

async function writeObserverPasswordFile(password: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agent-desktop-harness-observer-"));
  const path = join(dir, "passwd");
  await writeFile(path, password, { mode: 0o600 });
  return path;
}

async function removeObserverPasswordFile(path: string): Promise<void> {
  await rm(dirname(path), { recursive: true, force: true }).catch(() => undefined);
}

async function assertStillRunning(
  child: ChildProcess,
  command: string,
  delayMs = 350
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new ProcessError(
      `${command} exited immediately (code=${String(child.exitCode)}, signal=${String(child.signalCode)}).`
    );
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      resolve();
    }, delayMs);

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      clearTimeout(timeout);
      reject(
        new ProcessError(
          `${command} exited during startup (code=${String(code)}, signal=${String(signal)}).`
        )
      );
    };

    child.once("exit", onExit);
  });
}

function requireNoVncWebRoot(status: LiveObserverStatus): string {
  if (!status.noVncWebRootPath) {
    throw new ProcessError("noVNC web root was not found.");
  }
  return status.noVncWebRootPath;
}

function redactPasswordFileArg(args: readonly string[]): string[] {
  const redacted = [...args];
  const index = redacted.indexOf("-passwdfile");
  if (index !== -1 && index + 1 < redacted.length) {
    redacted[index + 1] = "[redacted-password-file]";
  }
  return redacted;
}

function toObserverRef(observer: ManagedLiveObserver): LiveObserverRef {
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
