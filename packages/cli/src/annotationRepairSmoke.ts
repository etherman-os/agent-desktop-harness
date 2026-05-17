import { readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  buildBrowserLaunchConfig,
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
const REPAIR_DEMO_NOTE =
  "The overlapping badge covers the saved message/details area. Move it away or prevent it from overlapping this content.";
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADgwGZVfZtNwAAAABJRU5ErkJggg==";

export const REPAIR_DEMO_ANNOTATION_RECT = {
  x: 600,
  y: 650,
  width: 360,
  height: 140
} as const;

export interface SmokeAnnotationRepairArgs {
  readonly workspacePath: string;
  readonly vitePort: number;
  readonly httpPort: number;
}

export interface SmokeAnnotationRepairResult {
  readonly sessionId: string;
  readonly browserCommand: string;
  readonly browserPath: string;
  readonly vitePort: number;
  readonly httpPort: number;
  readonly evidencePath: string;
  readonly beforeScreenshotPath: string;
  readonly annotationId: string;
  readonly cropPath?: string;
  readonly visualHandoffPath: string;
  readonly afterScreenshotPath: string;
  readonly cleanupSucceeded: boolean;
  readonly stopped: boolean;
  readonly serverStopped: boolean;
  readonly viteStopped: boolean;
}

export interface SmokeAnnotationRepairOptions {
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
  readonly fetch?: FetchLike;
  readonly detectBrowser?: () => Promise<GuiBrowser | undefined>;
}

export async function runSmokeAnnotationRepairDemo(
  args: readonly string[],
  options: SmokeAnnotationRepairOptions = {}
): Promise<SmokeAnnotationRepairResult> {
  const parsed = parseSmokeAnnotationRepairArgs(args);
  const report =
    options.doctorReport ??
    (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureAnnotationRepairSmokeReady(report);
  const browser =
    (await (options.detectBrowser ?? (async () => await detectGuiBrowser()))()) ??
    undefined;
  if (!browser) {
    throw new Error(formatMissingGuiBrowserMessage());
  }

  const rootPath = repoRootPath();
  const appPath = join(rootPath, VITE_APP_PATH);
  const fetchLike = options.fetch ?? globalThis.fetch;
  const viteUrl = `http://${VITE_URL_HOST}:${parsed.vitePort}`;
  const brokenUrl = `${viteUrl}/?demoBug=overlap`;
  const fixedUrl = `${viteUrl}/?demoBug=fixed`;
  const profileDir = await mkdtemp(join(tmpdir(), "agent-desktop-harness-browser-"));
  const browserLaunch = buildBrowserLaunchConfig(browser, profileDir, brokenUrl);

  let viteServer: ChildProcess | undefined;
  let httpServer: ChildProcess | undefined;
  let sessionId: string | undefined;
  let stopped = false;
  let serverStopped = false;
  let viteStopped = false;
  let result: Omit<
    SmokeAnnotationRepairResult,
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
        label: "repair-demo-browser"
      }
    });

    await focusFirstWindow(fetchLike, httpBaseUrl, sessionId);
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/wait-for-stable-screen`, {
      method: "POST",
      body: {
        timeoutMs: 5000,
        intervalMs: 500,
        stableChecks: 1,
        label: "repair-demo-before-stable"
      }
    });

    const beforeScreenshot = await httpJsonRequest<ScreenshotResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/screenshot`,
      {
        method: "POST",
        body: {
          label: "repair-demo-before-annotation"
        }
      }
    );
    const screenshotFileName = basename(beforeScreenshot.screenshot.path);

    const annotationResponse = await httpJsonRequest<AnnotationResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/annotations`,
      {
        method: "POST",
        body: createRepairDemoAnnotationPayload(screenshotFileName)
      }
    );
    await verifyAnnotationArtifacts(
      fetchLike,
      httpBaseUrl,
      sessionId,
      createResponse.session.evidencePath,
      screenshotFileName,
      annotationResponse.annotation
    );

    await navigateBrowserTo(fetchLike, httpBaseUrl, sessionId, fixedUrl);
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/wait-for-stable-screen`, {
      method: "POST",
      body: {
        timeoutMs: 5000,
        intervalMs: 500,
        stableChecks: 1,
        label: "repair-demo-after-fix-stable"
      }
    });
    const afterScreenshot = await httpJsonRequest<ScreenshotResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/screenshot`,
      {
        method: "POST",
        body: {
          label: "repair-demo-after-fix"
        }
      }
    );
    await assertScreenshotsDiffer(
      beforeScreenshot.screenshot.path,
      afterScreenshot.screenshot.path
    );

    const handoff = await httpJsonRequest<VisualHandoffResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/visual-handoff`
    );

    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}`, {
      method: "DELETE"
    });
    stopped = true;

    result = {
      sessionId,
      browserCommand: browserLaunch.command,
      browserPath: browser.path,
      vitePort: parsed.vitePort,
      httpPort: parsed.httpPort,
      evidencePath: createResponse.session.evidencePath,
      beforeScreenshotPath: beforeScreenshot.screenshot.path,
      annotationId: annotationResponse.annotation.id,
      cropPath: annotationResponse.annotation.cropPath,
      visualHandoffPath: handoff.path,
      afterScreenshotPath: afterScreenshot.screenshot.path
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
        await stopChildProcess(httpServer, "Annotation repair HTTP smoke server");
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
    throw new Error("smoke-annotation-repair-demo did not produce a result.");
  }

  return {
    ...result,
    cleanupSucceeded: stopped && serverStopped && viteStopped,
    stopped,
    serverStopped,
    viteStopped
  };
}

export function parseSmokeAnnotationRepairArgs(
  args: readonly string[]
): SmokeAnnotationRepairArgs {
  let workspacePath = defaultWorkspacePath();
  let vitePort = 5180;
  let httpPort = 7354;

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

    throw new Error(`Unknown smoke-annotation-repair-demo option: ${arg}`);
  }

  return {
    workspacePath,
    vitePort,
    httpPort
  };
}

export function ensureAnnotationRepairSmokeReady(report: DoctorReport): void {
  if (getMissingRequiredDependencies(report.dependencies).length > 0) {
    throw new Error(formatMissingRequiredMessage(report));
  }
}

export function createRepairDemoAnnotationPayload(
  screenshotFileName: string
): CreateAnnotationPayload {
  return {
    screenshotFileName,
    type: "rectangle",
    ...REPAIR_DEMO_ANNOTATION_RECT,
    note: REPAIR_DEMO_NOTE,
    color: "#ff0000",
    cropPngBase64: TINY_PNG_DATA_URL
  };
}

async function verifyAnnotationArtifacts(
  fetchLike: FetchLike,
  baseUrl: string,
  sessionId: string,
  evidencePath: string,
  screenshotFileName: string,
  annotation: AnnotationResponse["annotation"]
): Promise<void> {
  await stat(join(evidencePath, "annotations.jsonl"));
  if (!annotation.cropPath) {
    throw new Error("Annotation repair smoke expected a crop path.");
  }
  await stat(annotation.cropPath);

  const annotations = await httpJsonRequest<AnnotationsResponse>(
    fetchLike,
    `${baseUrl}/sessions/${sessionId}/annotations`
  );
  if (!annotations.annotations.some((item) => item.id === annotation.id)) {
    throw new Error(`Annotation was not listed by HTTP: ${annotation.id}`);
  }

  const handoff = await httpJsonRequest<VisualHandoffResponse>(
    fetchLike,
    `${baseUrl}/sessions/${sessionId}/visual-handoff`
  );
  await stat(handoff.path);
  const handoffText = await readFile(handoff.path, "utf8");
  if (!handoffText.includes(REPAIR_DEMO_NOTE)) {
    throw new Error("visual-handoff.md does not include the repair demo note.");
  }
  if (!handoffText.includes(`screenshots/${screenshotFileName}`)) {
    throw new Error("visual-handoff.md does not reference the annotated screenshot.");
  }
  if (!handoffText.includes(`annotations/${basename(annotation.cropPath)}`)) {
    throw new Error("visual-handoff.md does not reference the annotation crop.");
  }
}

async function focusFirstWindow(
  fetchLike: FetchLike,
  baseUrl: string,
  sessionId: string
): Promise<void> {
  const windows = await waitForHttpWindows(fetchLike, baseUrl, sessionId);
  const target = windows[0];
  if (!target) {
    throw new Error("Annotation repair smoke could not find a browser window.");
  }
  await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}/focus-window`, {
    method: "POST",
    body: {
      id: target.id
    }
  });
  await delay(500);
}

