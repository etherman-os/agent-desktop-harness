import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  buildBrowserLaunchConfig,
  detectGuiBrowser,
  formatMissingGuiBrowserMessage,
  type GuiBrowser
} from "./browser.js";
import type { DoctorReport } from "./doctor.js";
import { formatMissingRequiredMessage, getMissingRequiredDependencies, runDoctor } from "./doctor.js";
import {
  httpJsonRequest,
  type FetchLike
} from "./httpSmoke.js";
import {
  RawMcpClient,
  waitForMcpWindows
} from "./mcpSmoke.js";
import {
  collectChildOutput,
  runProcess,
  stopChildProcess
} from "./processUtils.js";
import { repoRootPath } from "./repo.js";
import { defaultWorkspacePath } from "./workspace.js";

const VITE_APP_PATH = "examples/sample-vite-app";
const VITE_URL_HOST = "127.0.0.1";

const VITE_COORDINATES = {
  input: { x: 720, y: 550 },
  saveButton: { x: 510, y: 635 },
  detailsButton: { x: 735, y: 635 }
};

export interface SmokeViteHttpArgs {
  readonly workspacePath: string;
  readonly vitePort: number;
  readonly httpPort: number;
  readonly text: string;
}

export interface SmokeViteMcpArgs {
  readonly workspacePath: string;
  readonly vitePort: number;
  readonly text: string;
}

export interface SmokeViteResult {
  readonly sessionId: string;
  readonly browserCommand: string;
  readonly browserPath: string;
  readonly vitePort: number;
  readonly httpPort?: number;
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
  readonly viteStopped: boolean;
}

export interface SmokeViteOptions {
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
  readonly fetch?: FetchLike;
}

