import { spawn } from "node:child_process";
import { join } from "node:path";
import type { DoctorReport } from "./doctor.js";
import { runDoctor } from "./doctor.js";
import { ensureSmokeReady } from "./smoke.js";
import { defaultWorkspacePath } from "./workspace.js";
import { repoRootPath } from "./repo.js";
import {
  collectChildOutput,
  runProcess,
  stopChildProcess
} from "./processUtils.js";

export interface SmokeHttpArgs {
  readonly workspacePath: string;
  readonly port: number;
  readonly text: string;
}

export interface SmokeHttpResult {
  readonly sessionId: string;
  readonly port: number;
  readonly evidencePath: string;
  readonly screenshots: readonly string[];
  readonly stableScreen: {
    readonly stable: boolean;
    readonly checks: number;
    readonly elapsedMs: number;
    readonly lastScreenshotPath?: string;
  };
  readonly reportPath?: string;
  readonly cleanupSucceeded: boolean;
  readonly stopped: boolean;
  readonly serverStopped: boolean;
}

export interface SmokeHttpOptions {
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
  readonly fetch?: FetchLike;
}

export type FetchLike = (
  url: string,
  init?: {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
  }
) => Promise<HttpResponseLike>;

export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export async function runSmokeHttp(
  args: readonly string[],
  options: SmokeHttpOptions = {}
): Promise<SmokeHttpResult> {
  const parsed = parseSmokeHttpArgs(args);
  const report =
    options.doctorReport ??
    (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureSmokeReady(report, "xterm");

  const rootPath = repoRootPath();
  await runProcess("pnpm", ["--filter", "@agent-desktop-harness/http-server", "build"], {
    cwd: rootPath,
    env: process.env
  });

  const server = spawn(process.execPath, [join(rootPath, "packages/http-server/dist/index.js")], {
    cwd: rootPath,
    env: {
      ...process.env,
      AGENT_DESKTOP_HARNESS_HOST: "127.0.0.1",
      AGENT_DESKTOP_HARNESS_PORT: String(parsed.port)
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const serverOutput = collectChildOutput(server);
  const fetchLike = options.fetch ?? globalThis.fetch;
  const baseUrl = `http://127.0.0.1:${parsed.port}`;

  let sessionId: string | undefined;
  let evidencePath: string | undefined;
  let stopped = false;
  let serverStopped = false;
  let result: Omit<
    SmokeHttpResult,
    "cleanupSucceeded" | "stopped" | "serverStopped"
  > | undefined;
  let runError: unknown;
  let cleanupError: unknown;

  try {
    await waitForHttpHealth(baseUrl, fetchLike, server, serverOutput);

    const createResponse = await httpJsonRequest<CreateSessionResponse>(
      fetchLike,
      `${baseUrl}/sessions`,
      {
        method: "POST",
        body: {
          workspaceDir: parsed.workspacePath,
          width: 1440,
          height: 900,
          depth: 24,
          policy: {
            allowedCommands: ["xterm"]
          }
        }
      }
    );
    sessionId = createResponse.session.id;
    evidencePath = createResponse.session.evidencePath;

    await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}/launch`, {
      method: "POST",
      body: {
        command: "xterm",
        args: [],
        cwd: parsed.workspacePath,
        label: "http-smoke-xterm"
      }
    });

    const stableResponse = await httpJsonRequest<WaitForStableScreenResponse>(
      fetchLike,
      `${baseUrl}/sessions/${sessionId}/wait-for-stable-screen`,
      {
        method: "POST",
        body: {
          timeoutMs: 5000,
          intervalMs: 500,
          stableChecks: 1,
          label: "http-smoke-stable",
          mode: "tolerant",
          fileSizeToleranceBytes: 2048,
          retainOnlyLast: true
        }
      }
    );
    const initialScreenshot = await httpJsonRequest<ScreenshotResponse>(
      fetchLike,
      `${baseUrl}/sessions/${sessionId}/screenshot`,
      {
        method: "POST",
        body: {
          label: "http-smoke-initial"
        }
      }
    );
    const windowResponse = await httpJsonRequest<WaitForWindowResponse>(
      fetchLike,
      `${baseUrl}/sessions/${sessionId}/wait-for-window`,
      {
        method: "POST",
        body: {
          excludeDevtools: true,
          preferLargest: true,
          timeoutMs: 5000
        }
      }
    );

    await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}/focus-window`, {
      method: "POST",
      body: {
        id: windowResponse.window.id
      }
    });
    await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}/click`, {
      method: "POST",
      body: {
        x: 100,
        y: 100,
        button: "left",
        label: "http-smoke-click"
      }
    });
    await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}/type-text`, {
      method: "POST",
      body: {
        text: parsed.text,
        label: "http-smoke-type"
      }
    });
    const afterTypeScreenshot = await httpJsonRequest<ScreenshotResponse>(
      fetchLike,
      `${baseUrl}/sessions/${sessionId}/screenshot`,
      {
        method: "POST",
        body: {
          label: "http-smoke-after-type"
        }
      }
    );

    await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}`, {
      method: "DELETE"
    });
    stopped = true;

    const reportResponse = await httpJsonRequest<EvidenceReportResponse>(
      fetchLike,
      `${baseUrl}/sessions/${sessionId}/evidence/report`
    );

    result = {
      sessionId,
      port: parsed.port,
      evidencePath,
      screenshots: [
        initialScreenshot.screenshot.path,
        afterTypeScreenshot.screenshot.path
      ],
      stableScreen: {
        stable: stableResponse.result.stable,
        checks: stableResponse.result.checks,
        elapsedMs: stableResponse.result.elapsedMs,
        lastScreenshotPath: stableResponse.result.lastScreenshot?.path
      },
      reportPath: reportResponse.path
    };
  } catch (error) {
    runError = error;
  } finally {
    if (sessionId && !stopped) {
      try {
        await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}`, {
          method: "DELETE"
        });
        stopped = true;
      } catch (error) {
        cleanupError = error;
      }
    }

    try {
      await stopChildProcess(server, "HTTP smoke server");
      serverStopped = true;
    } catch (error) {
      cleanupError = cleanupError ?? error;
    }
  }

  if (runError) {
    throw runError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
  if (!result) {
    throw new Error("smoke-http did not produce a result.");
  }

  return {
    ...result,
    cleanupSucceeded: stopped && serverStopped,
    stopped,
    serverStopped
  };
}

