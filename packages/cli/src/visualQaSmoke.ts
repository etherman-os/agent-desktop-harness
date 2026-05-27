import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
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

export interface SmokeVisualQaArgs {
  readonly workspacePath: string;
  readonly vitePort: number;
  readonly httpPort: number;
  readonly text: string;
}

export interface SmokeVisualBaselineArgs {
  readonly workspacePath: string;
  readonly vitePort: number;
  readonly httpPort: number;
  readonly text: string;
  readonly baselineName: string;
  readonly baselineSuite: string;
}

export interface VisualSmokeSummary {
  readonly diffPixelRatio: number;
  readonly passed?: boolean;
  readonly diffPath?: string;
}

export interface SmokeVisualQaResult {
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
  readonly visualAssertionsPath: string;
  readonly reportPath: string;
  readonly visualCompare: VisualSmokeSummary;
  readonly visualAssertChanged: VisualSmokeSummary;
  readonly cleanupSucceeded: boolean;
  readonly stopped: boolean;
  readonly appClosed: boolean;
  readonly serverStopped: boolean;
  readonly viteStopped: boolean;
}

export interface SmokeVisualBaselineResult {
  readonly sessionId: string;
  readonly appId: string;
  readonly selectedDriver: string;
  readonly semantic: boolean;
  readonly browserCommand: string;
  readonly browserPath: string;
  readonly vitePort: number;
  readonly httpPort: number;
  readonly evidencePath: string;
  readonly baselineName: string;
  readonly baselineSuite: string;
  readonly baselinePath: string;
  readonly listedBaselineCount: number;
  readonly screenshots: readonly string[];
  readonly visualAssertionsPath: string;
  readonly reportPath: string;
  readonly baselineSame: VisualSmokeSummary;
  readonly baselineChanged: VisualSmokeSummary;
  readonly cleanupSucceeded: boolean;
  readonly stopped: boolean;
  readonly appClosed: boolean;
  readonly serverStopped: boolean;
  readonly viteStopped: boolean;
}

export interface SmokeVisualQaOptions {
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
  readonly fetch?: FetchLike;
  readonly detectBrowser?: () => Promise<GuiBrowser | undefined>;
}

export async function runSmokeVisualQa(
  args: readonly string[],
  options: SmokeVisualQaOptions = {},
): Promise<SmokeVisualQaResult> {
  const parsed = parseSmokeVisualQaArgs(args);
  const report =
    options.doctorReport ?? (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureVisualQaSmokeReady(report);
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
        SmokeVisualQaResult,
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
          label: "visual-qa-open-demo",
        },
      },
    );
    appId = openResponse.app.appId;
    if (openResponse.selectedDriver !== "browser-playwright" || !openResponse.semantic) {
      throw new Error(
        `app_open selected ${openResponse.selectedDriver} semantic=${String(openResponse.semantic)}.`,
      );
    }

    const beforeScreenshot = await appScreenshot(
      fetchLike,
      httpBaseUrl,
      sessionId,
      "visual-qa-before",
    );
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/fill`, {
      method: "POST",
      body: {
        placeholder: "Type a message",
        value: parsed.text,
        label: "visual-qa-fill-message",
      },
    });
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/click`, {
      method: "POST",
      body: {
        role: "button",
        name: "Save message",
        label: "visual-qa-click-save",
      },
    });
    await assertAppText(fetchLike, httpBaseUrl, sessionId, "Status: saved");
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/click`, {
      method: "POST",
      body: {
        role: "button",
        name: "Open details",
        label: "visual-qa-click-details",
      },
    });
    await assertAppText(fetchLike, httpBaseUrl, sessionId, "Details panel is open");
    const afterScreenshot = await appScreenshot(
      fetchLike,
      httpBaseUrl,
      sessionId,
      "visual-qa-after",
    );

    const compare = await httpJsonRequest<VisualCompareResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/visual/compare`,
      {
        method: "POST",
        body: {
          beforePath: beforeScreenshot.screenshot.path,
          afterPath: afterScreenshot.screenshot.path,
          label: "visual-qa-before-after",
          createDiffImage: true,
          threshold: 0.1,
        },
      },
    );
    if (!compare.result.diffPath) {
      throw new Error("Visual QA compare did not produce a diff image path.");
    }
    await stat(compare.result.diffPath);

    const changed = await httpJsonRequest<VisualCompareResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/visual/assert-changed`,
      {
        method: "POST",
        body: {
          beforePath: beforeScreenshot.screenshot.path,
          afterPath: afterScreenshot.screenshot.path,
          label: "visual-qa-changed",
          minDiffPixelRatio: 0.00001,
          threshold: 0.1,
        },
      },
    );
    if (changed.result.passed !== true) {
      throw new Error(
        `Visual QA assert-changed failed with diffPixelRatio=${changed.result.diffPixelRatio}.`,
      );
    }

    const visualAssertionsPath = join(
      createResponse.session.evidencePath,
      "visual-assertions.jsonl",
    );
    await stat(visualAssertionsPath);
    await httpJsonRequest<VisualAssertionsResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/visual/assertions`,
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

    const reportPath = join(createResponse.session.evidencePath, "report.md");
    await stat(reportPath);
    const reportText = await readFile(reportPath, "utf8");
    if (!reportText.includes("## Visual QA")) {
      throw new Error("report.md does not include the Visual QA summary.");
    }

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
      screenshots: [beforeScreenshot.screenshot.path, afterScreenshot.screenshot.path],
      visualAssertionsPath,
      reportPath,
      visualCompare: summarizeVisualResult(compare.result),
      visualAssertChanged: summarizeVisualResult(changed.result),
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
        await stopChildProcess(httpServer, "Visual QA HTTP smoke server");
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
    throw new Error("smoke-visual-qa did not produce a result.");
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