export async function runSmokeViteHttp(
  args: readonly string[],
  options: SmokeViteOptions = {}
): Promise<SmokeViteResult> {
  const parsed = parseSmokeViteHttpArgs(args);
  const report =
    options.doctorReport ??
    (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureViteSmokeReady(report);
  const browser = await requireGuiBrowser();
  const rootPath = repoRootPath();
  const appPath = join(rootPath, VITE_APP_PATH);
  const fetchLike = options.fetch ?? globalThis.fetch;
  const viteUrl = `http://${VITE_URL_HOST}:${parsed.vitePort}`;
  const profileDir = await mkdtemp(join(tmpdir(), "agent-desktop-harness-browser-"));
  const browserLaunch = buildBrowserLaunchConfig(browser, profileDir, viteUrl);

  let viteServer: ChildProcess | undefined;
  let httpServer: ChildProcess | undefined;
  let sessionId: string | undefined;
  let stopped = false;
  let serverStopped = false;
  let viteStopped = false;
  let result: Omit<
    SmokeViteResult,
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
          depth: 24,
          policy: {
            allowedCommands: [browserLaunch.command]
          }
        }
      }
    );
    sessionId = createResponse.session.id;

    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/launch`, {
      method: "POST",
      body: {
        command: browserLaunch.command,
        args: browserLaunch.args,
        cwd: appPath,
        label: "vite-http-browser"
      }
    });

    const windowResponse = await httpJsonRequest<WaitForWindowResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/wait-for-window`,
      {
        method: "POST",
        body: {
          excludeDevtools: true,
          preferLargest: true,
          timeoutMs: 8000
        }
      }
    );
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/focus-window`, {
      method: "POST",
      body: {
        id: windowResponse.window.id
      }
    });
    await delay(1000);

    const initialScreenshot = await httpJsonRequest<ScreenshotResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/screenshot`,
      {
        method: "POST",
        body: {
          label: "vite-http-initial"
        }
      }
    );
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/click`, {
      method: "POST",
      body: {
        ...VITE_COORDINATES.input,
        button: "left",
        label: "vite-http-click-input"
      }
    });
    await delay(100);
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/type-text`, {
      method: "POST",
      body: {
        text: parsed.text,
        label: "vite-http-type-message"
      }
    });
    await delay(100);
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/click`, {
      method: "POST",
      body: {
        ...VITE_COORDINATES.saveButton,
        button: "left",
        label: "vite-http-click-save"
      }
    });
    await delay(250);
    const afterSaveScreenshot = await httpJsonRequest<ScreenshotResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/screenshot`,
      {
        method: "POST",
        body: {
          label: "vite-http-after-save"
        }
      }
    );
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/click`, {
      method: "POST",
      body: {
        ...VITE_COORDINATES.detailsButton,
        button: "left",
        label: "vite-http-click-details"
      }
    });
    await delay(250);
    const detailsScreenshot = await httpJsonRequest<ScreenshotResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/screenshot`,
      {
        method: "POST",
        body: {
          label: "vite-http-details-open"
        }
      }
    );
    await assertViteScreenshotsChanged(
      initialScreenshot.screenshot.path,
      afterSaveScreenshot.screenshot.path,
      detailsScreenshot.screenshot.path
    );
    const stableResponse = await httpJsonRequest<WaitForStableScreenResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/wait-for-stable-screen`,
      {
        method: "POST",
        body: {
          timeoutMs: 5000,
          intervalMs: 500,
          stableChecks: 1,
          label: "vite-http-stable",
          mode: "tolerant",
          fileSizeToleranceBytes: 4096,
          retainOnlyLast: true
        }
      }
    );

    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}`, {
      method: "DELETE"
    });
    stopped = true;

    const reportResponse = await httpJsonRequest<EvidenceReportResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/evidence/report`
    );

    result = {
      sessionId,
      browserCommand: browserLaunch.command,
      browserPath: browser.path,
      vitePort: parsed.vitePort,
      httpPort: parsed.httpPort,
      evidencePath: createResponse.session.evidencePath,
      screenshots: [
        initialScreenshot.screenshot.path,
        afterSaveScreenshot.screenshot.path,
        detailsScreenshot.screenshot.path
      ],
      stableScreen: formatHttpStableResult(stableResponse),
      reportPath: reportResponse.path
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
        await stopChildProcess(httpServer, "Vite HTTP smoke server");
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

    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (runError) {
    throw runError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
  if (!result) {
    throw new Error("smoke-vite-http did not produce a result.");
  }

  return {
    ...result,
    cleanupSucceeded: stopped && serverStopped && viteStopped,
    stopped,
    serverStopped,
    viteStopped
  };
}

export async function runSmokeViteMcp(
  args: readonly string[],
  options: SmokeViteOptions = {}
): Promise<SmokeViteResult> {
  const parsed = parseSmokeViteMcpArgs(args);
  const report =
    options.doctorReport ??
    (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureViteSmokeReady(report);
  const browser = await requireGuiBrowser();
  const rootPath = repoRootPath();
  const appPath = join(rootPath, VITE_APP_PATH);
  const fetchLike = options.fetch ?? globalThis.fetch;
  const viteUrl = `http://${VITE_URL_HOST}:${parsed.vitePort}`;
  const profileDir = await mkdtemp(join(tmpdir(), "agent-desktop-harness-browser-"));
  const browserLaunch = buildBrowserLaunchConfig(browser, profileDir, viteUrl);

  let viteServer: ChildProcess | undefined;
  let mcpServer: ChildProcess | undefined;
  let client: RawMcpClient | undefined;
  let sessionId: string | undefined;
  let stopped = false;
  let serverStopped = false;
  let viteStopped = false;
  let result: Omit<
    SmokeViteResult,
    "cleanupSucceeded" | "stopped" | "serverStopped" | "viteStopped"
  > | undefined;
  let runError: unknown;
  let cleanupError: unknown;

  try {
    viteServer = startViteServer(rootPath, parsed.vitePort);
    await waitForHttpOk(viteUrl, fetchLike, viteServer, collectChildOutput(viteServer), "Vite");

    await runProcess("pnpm", ["--filter", "@agent-desktop-harness/mcp-server", "build"], {
      cwd: rootPath,
      env: process.env
    });
    mcpServer = spawn(process.execPath, [join(rootPath, "packages/mcp-server/dist/index.js")], {
      cwd: rootPath,
      env: process.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    client = new RawMcpClient(mcpServer);
    await client.initialize();
    await client.assertTools([
      "desktop_start_session",
      "desktop_launch_app",
      "desktop_wait_for_window",
      "desktop_wait_for_stable_screen",
      "desktop_screenshot",
      "desktop_get_windows",
      "desktop_focus_window",
      "desktop_click",
      "desktop_type_text",
      "desktop_stop_session"
    ]);

    const session = await client.callTool<SessionToolResult>("desktop_start_session", {
      workspaceDir: parsed.workspacePath,
      width: 1440,
      height: 900,
      depth: 24,
      policy: {
        allowedCommands: [browserLaunch.command]
      }
    });
    sessionId = session.id;

    await client.callTool("desktop_launch_app", {
      sessionId,
      command: browserLaunch.command,
      args: browserLaunch.args,
      cwd: appPath,
      label: "vite-mcp-browser"
    });

    const targetWindow = await client.callTool<HttpWindowInfo>("desktop_wait_for_window", {
      sessionId,
      excludeDevtools: true,
      preferLargest: true,
      timeoutMs: 8000
    });
    await client.callTool("desktop_focus_window", {
      sessionId,
      id: targetWindow.id
    });
    await delay(1000);

    const initialScreenshot = await client.callTool<ScreenshotToolResult>(
      "desktop_screenshot",
      {
        sessionId,
        label: "vite-mcp-initial"
      }
    );
    await client.callTool("desktop_click", {
      sessionId,
      ...VITE_COORDINATES.input,
      button: "left",
      label: "vite-mcp-click-input"
    });
    await delay(100);
    await client.callTool("desktop_type_text", {
      sessionId,
      text: parsed.text,
      label: "vite-mcp-type-message"
    });
    await delay(100);
    await client.callTool("desktop_click", {
      sessionId,
      ...VITE_COORDINATES.saveButton,
      button: "left",
      label: "vite-mcp-click-save"
    });
    await delay(250);
    const afterSaveScreenshot = await client.callTool<ScreenshotToolResult>(
      "desktop_screenshot",
      {
        sessionId,
        label: "vite-mcp-after-save"
      }
    );
    await client.callTool("desktop_click", {
      sessionId,
      ...VITE_COORDINATES.detailsButton,
      button: "left",
      label: "vite-mcp-click-details"
    });
    await delay(250);
    const detailsScreenshot = await client.callTool<ScreenshotToolResult>(
      "desktop_screenshot",
      {
        sessionId,
        label: "vite-mcp-details-open"
      }
    );
    await assertViteScreenshotsChanged(
      initialScreenshot.path,
      afterSaveScreenshot.path,
      detailsScreenshot.path
    );
    const stableScreen = await client.callTool<StableScreenToolResult>(
      "desktop_wait_for_stable_screen",
      {
        sessionId,
        timeoutMs: 5000,
        intervalMs: 500,
        stableChecks: 1,
        label: "vite-mcp-stable",
        mode: "tolerant",
        fileSizeToleranceBytes: 4096,
        retainOnlyLast: true
      }
    );

    await client.callTool("desktop_stop_session", { sessionId });
    stopped = true;

    const report = await client.callTool<EvidenceReportToolResult>(
      "desktop_get_evidence_report",
      { sessionId }
    );

    result = {
      sessionId,
      browserCommand: browserLaunch.command,
      browserPath: browser.path,
      vitePort: parsed.vitePort,
      evidencePath: session.evidencePath,
      screenshots: [
        initialScreenshot.path,
        afterSaveScreenshot.path,
        detailsScreenshot.path
      ],
      stableScreen: {
        stable: stableScreen.stable,
        checks: stableScreen.checks,
        elapsedMs: stableScreen.elapsedMs,
        lastScreenshotPath: stableScreen.lastScreenshot?.path
      },
      reportPath: report.path
    };
  } catch (error) {
    runError = error;
  } finally {
    if (client && sessionId && !stopped) {
      try {
        await client.callTool("desktop_stop_session", { sessionId });
        stopped = true;
      } catch (error) {
        cleanupError = cleanupError ?? error;
      }
    }

    if (client) {
      try {
        await client.close();
        serverStopped = true;
      } catch (error) {
        cleanupError = cleanupError ?? error;
      }
    } else if (mcpServer) {
      try {
        await stopChildProcess(mcpServer, "Vite MCP smoke server");
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

    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (runError) {
    throw runError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
  if (!result) {
    throw new Error("smoke-vite-mcp did not produce a result.");
  }

  return {
    ...result,
    cleanupSucceeded: stopped && serverStopped && viteStopped,
    stopped,
    serverStopped,
    viteStopped
  };
}

export function parseSmokeViteHttpArgs(args: readonly string[]): SmokeViteHttpArgs {
  let workspacePath = defaultWorkspacePath();
  let vitePort = 5179;
  let httpPort = 7353;
  let text = "hello from http smoke";

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

    throw new Error(`Unknown smoke-vite-http option: ${arg}`);
  }

  return {
    workspacePath,
    vitePort,
    httpPort,
    text
  };
}

export function parseSmokeViteMcpArgs(args: readonly string[]): SmokeViteMcpArgs {
  let workspacePath = defaultWorkspacePath();
  let vitePort = 5179;
  let text = "hello from mcp smoke";

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

    if (arg === "--text") {
      text = requireValue(args, index, "--text");
      index += 1;
      continue;
    }

    throw new Error(`Unknown smoke-vite-mcp option: ${arg}`);
  }

  return {
    workspacePath,
    vitePort,
    text
  };
}

export function ensureViteSmokeReady(report: DoctorReport): void {
  if (getMissingRequiredDependencies(report.dependencies).length > 0) {
    throw new Error(formatMissingRequiredMessage(report));
  }
}

async function requireGuiBrowser(): Promise<GuiBrowser> {
  const browser = await detectGuiBrowser();
  if (!browser) {
    throw new Error(formatMissingGuiBrowserMessage());
  }
  return browser;
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
      throw new Error(formatServerExitedMessage("HTTP smoke", serverOutput));
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
  timeoutMs = 8000
): Promise<HttpWindowInfo[]> {
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

  throw new Error(`No browser windows appeared within ${timeoutMs}ms.`);
}

async function assertViteScreenshotsChanged(
  initialPath: string,
  afterSavePath: string,
  detailsPath: string
): Promise<void> {
  const [initial, afterSave, details] = await Promise.all([
    readFile(initialPath),
    readFile(afterSavePath),
    readFile(detailsPath)
  ]);

  if (initial.equals(afterSave)) {
    throw new Error(
      "Vite smoke screenshots did not change after saving the message. Check browser focus and click coordinates."
    );
  }

  if (afterSave.equals(details)) {
    throw new Error(
      "Vite smoke screenshots did not change after opening the details panel. Check browser focus and click coordinates."
    );
  }
}

function selectBrowserWindow<T extends { readonly id: string; readonly title: string }>(
  windows: readonly T[]
): T {
  const browserWindow =
    windows.find((window) => /agent desktop harness demo/i.test(window.title)) ??
    windows.find((window) => /chrom|chrome|firefox|vite/i.test(window.title)) ??
    windows[0];

  if (!browserWindow) {
    throw new Error("No browser window was found.");
  }

  return browserWindow;
}

function formatHttpStableResult(
  response: WaitForStableScreenResponse
): SmokeViteResult["stableScreen"] {
  return {
    stable: response.result.stable,
    checks: response.result.checks,
    elapsedMs: response.result.elapsedMs,
    lastScreenshotPath: response.result.lastScreenshot?.path
  };
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

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface CreateSessionResponse {
  readonly session: {
    readonly id: string;
    readonly evidencePath: string;
  };
}

interface ScreenshotResponse {
  readonly screenshot: {
    readonly path: string;
  };
}

interface WaitForStableScreenResponse {
  readonly result: StableScreenToolResult;
}

interface WaitForWindowResponse {
  readonly window: HttpWindowInfo;
}

interface StableScreenToolResult {
  readonly stable: boolean;
  readonly checks: number;
  readonly elapsedMs: number;
  readonly lastScreenshot?: {
    readonly path: string;
  };
}

interface HttpWindowInfo {
  readonly id: string;
  readonly title: string;
  readonly pid?: number;
}

interface WindowsResponse {
  readonly windows: HttpWindowInfo[];
}

interface EvidenceReportResponse {
  readonly path: string;
}

interface SessionToolResult {
  readonly id: string;
  readonly evidencePath: string;
}

interface ScreenshotToolResult {
  readonly path: string;
}

interface EvidenceReportToolResult {
  readonly path: string;
}
