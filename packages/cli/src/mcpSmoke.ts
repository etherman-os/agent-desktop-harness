import { spawn } from "node:child_process";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import type { DoctorReport } from "./doctor.js";
import { runDoctor } from "./doctor.js";
import { runProcess, stopChildProcess } from "./processUtils.js";
import { repoRootPath } from "./repo.js";
import { ensureSmokeReady } from "./smoke.js";
import { defaultWorkspacePath } from "./workspace.js";

export interface SmokeMcpArgs {
  readonly workspacePath: string;
  readonly text: string;
}

export interface SmokeMcpResult {
  readonly sessionId: string;
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

export interface SmokeMcpOptions {
  readonly doctorReport?: DoctorReport;
  readonly runDoctor?: () => Promise<DoctorReport>;
}

export async function runSmokeMcp(
  args: readonly string[],
  options: SmokeMcpOptions = {}
): Promise<SmokeMcpResult> {
  const parsed = parseSmokeMcpArgs(args);
  const report =
    options.doctorReport ??
    (await (options.runDoctor ?? (async () => await runDoctor()))());
  ensureSmokeReady(report, "xterm");

  const rootPath = repoRootPath();
  await runProcess("pnpm", ["--filter", "@agent-desktop-harness/mcp-server", "build"], {
    cwd: rootPath,
    env: process.env
  });

  const server = spawn(process.execPath, [join(rootPath, "packages/mcp-server/dist/index.js")], {
    cwd: rootPath,
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const client = new RawMcpClient(server);

  let sessionId: string | undefined;
  let stopped = false;
  let serverStopped = false;
  let result: Omit<
    SmokeMcpResult,
    "cleanupSucceeded" | "stopped" | "serverStopped"
  > | undefined;
  let runError: unknown;
  let cleanupError: unknown;

  try {
    await client.initialize();
    await client.assertTools([
      "desktop_start_session",
      "desktop_launch_app",
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
        allowedCommands: ["xterm"]
      }
    });
    sessionId = session.id;

    await client.callTool("desktop_launch_app", {
      sessionId,
      command: "xterm",
      args: [],
      cwd: parsed.workspacePath,
      label: "mcp-smoke-xterm"
    });
    const stableScreen = await client.callTool<WaitForStableScreenToolResult>(
      "desktop_wait_for_stable_screen",
      {
        sessionId,
        timeoutMs: 5000,
        intervalMs: 500,
        stableChecks: 1,
        label: "mcp-smoke-stable"
      }
    );
    const initialScreenshot = await client.callTool<ScreenshotToolResult>(
      "desktop_screenshot",
      {
        sessionId,
        label: "mcp-smoke-initial"
      }
    );
    const windows = await waitForMcpWindows(client, sessionId);
    const targetWindow = windows[0];
    if (!targetWindow) {
      throw new Error("MCP smoke could not find a window to focus.");
    }

    await client.callTool("desktop_focus_window", {
      sessionId,
      id: targetWindow.id
    });
    await client.callTool("desktop_click", {
      sessionId,
      x: 100,
      y: 100,
      button: "left",
      label: "mcp-smoke-click"
    });
    await client.callTool("desktop_type_text", {
      sessionId,
      text: parsed.text,
      label: "mcp-smoke-type"
    });
    const afterTypeScreenshot = await client.callTool<ScreenshotToolResult>(
      "desktop_screenshot",
      {
        sessionId,
        label: "mcp-smoke-after-type"
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
      evidencePath: session.evidencePath,
      screenshots: [initialScreenshot.path, afterTypeScreenshot.path],
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
    if (sessionId && !stopped) {
      try {
        await client.callTool("desktop_stop_session", { sessionId });
        stopped = true;
      } catch (error) {
        cleanupError = error;
      }
    }

    try {
      await client.close();
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
    throw new Error("smoke-mcp did not produce a result.");
  }

  return {
    ...result,
    cleanupSucceeded: stopped && serverStopped,
    stopped,
    serverStopped
  };
}

export function parseSmokeMcpArgs(args: readonly string[]): SmokeMcpArgs {
  let workspacePath = defaultWorkspacePath();
  let text = "agent-desktop-harness mcp smoke";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = requireValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--text") {
      text = requireValue(args, index, "--text");
      index += 1;
      continue;
    }

    throw new Error(`Unknown smoke-mcp option: ${arg}`);
  }

  return {
    workspacePath,
    text
  };
}

export function parseJsonRpcLine(line: string): JsonRpcMessage {
  const value = JSON.parse(line) as unknown;
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    throw new Error("Invalid JSON-RPC message.");
  }
  return value as JsonRpcMessage;
}

export function parseMcpToolTextResult(result: unknown): unknown {
  if (!isRecord(result)) {
    throw new Error("MCP tool response was not an object.");
  }

  const content = Array.isArray(result.content) ? result.content : [];
  const textItems = content
    .filter((item): item is { readonly text: string } =>
      isRecord(item) && item.type === "text" && typeof item.text === "string"
    )
    .map((item) => item.text);

  if (result.isError === true) {
    throw new Error(textItems.join("\n") || "MCP tool call failed.");
  }

  const text = textItems[0];
  if (!text) {
    throw new Error("MCP tool response did not include text content.");
  }

  return JSON.parse(text) as unknown;
}

export class RawMcpClient {
  private nextId = 1;
  private buffer = "";
  private stderr = "";
  private readonly pending = new Map<
    number,
    {
      readonly resolve: (value: unknown) => void;
      readonly reject: (error: Error) => void;
      readonly timeout: NodeJS.Timeout;
    }
  >();

  constructor(private readonly child: ChildProcess) {
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.processBuffer();
    });
    child.stderr?.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
    child.once("exit", (code, signal) => {
      this.rejectAll(
        new Error(
          [
            `MCP smoke server exited (code=${String(code)}, signal=${String(signal)}).`,
            this.stderr.trim() ? `stderr:\n${this.stderr.trim()}` : undefined
          ]
            .filter(Boolean)
            .join("\n")
        )
      );
    });
    child.once("error", (error) => {
      this.rejectAll(error);
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: {
        name: "agent-desktop-harness-smoke",
        version: "0.0.0"
      }
    });
    await this.notify("notifications/initialized");
  }

