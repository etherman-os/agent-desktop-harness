#!/usr/bin/env node

import { SessionManager } from "@agent-desktop-harness/core";
import { runSmokeAnnotationRepairDemo } from "./annotationRepairSmoke.js";
import { formatDoctorText, runDoctor } from "./doctor.js";
import { runSmokeHttp } from "./httpSmoke.js";
import { runSmokeMcp } from "./mcpSmoke.js";
import { runSmokeX11 } from "./smoke.js";
import { runSmokeViteHttp, runSmokeViteMcp } from "./viteSmoke.js";
import { defaultWorkspacePath } from "./workspace.js";

interface StartSessionArgs {
  readonly workspacePath: string;
  readonly captureScreenshot: boolean;
  readonly screenshotLabel?: string;
  readonly once: boolean;
}

interface AnnotateUrlArgs {
  readonly sessionId: string;
  readonly host: string;
  readonly port: number;
  readonly screenshot?: string;
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const normalizedArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  const [command, ...args] = normalizedArgs;

  if (command === "start-session") {
    await runStartSession(args);
    return;
  }

  if (command === "doctor") {
    await runDoctorCommand(args);
    return;
  }

  if (command === "annotate-url") {
    runAnnotateUrl(args);
    return;
  }

  if (command === "smoke-x11") {
    const result = await runSmokeX11(args);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "smoke-http") {
    const result = await runSmokeHttp(args);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "smoke-mcp") {
    const result = await runSmokeMcp(args);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "smoke-vite-http") {
    const result = await runSmokeViteHttp(args);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "smoke-vite-mcp") {
    const result = await runSmokeViteMcp(args);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "smoke-annotation-repair-demo") {
    const result = await runSmokeAnnotationRepairDemo(args);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command !== undefined) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  printUsage();
}

function runAnnotateUrl(args: readonly string[]): void {
  const parsed = parseAnnotateUrlArgs(args);
  const url = new URL(`http://${parsed.host}:${parsed.port}/sessions/${encodeURIComponent(parsed.sessionId)}/annotate`);
  if (parsed.screenshot) {
    url.searchParams.set("screenshot", parsed.screenshot);
  }
  console.log(url.toString());
}

async function runDoctorCommand(args: readonly string[]): Promise<void> {
  const parsed = parseDoctorArgs(args);
  const report = await runDoctor();

  if (parsed.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatDoctorText(report));
}

async function runStartSession(args: readonly string[]): Promise<void> {
  const parsed = parseStartSessionArgs(args);
  const manager = new SessionManager();
  const session = await manager.createSession({
    workspacePath: parsed.workspacePath
  });

  let screenshotPath: string | undefined;

  try {
    if (parsed.captureScreenshot) {
      const screenshot = await manager.captureScreenshot(session.id, {
        label: parsed.screenshotLabel ?? "initial"
      });
      screenshotPath = screenshot.path;
    }

    if (parsed.once) {
      await manager.stopSession(session.id);
    }

    console.log(
      JSON.stringify(
        {
          sessionId: session.id,
          display: session.display,
          evidencePath: session.evidencePath,
          screenshotPath,
          stopped: parsed.once
        },
        null,
        2
      )
    );

    if (!parsed.once) {
      await waitForShutdownSignal(async () => {
        await manager.stopSession(session.id);
      });
    }
  } catch (error) {
    await manager.stopSession(session.id).catch(() => undefined);
    throw error;
  }
}

function parseStartSessionArgs(args: readonly string[]): StartSessionArgs {
  let workspacePath = defaultWorkspacePath();
  let captureScreenshot = false;
  let screenshotLabel: string | undefined;
  let once = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = requireValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--screenshot") {
      captureScreenshot = true;
      continue;
    }

    if (arg === "--label") {
      screenshotLabel = requireValue(args, index, "--label");
      index += 1;
      continue;
    }

    if (arg === "--once") {
      once = true;
      continue;
    }

    throw new Error(`Unknown start-session option: ${arg}`);
  }

  return {
    workspacePath,
    captureScreenshot,
    screenshotLabel,
    once
  };
}

function parseDoctorArgs(args: readonly string[]): { readonly json: boolean } {
  let json = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }

    throw new Error(`Unknown doctor option: ${arg}`);
  }

  return { json };
}

function parseAnnotateUrlArgs(args: readonly string[]): AnnotateUrlArgs {
  let sessionId: string | undefined;
  let host = "127.0.0.1";
  let port = 7341;
  let screenshot: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--session") {
      sessionId = requireValue(args, index, "--session");
      index += 1;
      continue;
    }

    if (arg === "--host") {
      host = requireValue(args, index, "--host");
      index += 1;
      continue;
    }

    if (arg === "--port") {
      port = parsePort(requireValue(args, index, "--port"));
      index += 1;
      continue;
    }

    if (arg === "--screenshot") {
      screenshot = requireValue(args, index, "--screenshot");
      index += 1;
      continue;
    }

    throw new Error(`Unknown annotate-url option: ${arg}`);
  }

  if (!sessionId) {
    throw new Error("annotate-url requires --session.");
  }

  return {
    sessionId,
    host,
    port,
    screenshot
  };
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
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

function printUsage(): void {
  console.log(`Usage:
  agent-desktop-harness start-session [--workspace DIR] [--screenshot] [--label LABEL] [--once]
  agent-desktop-harness doctor [--json]
  agent-desktop-harness annotate-url --session SESSION_ID [--host HOST] [--port PORT] [--screenshot FILE]
  agent-desktop-harness smoke-x11 [--workspace DIR] [--command CMD] [--args a,b] [--text TEXT]
  agent-desktop-harness smoke-http [--workspace DIR] [--port PORT] [--text TEXT]
  agent-desktop-harness smoke-mcp [--workspace DIR] [--text TEXT]
  agent-desktop-harness smoke-vite-http [--workspace DIR] [--vite-port PORT] [--http-port PORT] [--text TEXT]
  agent-desktop-harness smoke-vite-mcp [--workspace DIR] [--vite-port PORT] [--text TEXT]
  agent-desktop-harness smoke-annotation-repair-demo [--workspace DIR] [--vite-port PORT] [--http-port PORT]

Examples:
  pnpm --filter @agent-desktop-harness/cli dev -- start-session --screenshot --once
  pnpm --filter @agent-desktop-harness/cli dev -- doctor
  pnpm --filter @agent-desktop-harness/cli dev -- annotate-url --session SESSION_ID
  pnpm --filter @agent-desktop-harness/cli dev -- smoke-x11 --command xterm
  pnpm --filter @agent-desktop-harness/cli dev -- smoke-http
  pnpm --filter @agent-desktop-harness/cli dev -- smoke-mcp
  pnpm --filter @agent-desktop-harness/cli dev -- smoke-vite-http
  pnpm --filter @agent-desktop-harness/cli dev -- smoke-vite-mcp
  pnpm --filter @agent-desktop-harness/cli dev -- smoke-annotation-repair-demo
`);
}

async function waitForShutdownSignal(onShutdown: () => Promise<void>): Promise<void> {
  await new Promise<void>((resolve) => {
    let shuttingDown = false;

    const shutdown = (): void => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      void onShutdown().finally(resolve);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