export async function runSmokeVisualBaseline(
  args: readonly string[],
  options: SmokeVisualQaOptions = {},
): Promise<SmokeVisualBaselineResult> {
  const parsed = parseSmokeVisualBaselineArgs(args);
  const report =
    options.doctorReport ?? (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureVisualQaSmokeReady(report);
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
        SmokeVisualBaselineResult,
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
          label: "visual-baseline-open-demo",
        },
      },
    );
    appId = openResponse.app.appId;
    if (openResponse.selectedDriver !== "browser-playwright" || !openResponse.semantic) {
      throw new Error(
        `app_open selected ${openResponse.selectedDriver} semantic=${String(openResponse.semantic)}.`,
      );
    }

    const cleanScreenshot = await appScreenshot(
      fetchLike,
      httpBaseUrl,
      sessionId,
      "visual-baseline-clean",
    );
    const savedBaseline = await httpJsonRequest<VisualBaselineResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/visual/baselines`,
      {
        method: "POST",
        body: {
          screenshotPath: cleanScreenshot.screenshot.path,
          name: parsed.baselineName,
          suite: parsed.baselineSuite,
          overwrite: true,
          metadata: {
            smoke: "visual-baseline",
          },
        },
      },
    );
    await stat(savedBaseline.baseline.path);

    const baselines = await httpJsonRequest<VisualBaselinesResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/visual/baselines?suite=${encodeURIComponent(parsed.baselineSuite)}`,
    );
    if (
      !baselines.baselines.some(
        (baseline) =>
          baseline.name === savedBaseline.baseline.name &&
          baseline.suite === savedBaseline.baseline.suite,
      )
    ) {
      throw new Error("Saved visual baseline was not returned by the baseline list route.");
    }

    const same = await httpJsonRequest<VisualCompareResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/visual/compare-baseline`,
      {
        method: "POST",
        body: {
          screenshotPath: cleanScreenshot.screenshot.path,
          baselineName: parsed.baselineName,
          suite: parsed.baselineSuite,
          label: "visual-baseline-clean-regression",
          maxDiffPixelRatio: 0,
          createDiffImage: false,
        },
      },
    );
    if (same.result.passed !== true) {
      throw new Error(
        `Visual baseline same-image comparison failed with diffPixelRatio=${same.result.diffPixelRatio}.`,
      );
    }

    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/fill`, {
      method: "POST",
      body: {
        placeholder: "Type a message",
        value: parsed.text,
        label: "visual-baseline-fill-message",
      },
    });
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/click`, {
      method: "POST",
      body: {
        role: "button",
        name: "Save message",
        label: "visual-baseline-click-save",
      },
    });
    await assertAppText(fetchLike, httpBaseUrl, sessionId, "Status: saved");
    await httpJsonRequest(fetchLike, `${httpBaseUrl}/sessions/${sessionId}/apps/click`, {
      method: "POST",
      body: {
        role: "button",
        name: "Open details",
        label: "visual-baseline-click-details",
      },
    });
    await assertAppText(fetchLike, httpBaseUrl, sessionId, "Details panel is open");
    const changedScreenshot = await appScreenshot(
      fetchLike,
      httpBaseUrl,
      sessionId,
      "visual-baseline-changed",
    );

    const changed = await httpJsonRequest<VisualCompareResponse>(
      fetchLike,
      `${httpBaseUrl}/sessions/${sessionId}/visual/compare-baseline`,
      {
        method: "POST",
        body: {
          screenshotPath: changedScreenshot.screenshot.path,
          baselineName: parsed.baselineName,
          suite: parsed.baselineSuite,
          label: "visual-baseline-changed-regression",
          maxDiffPixelRatio: 0.00001,
          createDiffImage: true,
          threshold: 0.1,
        },
      },
    );
    if (changed.result.diffPixelRatio <= 0) {
      throw new Error("Visual baseline changed-image comparison reported no visual change.");
    }
    if (!changed.result.diffPath) {
      throw new Error("Visual baseline changed-image comparison did not produce a diff image.");
    }
    await stat(changed.result.diffPath);

    const visualAssertionsPath = join(
      createResponse.session.evidencePath,
      "visual-assertions.jsonl",
    );
    await stat(visualAssertionsPath);

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

    const reportPath = join(createResponse.session.evidencePath, "report.md");
    await stat(reportPath);
    const reportText = await readFile(reportPath, "utf8");
    if (!reportText.includes("compare-baseline")) {
      throw new Error("report.md does not include the visual baseline comparison summary.");
    }

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
      baselineName: savedBaseline.baseline.name,
      baselineSuite: savedBaseline.baseline.suite ?? "default",
      baselinePath: savedBaseline.baseline.path,
      listedBaselineCount: baselines.baselines.length,
      screenshots: [cleanScreenshot.screenshot.path, changedScreenshot.screenshot.path],
      visualAssertionsPath,
      reportPath,
      baselineSame: summarizeVisualResult(same.result),
      baselineChanged: summarizeVisualResult(changed.result),
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
        await stopChildProcess(httpServer, "Visual baseline HTTP smoke server");
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
    throw new Error("smoke-visual-baseline did not produce a result.");
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

export function parseSmokeVisualQaArgs(args: readonly string[]): SmokeVisualQaArgs {
  let workspacePath = defaultWorkspacePath();
  let vitePort = 5183;
  let httpPort = 7357;
  let text = "hello from visual qa smoke";

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

    throw new Error(`Unknown smoke-visual-qa option: ${arg}`);
  }

  return {
    workspacePath,
    vitePort,
    httpPort,
    text,
  };
}

export function parseSmokeVisualBaselineArgs(args: readonly string[]): SmokeVisualBaselineArgs {
  let workspacePath = defaultWorkspacePath();
  let vitePort = 5184;
  let httpPort = 7358;
  let text = "hello from visual baseline smoke";
  let baselineName = "sample-vite-clean";
  let baselineSuite = "smoke";

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

    if (arg === "--baseline-name") {
      baselineName = requireValue(args, index, "--baseline-name");
      index += 1;
      continue;
    }

    if (arg === "--suite") {
      baselineSuite = requireValue(args, index, "--suite");
      index += 1;
      continue;
    }

    throw new Error(`Unknown smoke-visual-baseline option: ${arg}`);
  }

  return {
    workspacePath,
    vitePort,
    httpPort,
    text,
    baselineName,
    baselineSuite,
  };
}

export function ensureVisualQaSmokeReady(report: DoctorReport): void {
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
      throw new Error(formatServerExitedMessage("Visual QA HTTP smoke", serverOutput));
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
    `Visual QA HTTP smoke server did not become ready within ${timeoutMs}ms: ${
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

function summarizeVisualResult(result: VisualCompareResult): VisualSmokeSummary {
  return {
    diffPixelRatio: result.diffPixelRatio,
    passed: result.passed,
    diffPath: result.diffPath,
  };
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

interface CreateSessionResponse {
  readonly session: {
    readonly id: string;
    readonly evidencePath: string;
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

interface VisualCompareResponse {
  readonly result: VisualCompareResult;
}

interface VisualAssertionsResponse {
  readonly assertions: readonly VisualCompareResult[];
}

interface VisualBaselineResponse {
  readonly baseline: {
    readonly name: string;
    readonly suite?: string;
    readonly path: string;
  };
}

interface VisualBaselinesResponse {
  readonly baselines: readonly {
    readonly name: string;
    readonly suite?: string;
    readonly path: string;
  }[];
}

interface VisualCompareResult {
  readonly diffPath?: string;
  readonly diffPixelRatio: number;
  readonly passed?: boolean;
}
