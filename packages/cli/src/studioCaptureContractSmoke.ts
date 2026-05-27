import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { SessionManager } from "@agent-desktop-harness/core";
import {
  buildBrowserLaunchConfig,
  detectGuiBrowser,
  formatMissingGuiBrowserMessage,
  type GuiBrowser,
} from "./browser.js";
import {
  type DoctorReport,
  formatMissingRequiredMessage,
  getMissingRequiredDependencies,
  runDoctor,
} from "./doctor.js";
import { repoRootPath } from "./repo.js";
import { defaultWorkspacePath } from "./workspace.js";

const DEFAULT_TITLE = "Hermes Studio Capture Contract";
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface StudioCaptureContractArgs {
  readonly workspacePath: string;
  readonly outputPath: string;
  readonly title: string;
  readonly port: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioCaptureContractResult {
  readonly ok: boolean;
  readonly type: "screenshot";
  readonly local_path: string;
  readonly title: string;
  readonly metadata: {
    readonly contract: "hermes-studio-harness-capture-v1";
    readonly target_type: "url";
    readonly target?: string;
    readonly output_path_requested: string;
    readonly verified_exists: boolean;
    readonly file_size_bytes?: number;
    readonly sha256?: string;
    readonly session_id?: string;
    readonly display?: string;
    readonly evidence_path?: string;
    readonly source_screenshot_path?: string;
    readonly browser_command?: string;
    readonly browser_path?: string;
    readonly browser_source?: GuiBrowser["source"];
    readonly viewport: {
      readonly width: number;
      readonly height: number;
    };
  };
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface StudioCaptureContractOptions {
  readonly manager?: SessionManager;
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
  readonly detectBrowser?: () => Promise<GuiBrowser | undefined>;
}

export async function runSmokeStudioCaptureContract(
  args: readonly string[],
  options: StudioCaptureContractOptions = {},
): Promise<StudioCaptureContractResult> {
  const parsed = parseStudioCaptureContractArgs(args);
  const warnings: string[] = [];
  const errors: string[] = [];
  let localServer: StartedContractServer | undefined;
  let profileDir: string | undefined;
  let sessionId: string | undefined;
  let sessionStopped = false;
  let sourceScreenshotPath: string | undefined;
  let browser: GuiBrowser | undefined;
  let target: string | undefined;
  let display: string | undefined;
  let evidencePath: string | undefined;
  let manager: SessionManager | undefined;

  try {
    await rm(parsed.outputPath, { force: true });
    const report =
      options.doctorReport ?? (await (options.runDoctor ?? (async () => await runDoctor()))());
    const missingRequired = getMissingRequiredDependencies(report.dependencies);
    if (missingRequired.length > 0) {
      throw new Error(formatMissingRequiredMessage(report));
    }

    browser = await (options.detectBrowser ?? detectGuiBrowser)();
    if (!browser) {
      throw new Error(formatMissingGuiBrowserMessage());
    }

    localServer = await startContractServer(parsed.port, parsed.title);
    target = localServer.url;
    profileDir = await mkdtemp(join(tmpdir(), "agent-desktop-harness-studio-capture-"));
    const browserLaunch = buildBrowserLaunchConfig(browser, profileDir, target);
    manager = options.manager ?? new SessionManager();

    const session = await manager.createSession({
      workspacePath: parsed.workspacePath,
      display: {
        width: parsed.width,
        height: parsed.height,
        depth: 24,
      },
      policy: {
        allowedCommands: [browserLaunch.command],
      },
    });
    sessionId = session.id;
    display = session.display;
    evidencePath = session.evidencePath;
    warnings.push(...session.warnings);

    await manager.launchApp(session.id, {
      command: browserLaunch.command,
      args: browserLaunch.args,
      cwd: parsed.workspacePath,
    });
    await manager.waitForWindow(session.id, {
      titleIncludes: parsed.title,
      excludeDevtools: true,
      preferLargest: true,
      timeoutMs: 10000,
    });
    await manager.waitForStableScreen(session.id, {
      label: "studio-capture-contract-stable",
      timeoutMs: 5000,
      intervalMs: 500,
      stableChecks: 1,
      mode: "tolerant",
      fileSizeToleranceBytes: 2048,
      retainOnlyLast: true,
    });
    const screenshot = await manager.captureScreenshot(session.id, {
      label: "studio-capture-contract",
    });
    sourceScreenshotPath = screenshot.path;

    await copyVerifiedPng(screenshot.path, parsed.outputPath);
    const fileMetadata = await readVerifiedPngMetadata(parsed.outputPath);

    await manager.stopSession(session.id);
    sessionStopped = true;

    return {
      ok: true,
      type: "screenshot",
      local_path: parsed.outputPath,
      title: parsed.title,
      metadata: {
        contract: "hermes-studio-harness-capture-v1",
        target_type: "url",
        target,
        output_path_requested: parsed.outputPath,
        verified_exists: true,
        file_size_bytes: fileMetadata.fileSizeBytes,
        sha256: fileMetadata.sha256,
        session_id: session.id,
        display: session.display,
        evidence_path: session.evidencePath,
        source_screenshot_path: screenshot.path,
        browser_command: browser.command,
        browser_path: browser.path,
        browser_source: browser.source,
        viewport: {
          width: parsed.width,
          height: parsed.height,
        },
      },
      warnings,
      errors: [],
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    const verified = await verifyExistingPng(parsed.outputPath);
    return {
      ok: false,
      type: "screenshot",
      local_path: parsed.outputPath,
      title: parsed.title,
      metadata: {
        contract: "hermes-studio-harness-capture-v1",
        target_type: "url",
        target,
        output_path_requested: parsed.outputPath,
        verified_exists: verified.exists,
        file_size_bytes: verified.fileSizeBytes,
        sha256: verified.sha256,
        session_id: sessionId,
        display,
        evidence_path: evidencePath,
        source_screenshot_path: sourceScreenshotPath,
        browser_command: browser?.command,
        browser_path: browser?.path,
        browser_source: browser?.source,
        viewport: {
          width: parsed.width,
          height: parsed.height,
        },
      },
      warnings,
      errors,
    };
  } finally {
    if (sessionId && !sessionStopped) {
      try {
        await manager?.stopSession(sessionId);
      } catch {
        // Preserve the original smoke result.
      }
    }
    if (localServer) {
      await closeServer(localServer.server);
    }
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true });
    }
  }
}