async function navigateBrowserTo(
  fetchLike: FetchLike,
  baseUrl: string,
  sessionId: string,
  url: string
): Promise<void> {
  await focusFirstWindow(fetchLike, baseUrl, sessionId);
  await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}/hotkey`, {
    method: "POST",
    body: {
      keys: ["ctrl", "l"],
      label: "repair-demo-focus-address"
    }
  });
  await delay(100);
  await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}/type-text`, {
    method: "POST",
    body: {
      text: url,
      label: "repair-demo-type-fixed-url"
    }
  });
  await delay(100);
  await httpJsonRequest(fetchLike, `${baseUrl}/sessions/${sessionId}/hotkey`, {
    method: "POST",
    body: {
      keys: ["Enter"],
      label: "repair-demo-navigate-fixed"
    }
  });
  await delay(1000);
}

async function assertScreenshotsDiffer(leftPath: string, rightPath: string): Promise<void> {
  const [left, right] = await Promise.all([readFile(leftPath), readFile(rightPath)]);
  if (left.equals(right)) {
    throw new Error("Annotation repair before/after screenshots did not change.");
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
      throw new Error(formatServerExitedMessage("Annotation repair HTTP smoke", serverOutput));
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
    `Annotation repair HTTP smoke server did not become ready within ${timeoutMs}ms: ${
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

interface CreateAnnotationPayload {
  readonly screenshotFileName: string;
  readonly type: "rectangle";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly note: string;
  readonly color: string;
  readonly cropPngBase64: string;
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

interface AnnotationResponse {
  readonly annotation: {
    readonly id: string;
    readonly cropPath?: string;
  };
}

interface AnnotationsResponse {
  readonly annotations: readonly {
    readonly id: string;
  }[];
}

interface VisualHandoffResponse {
  readonly path: string;
  readonly text: string;
}

interface HttpWindowInfo {
  readonly id: string;
  readonly title: string;
  readonly pid?: number;
}

interface WindowsResponse {
  readonly windows: HttpWindowInfo[];
}