  async assertTools(names: readonly string[]): Promise<void> {
    const result = await this.request("tools/list", {});
    const tools = isRecord(result) && Array.isArray(result.tools) ? result.tools : [];
    const available = new Set(
      tools
        .filter((tool): tool is { readonly name: string } =>
          isRecord(tool) && typeof tool.name === "string"
        )
        .map((tool) => tool.name)
    );
    const missing = names.filter((name) => !available.has(name));
    if (missing.length > 0) {
      throw new Error(`MCP tools/list is missing tools: ${missing.join(", ")}`);
    }
  }

  async callTool<T = unknown>(
    name: string,
    args: Readonly<Record<string, unknown>>
  ): Promise<T> {
    const result = await this.request("tools/call", {
      name,
      arguments: args
    });
    return parseMcpToolTextResult(result) as T;
  }

  async request(
    method: string,
    params: Readonly<Record<string, unknown>>,
    timeoutMs = 60_000
  ): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;

    const response = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });

    await this.writeMessage({
      jsonrpc: "2.0",
      id,
      method,
      params
    });

    return await response;
  }

  async notify(
    method: string,
    params?: Readonly<Record<string, unknown>>
  ): Promise<void> {
    await this.writeMessage({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  async close(): Promise<void> {
    this.rejectAll(new Error("MCP client is closing."));
    await stopChildProcess(this.child, "MCP smoke server");
  }

  private async writeMessage(message: JsonRpcMessage): Promise<void> {
    const text = `${JSON.stringify(message)}\n`;
    await new Promise<void>((resolve, reject) => {
      const stdin = this.child.stdin;
      if (!stdin) {
        reject(new Error("MCP server stdin is not available."));
        return;
      }

      stdin.write(text, (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private processBuffer(): void {
    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }

      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIndex + 1);

      try {
        this.handleMessage(parseJsonRpcLine(line));
      } catch (error) {
        this.rejectAll(
          new Error(
            `MCP stdout contained invalid protocol data: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (!("id" in message) || typeof message.id !== "number") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timeout);

    if ("error" in message && message.error) {
      pending.reject(
        new Error(
          isRecord(message.error) && typeof message.error.message === "string"
            ? message.error.message
            : "MCP request failed."
        )
      );
      return;
    }

    pending.resolve("result" in message ? message.result : undefined);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }
}

export async function waitForMcpWindows(
  client: RawMcpClient,
  sessionId: string,
  timeoutMs = 5000
): Promise<WindowInfo[]> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await client.callTool<WindowsToolResult>("desktop_get_windows", {
      sessionId
    });
    if (response.windows.length > 0) {
      return response.windows;
    }
    await delay(250);
  }

  throw new Error(`No windows appeared within ${timeoutMs}ms during smoke-mcp.`);
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type JsonRpcMessage = Readonly<Record<string, unknown>> & {
  readonly jsonrpc: "2.0";
  readonly id?: number;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
};

interface SessionToolResult {
  readonly id: string;
  readonly evidencePath: string;
}

interface ScreenshotToolResult {
  readonly path: string;
}

interface WaitForStableScreenToolResult {
  readonly stable: boolean;
  readonly checks: number;
  readonly elapsedMs: number;
  readonly lastScreenshot?: {
    readonly path: string;
  };
}

export interface WindowInfo {
  readonly id: string;
  readonly title: string;
  readonly pid?: number;
}

interface WindowsToolResult {
  readonly windows: WindowInfo[];
}

interface EvidenceReportToolResult {
  readonly path: string;
}
