import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { GuiBrowser } from "./browser.js";
import { detectGuiBrowser, formatMissingGuiBrowserMessage } from "./browser.js";
import type { DoctorReport } from "./doctor.js";
import {
  formatMissingRequiredMessage,
  getMissingRequiredDependencies,
  runDoctor,
} from "./doctor.js";
import { type FetchLike, httpJsonRequest } from "./httpSmoke.js";
import { collectChildOutput, runProcess, stopChildProcess } from "./processUtils.js";
import { repoRootPath } from "./repo.js";
import { defaultWorkspacePath } from "./workspace.js";

const VITE_APP_PATH = "examples/sample-vite-app";
const VITE_URL_HOST = "127.0.0.1";

export interface SmokeDriverRouterArgs {
  readonly workspacePath: string;
  readonly vitePort: number;
  readonly httpPort: number;
  readonly text: string;
}

export interface SmokeDriverRouterResult {
  readonly sessionId: string;
  readonly appId: string;
  readonly selectedDriver: string;
  readonly semantic: boolean;
  readonly browserCommand: string;
  readonly browserPath: string;
  readonly vitePort: number;
  readonly httpPort: number;
  readonly evidencePath: string;
  readonly screenshots: readonly string[];
  readonly cleanupSucceeded: boolean;
  readonly stopped: boolean;
  readonly appClosed: boolean;
  readonly serverStopped: boolean;
  readonly viteStopped: boolean;
}

export interface SmokeDriverRouterOptions {
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
  readonly fetch?: FetchLike;
  readonly detectBrowser?: () => Promise<GuiBrowser | undefined>;
}