export function parseSmokeHttpArgs(args: readonly string[]): SmokeHttpArgs {
  let workspacePath = defaultWorkspacePath();
  let port = 7352;
  let text = "agent-desktop-harness http smoke";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = requireValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--port") {
      port = parsePort(requireValue(args, index, "--port"));
      index += 1;
      continue;
    }

    if (arg === "--text") {
      text = requireValue(args, index, "--text");
      index += 1;
      continue;
    }

    throw new Error(`Unknown smoke-http option: ${arg}`);
  }

  return {
    workspacePath,
    port,
    text
  };
}

export async function httpJsonRequest<T>(
  fetchLike: FetchLike,
  url: string,
  options: {
    readonly method?: string;
    readonly body?: unknown;
  } = {}
): Promise<T> {
  const response = await fetchLike(url, {
    method: options.method ?? "GET",
    headers:
      options.body === undefined
        ? undefined
        : {
            "content-type": "application/json"
          },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const body = text.trim().length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : text.trim();
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return body as T;
}

async function waitForHttpHealth(
  baseUrl: string,
  fetchLike: FetchLike,
  server: { readonly exitCode: number | null; readonly signalCode: NodeJS.Signals | null },
  serverOutput: { readonly stdout: string; readonly stderr: string },
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(
        [
          "HTTP smoke server exited before /health became ready.",
          serverOutput.stderr.trim() ? `stderr:\n${serverOutput.stderr.trim()}` : undefined,
          serverOutput.stdout.trim() ? `stdout:\n${serverOutput.stdout.trim()}` : undefined
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    try {
      const result = await httpJsonRequest<{ readonly ok?: boolean }>(
        fetchLike,
        `${baseUrl}/health`
      );
      if (result.ok === true) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(200);
  }

  throw new Error(
    `HTTP smoke server did not become ready within ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function waitForHttpWindows(
  fetchLike: FetchLike,
  baseUrl: string,
  sessionId: string,
  timeoutMs = 5000
): Promise<WindowInfo[]> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await httpJsonRequest<WindowsResponse>(
      fetchLike,
      `${baseUrl}/sessions/${sessionId}/windows`
    );
    if (response.windows.length > 0) {
      return response.windows;
    }
    await delay(250);
  }

  throw new Error(`No windows appeared within ${timeoutMs}ms during smoke-http.`);
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

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface SessionResponse {
  readonly id: string;
  readonly evidencePath: string;
}

interface CreateSessionResponse {
  readonly session: SessionResponse;
}

interface ScreenshotResponse {
  readonly screenshot: {
    readonly path: string;
  };
}

interface WaitForStableScreenResponse {
  readonly result: {
    readonly stable: boolean;
    readonly checks: number;
    readonly elapsedMs: number;
    readonly lastScreenshot?: {
      readonly path: string;
    };
  };
}

interface WaitForWindowResponse {
  readonly window: WindowInfo;
}

interface WindowInfo {
  readonly id: string;
  readonly title: string;
  readonly pid?: number;
}

interface WindowsResponse {
  readonly windows: WindowInfo[];
}

interface EvidenceReportResponse {
  readonly path: string;
}
