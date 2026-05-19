import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { join } from "node:path";
import {
  detectGuiBrowser,
  formatMissingGuiBrowserMessage
} from "./browser.js";
import type { GuiBrowser } from "./browser.js";
import type { DoctorReport } from "./doctor.js";
import { formatMissingRequiredMessage, getMissingRequiredDependencies, runDoctor } from "./doctor.js";
import { httpJsonRequest, type FetchLike } from "./httpSmoke.js";
import {
  collectChildOutput,
  runProcess,
  stopChildProcess
} from "./processUtils.js";
import { repoRootPath } from "./repo.js";
import { defaultWorkspacePath } from "./workspace.js";

const VITE_APP_PATH = "examples/sample-vite-app";
const VITE_URL_HOST = "127.0.0.1";

export interface SmokeBrowserSemanticArgs {
  readonly workspacePath: string;
  readonly vitePort: number;
  readonly httpPort: number;
  readonly text: string;
}

export interface SmokeBrowserSemanticResult {
  readonly sessionId: string;
  readonly browserCommand: string;
  readonly browserPath: string;
  readonly vitePort: number;
  readonly httpPort: number;
  readonly evidencePath: string;
  readonly pageId: string;
  readonly screenshots: readonly string[];
  readonly cleanupSucceeded: boolean;
  readonly stopped: boolean;
  readonly serverStopped: boolean;
  readonly viteStopped: boolean;
}

export interface SmokeBrowserSemanticOptions {
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
  readonly fetch?: FetchLike;
  readonly detectBrowser?: () => Promise<GuiBrowser | undefined>;
}

export async function runSmokeBrowserSemantic(
  args: readonly string[],
  options: SmokeBrowserSemanticOptions = {}
): Promise<SmokeBrowserSemanticResult> {
  const parsed = parseSmokeBrowserSemanticArgs(args);
  const report =
    options.doctorReport ??
    (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureBrowserSemanticSmokeReady(report);
  const browser =
    (await (options.detectBrowser ?? (async () => await detectGuiBrowser()))()) ??
    undefined;
  if (!browser) {
    throw new Error(formatMissingGuiBrowserMessage());
  }

  const rootPath = repoRootPath();
  const fetchLike = options.fetch ?? globalThis.fetch;
  const viteUrl = `http://${VITE_URL_HOST}:${parsed.vitePort}`;

  let viteServer: ChildProcess | undefined;
  let httpServer: ChildProcess | undefined;
  let sessionId: string | undefined;
  let stopped = false;
  let serverStopped = false;
  let viteStopped = false;
  let result: Omit<
    SmokeBrowserSemanticResult,
    "cleanupSucceeded" | "stopped" | "serverStopped" | "viteStopped"
  > | undefined;
  let runError: unknown;
  let cleanupError: unknown;

  try {
    viteServer = startViteServer(rootPath, parsed.vitePort);
    await waitForHttpOk(viteUrl, fetchLike, viteServer, collectChildOutput(viteServer), "Vite");

    await runProcess("pnpm", ["--filter", "@agent-desktop-harness/http-server", "build"], {
      cwd: rootPath,
      env: process.env
    });
    httpServer = startHttpServer(rootPath, parsed.httpPort);
    const httpOutput = collectChildOutput(httpServer);
    const httpBaseUrl = `http://127.0.0.1:${parsed.httpPort}`;
    await waitForHttpJsonHealth(httpBaseUrl, fetchLike, httpServer, httpOutput);

    const createResponse = await httpJsonRequest<CreateSessionResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions`,
      {
        method: "POST",
        body: {
          workspaceDir: parsed.workspacePath,
          width: 1440,
          height: 900,
          depth: 24
        }
      }
    );
    sessionId = createResponse.session.id;

    const openResponse = await httpJsonRequest<BrowserOpenResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/browser/open`,
      {
        method: "POST",
        body: {
          url: viteUrl,
          browserExecutablePath: browser.path,
          viewport: {
            width: 1440,
            height: 900
          },
          label: "browser-semantic-open-demo"
        }
      }
    );

    const initialScreenshot = await browserScreenshot(
      fetchLike,
      httpBaseUrl,
      sessionId,
      "browser-semantic-initial"
    );
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/browser/fill`, {
      method: "POST",
      body: {
        placeholder: "Type a message",
        value: parsed.text
      }
    });
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/browser/click`, {
      method: "POST",
      body: {
        role: "button",
        name: "Save message",
        label: "browser-semantic-click-save"
      }
    });
    await assertBrowserText(fetchLike, httpBaseUrl, sessionId, "Status: saved");
    await assertBrowserText(fetchLike, httpBaseUrl, sessionId, parsed.text);
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/browser/click`, {
      method: "POST",
      body: {
        role: "button",
        name: "Open details",
        label: "browser-semantic-click-details"
      }
    });
    await assertBrowserText(fetchLike, httpBaseUrl, sessionId, "Details panel is open");
    const detailsScreenshot = await browserScreenshot(
      fetchLike,
      httpBaseUrl,
      sessionId,
      "browser-semantic-details-open"
    );

    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}`, {
      method: "DELETE"
    });
    stopped = true;

    result = {
      sessionId,
      browserCommand: browser.command,
      browserPath: browser.path,
      vitePort: parsed.vitePort,
      httpPort: parsed.httpPort,
      evidencePath: createResponse.session.evidencePath,
      pageId: openResponse.page.pageId,
      screenshots: [
        initialScreenshot.screenshot.path,
        detailsScreenshot.screenshot.path
      ]
    };
  } catch (error) {
    runError = error;
  } finally {
    if (sessionId && !stopped) {
      try {
        const httpBaseUrl = `http://127.0.0.1:${parsed.httpPort}`;
        await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}`, {
          method: "DELETE"
        });
        stopped = true;
      } catch (error) {
        cleanupError = cleanupError ?? error;
      }
    }

    if (httpServer) {
      try {
        await stopChildProcess(httpServer, "Browser semantic HTTP smoke server");
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
    throw new Error("smoke-browser-semantic did not produce a result.");
  }

  return {
    ...result,
    cleanupSucceeded: stopped && serverStopped && viteStopped,
    stopped,
    serverStopped,
    viteStopped
  };
}

export function parseSmokeBrowserSemanticArgs(
  args: readonly string[]
): SmokeBrowserSemanticArgs {
  let workspacePath = defaultWorkspacePath();
  let vitePort = 5181;
  let httpPort = 7355;
  let text = "hello from semantic browser driver";

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

    throw new Error(`Unknown smoke-browser-semantic option: ${arg}`);
  }

  return {
    workspacePath,
    vitePort,
    httpPort,
    text
  };
}

export function ensureBrowserSemanticSmokeReady(report: DoctorReport): void {
  if (getMissingRequiredDependencies(report.dependencies).length > 0) {
    throw new Error(formatMissingRequiredMessage(report));
  }
}

function startViteServer(rootPath: string, port: number): ChildProcess {
  const appPath = join(rootPath, VITE_APP_PATH);
  const viteBin = join(appPath, "node_modules/vite/bin/vite.js");

  return spawn(
    process.execPath,
    [
      viteBin,
      "--host",
      VITE_URL_HOST,
      "--port",
      String(port),
      "--strictPort"
    ],
    {
      cwd: appPath,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

function startHttpServer(rootPath: string, port: number): ChildProcess {
  return spawn(process.execPath, [join(rootPath, "packages/http-server/dist/index.js")], {
    cwd: rootPath,
    env: {
      ...process.env,
      AGENT_DESKTOP_HARNESS_HOST: "127.0.0.1",
      AGENT_DESKTOP_HARNESS_PORT: String(port)
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function waitForHttpOk(
  url: string,
  fetchLike: FetchLike,
  server: { readonly exitCode: number | null; readonly signalCode: NodeJS.Signals | null },
  serverOutput: { readonly stdout: string; readonly stderr: string },
  label: string,
  timeoutMs = 10_000
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
    }`
  );
}