export async function runSmokeDriverRouter(
  args: readonly string[],
  options: SmokeDriverRouterOptions = {},
): Promise<SmokeDriverRouterResult> {
  const parsed = parseSmokeDriverRouterArgs(args);
  const report =
    options.doctorReport ?? (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureDriverRouterSmokeReady(report);
  const browser =
    (await (options.detectBrowser ?? (async () => await detectGuiBrowser()))()) ?? undefined;
  if (!browser) {
    throw new Error(formatMissingGuiBrowserMessage());
  }

  const rootPath = repoRootPath();
  const fetchLike = options.fetch ?? globalThis.fetch;
  const viteUrl = `http://${VITE_URL_HOST}:${parsed.vitePort}`;

  let viteServer: ChildProcess | undefined;
  let httpServer: ChildProcess | undefined;
  let sessionId: string | undefined;
  let appId: string | undefined;
  let stopped = false;
  let appClosed = false;
  let serverStopped = false;
  let viteStopped = false;
  let result:
    | Omit<
        SmokeDriverRouterResult,
        "cleanupSucceeded" | "stopped" | "appClosed" | "serverStopped" | "viteStopped"
      >
    | undefined;
  let runError: unknown;
  let cleanupError: unknown;

  try {
    viteServer = startViteServer(rootPath, parsed.vitePort);
    await waitForHttpOk(viteUrl, fetchLike, viteServer, collectChildOutput(viteServer), "Vite");

    await runProcess("pnpm", ["--filter", "@agent-desktop-harness/http-server", "build"], {
      cwd: rootPath,
      env: process.env,
    });
    httpServer = startHttpServer(rootPath, parsed.httpPort);
    const httpOutput = collectChildOutput(httpServer);
    const httpBaseUrl = `http://127.0.0.1:${parsed.httpPort}`;
    await waitForHttpJsonHealth(httpBaseUrl, fetchLike, httpServer, httpOutput);

    await httpJsonRequest<DriverStatusResponse>(fetchLike, `${httpBaseUrl}/drivers/status`);

    const createResponse = await httpJsonRequest<CreateSessionResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions`,
      {
        method: "POST",
        body: {
          workspaceDir: parsed.workspacePath,
          width: 1440,
          height: 900,
          depth: 24,
        },
      },
    );
    sessionId = createResponse.session.id;

    const routeResponse = await httpJsonRequest<DriverRouteResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/driver/route`,
      {
        method: "POST",
        body: {
          appKind: "browser",
          requireSemantic: true,
        },
      },
    );
    if (routeResponse.decision.selectedDriver !== "browser-playwright") {
      throw new Error(
        `Driver router selected ${routeResponse.decision.selectedDriver}; expected browser-playwright.`,
      );
    }

    const openResponse = await httpJsonRequest<AppOpenResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/apps/open`,
      {
        method: "POST",
        body: {
          appKind: "browser",
          url: viteUrl,
          browserExecutablePath: browser.path,
          viewport: {
            width: 1440,
            height: 900,
          },
          requireSemantic: true,
          label: "driver-router-open-demo",
        },
      },
    );
    appId = openResponse.app.appId;
    if (openResponse.selectedDriver !== "browser-playwright" || !openResponse.semantic) {
      throw new Error(
        `app_open selected ${openResponse.selectedDriver} semantic=${String(openResponse.semantic)}.`,
      );
    }

    const initialScreenshot = await appScreenshot(
      fetchLike,
      httpBaseUrl,
      sessionId,
      "driver-router-initial",
    );
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/fill`, {
      method: "POST",
      body: {
        placeholder: "Type a message",
        value: parsed.text,
      },
    });
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/click`, {
      method: "POST",
      body: {
        role: "button",
        name: "Save message",
        label: "driver-router-click-save",
      },
    });
    await assertAppText(fetchLike, httpBaseUrl, sessionId, "Status: saved");
    await assertAppText(fetchLike, httpBaseUrl, sessionId, parsed.text);
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/click`, {
      method: "POST",
      body: {
        role: "button",
        name: "Open details",
        label: "driver-router-click-details",
      },
    });
    await assertAppText(fetchLike, httpBaseUrl, sessionId, "Details panel is open");
    const detailsScreenshot = await appScreenshot(
      fetchLike,
      httpBaseUrl,
      sessionId,
      "driver-router-details-open",
    );

    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/close`, {
      method: "POST",
      body: {
        appId,
      },
    });
    appClosed = true;

    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}`, {
      method: "DELETE",
    });
    stopped = true;

    result = {
      sessionId,
      appId,
      selectedDriver: openResponse.selectedDriver,
      semantic: openResponse.semantic,
      browserCommand: browser.command,
      browserPath: browser.path,
      vitePort: parsed.vitePort,
      httpPort: parsed.httpPort,
      evidencePath: createResponse.session.evidencePath,
      screenshots: [initialScreenshot.screenshot.path, detailsScreenshot.screenshot.path],
    };
  } catch (error) {
    runError = error;
  } finally {
    const httpBaseUrl = `http://127.0.0.1:${parsed.httpPort}`;
    if (sessionId && appId && !appClosed) {
      try {
        await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/close`, {
          method: "POST",
          body: {
            appId,
          },
        });
        appClosed = true;
      } catch (error) {
        cleanupError = cleanupError ?? error;
      }
    }

    if (sessionId && !stopped) {
      try {
        await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}`, {
          method: "DELETE",
        });
        stopped = true;
      } catch (error) {
        cleanupError = cleanupError ?? error;
      }
    }

    if (httpServer) {
      try {
        await stopChildProcess(httpServer, "Driver router HTTP smoke server");
        serverStopped = true;
      } catch (error) {
        cleanupError = cleanupError ?? error;
      }
    }

    if (viteServer) {
      try {
        await stopChildProcess(viteServer, "Vite dev server");
        viteStopped = true;
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
    throw new Error("smoke-driver-router did not produce a result.");
  }

  return {
    ...result,
    cleanupSucceeded: stopped && appClosed && serverStopped && viteStopped,
    stopped,
    appClosed,
    serverStopped,
    viteStopped,
  };
}

export function parseSmokeDriverRouterArgs(args: readonly string[]): SmokeDriverRouterArgs {
  let workspacePath = defaultWorkspacePath();
  let vitePort = 5182;
  let httpPort = 7356;
  let text = "hello from driver router";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = requireValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--vite-port") {
      vitePort = parsePort(requireValue(args, index, "--vite-port"));
      index += 1;
      continue;
    }

    if (arg === "--http-port") {
      httpPort = parsePort(requireValue(args, index, "--http-port"));
      index += 1;
      continue;
    }

    if (arg === "--text") {
      text = requireValue(args, index, "--text");
      index += 1;
      continue;
    }

    throw new Error(`Unknown smoke-driver-router option: ${arg}`);
  }

  return {
    workspacePath,
    vitePort,
    httpPort,
    text,
  };
}