export function parseStudioCaptureContractArgs(args: readonly string[]): StudioCaptureContractArgs {
  let workspacePath = defaultWorkspacePath();
  let outputPath = join(
    repoRootPath(),
    ".desktop-harness",
    "studio-capture-contract",
    "screenshot.png",
  );
  let title = DEFAULT_TITLE;
  let port = 0;
  let width = DEFAULT_WIDTH;
  let height = DEFAULT_HEIGHT;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = requireValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--output") {
      outputPath = requireValue(args, index, "--output");
      index += 1;
      continue;
    }

    if (arg === "--title") {
      title = requireValue(args, index, "--title");
      index += 1;
      continue;
    }

    if (arg === "--port") {
      port = parsePort(requireValue(args, index, "--port"));
      index += 1;
      continue;
    }

    if (arg === "--width") {
      width = parsePositiveInteger(requireValue(args, index, "--width"), "--width");
      index += 1;
      continue;
    }

    if (arg === "--height") {
      height = parsePositiveInteger(requireValue(args, index, "--height"), "--height");
      index += 1;
      continue;
    }

    throw new Error(`Unknown smoke-studio-capture-contract option: ${arg}`);
  }

  if (!outputPath.toLowerCase().endsWith(".png")) {
    throw new Error("--output must point to a .png file.");
  }

  return {
    workspacePath: resolve(workspacePath),
    outputPath: isAbsolute(outputPath) ? resolve(outputPath) : resolve(outputPath),
    title,
    port,
    width,
    height,
  };
}

interface StartedContractServer {
  readonly server: Server;
  readonly url: string;
}

async function startContractServer(port: number, title: string): Promise<StartedContractServer> {
  const server = createServer((request, response) => {
    if (request.url !== "/" && request.url !== "/favicon.ico") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }

    if (request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderContractPage(title));
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });

  const address = server.address() as AddressInfo | null;
  if (!address) {
    await closeServer(server);
    throw new Error("Studio capture contract server did not expose a local address.");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

function renderContractPage(title: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      color: #172026;
      background: #f6f8fb;
      font-family: Arial, sans-serif;
    }
    main {
      width: min(820px, calc(100vw - 80px));
      border: 1px solid #9fb3c8;
      background: #ffffff;
      padding: 40px;
    }
    h1 {
      margin: 0 0 14px;
      font-size: 34px;
    }
    p {
      margin: 0;
      font-size: 18px;
      line-height: 1.45;
    }
    code {
      background: #e9eef5;
      padding: 3px 6px;
    }
  </style>
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <p>This local page proves the capture contract for <code>hermes-studio-harness-capture-v1</code>.</p>
  </main>
</body>
</html>`;
}

async function copyVerifiedPng(sourcePath: string, outputPath: string): Promise<void> {
  await readVerifiedPngMetadata(sourcePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
  await readVerifiedPngMetadata(outputPath);
}

async function readVerifiedPngMetadata(
  filePath: string,
): Promise<{ readonly fileSizeBytes: number; readonly sha256: string }> {
  const fileStat = await stat(filePath);
  if (fileStat.size <= PNG_SIGNATURE.length) {
    throw new Error(`Screenshot file is empty or too small: ${filePath}`);
  }

  const contents = await readFile(filePath);
  if (!contents.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`Screenshot file is not a PNG: ${filePath}`);
  }

  return {
    fileSizeBytes: fileStat.size,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

async function verifyExistingPng(filePath: string): Promise<{
  readonly exists: boolean;
  readonly fileSizeBytes?: number;
  readonly sha256?: string;
}> {
  try {
    const metadata = await readVerifiedPngMetadata(filePath);
    return {
      exists: true,
      fileSizeBytes: metadata.fileSizeBytes,
      sha256: metadata.sha256,
    };
  } catch {
    return { exists: false };
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function requireValue(args: readonly string[], index: number, optionName: string): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