async function waitForHttpJsonHealth(
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
      throw new Error(formatServerExitedMessage("Browser semantic HTTP smoke", serverOutput));
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
    `Browser semantic HTTP smoke server did not become ready within ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function browserScreenshot(
  fetchLike: FetchLike,
  baseUrl: string,
  sessionId: string,
  label: string
): Promise<BrowserScreenshotResponse> {
  return await httpJsonRequest<BrowserScreenshotResponse>(
    fetchLike,
    `${baseUrl}/sessions/${sessionId}/browser/screenshot`,
    {
      method: "POST",
      body: {
        label,
        fullPage: false
      }
    }
  );
}

async function assertBrowserText(
  fetchLike: FetchLike,
  baseUrl: string,
  sessionId: string,
  text: string
): Promise<void> {
  await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}/browser/assert-text`, {
    method: "POST",
    body: {
      text,
      timeoutMs: 5000,
      label: `assert-${sanitizeLabel(text)}`
    }
  });
}

function formatServerExitedMessage(
  label: string,
  output: { readonly stdout: string; readonly stderr: string }
): string {
  return [
    `${label} server exited before it became ready.`,
    output.stderr.trim() ? `stderr:\n${output.stderr.trim()}` : undefined,
    output.stdout.trim() ? `stdout:\n${output.stdout.trim()}` : undefined
  ]
    .filter(Boolean)
    .join("\n");
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

interface CreateSessionResponse {
  readonly session: {
    readonly id: string;
    readonly evidencePath: string;
  };
}

interface BrowserOpenResponse {
  readonly page: {
    readonly pageId: string;
    readonly url: string;
    readonly title?: string;
  };
}

interface BrowserScreenshotResponse {
  readonly screenshot: {
    readonly path: string;
  };
}