export function ensureDriverRouterSmokeReady(report: DoctorReport): void {
  if (getMissingRequiredDependencies(report.dependencies).length > 0) {
    throw new Error(formatMissingRequiredMessage(report));
  }
}

function startViteServer(rootPath: string, port: number): ChildProcess {
  const appPath = join(rootPath, VITE_APP_PATH);
  const viteBin = join(appPath, "node_modules/vite/bin/vite.js");

  return spawn(
    process.execPath,
    [viteBin, "--host", VITE_URL_HOST, "--port", String(port), "--strictPort"],
    {
      cwd: appPath,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function startHttpServer(rootPath: string, port: number): ChildProcess {
  return spawn(process.execPath, [join(rootPath, "packages/http-server/dist/index.js")], {
    cwd: rootPath,
    env: {
      ...process.env,
      AGENT_DESKTOP_HARNESS_HOST: "127.0.0.1",
      AGENT_DESKTOP_HARNESS_PORT: String(port),
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHttpOk(
  url: string,
  fetchLike: FetchLike,
  server: { readonly exitCode: number | null; readonly signalCode: NodeJS.Signals | null },
  serverOutput: { readonly stdout: string; readonly stderr: string },
  label: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(formatServerExitedMessage(label, serverOutput));
    }

    try {
      const response = await fetchLike(url);
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
    `${label} server did not become ready within ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function waitForHttpJsonHealth(
  baseUrl: string,
  fetchLike: FetchLike,
  server: { readonly exitCode: number | null; readonly signalCode: NodeJS.Signals | null },
  serverOutput: { readonly stdout: string; readonly stderr: string },
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(formatServerExitedMessage("Driver router HTTP smoke", serverOutput));
    }

    try {
      const result = await httpJsonRequest<{ readonly ok?: boolean }>(
        fetchLike,
        `${baseUrl}/health`,
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
    `Driver router HTTP smoke server did not become ready within ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function appScreenshot(
  fetchLike: FetchLike,
  baseUrl: string,
  sessionId: string,
  label: string,
): Promise<AppScreenshotResponse> {
  return await httpJsonRequest<AppScreenshotResponse>(
    fetchLike,
    `${baseUrl}/sessions/${sessionId}/apps/screenshot`,
    {
      method: "POST",
      body: {
        label,
        fullPage: false,
      },
    },
  );
}

async function assertAppText(
  fetchLike: FetchLike,
  baseUrl: string,
  sessionId: string,
  text: string,
): Promise<void> {
  await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}/apps/assert-text`, {
    method: "POST",
    body: {
      text,
      timeoutMs: 5000,
      label: `assert-${sanitizeLabel(text)}`,
    },
  });
}

function formatServerExitedMessage(
  label: string,
  output: { readonly stdout: string; readonly stderr: string },
): string {
  return [
    `${label} server exited before it became ready.`,
    output.stderr.trim() ? `stderr:\n${output.stderr.trim()}` : undefined,
    output.stdout.trim() ? `stdout:\n${output.stdout.trim()}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function requireValue(args: readonly string[], index: number, optionName: string): string {
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

function sanitizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface DriverStatusResponse {
  readonly status: {
    readonly browser: {
      readonly available: boolean;
    };
  };
}

interface CreateSessionResponse {
  readonly session: {
    readonly id: string;
    readonly evidencePath: string;
  };
}

interface DriverRouteResponse {
  readonly decision: {
    readonly selectedDriver: string;
  };
}

interface AppOpenResponse {
  readonly selectedDriver: string;
  readonly semantic: boolean;
  readonly app: {
    readonly appId: string;
  };
}

interface AppScreenshotResponse {
  readonly screenshot: {
    readonly path: string;
  };
}
