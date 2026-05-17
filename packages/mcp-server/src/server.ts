import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SessionManager } from "@agent-desktop-harness/core";
import { z } from "zod";
import {
  clickSchema,
  createAnnotationSchema,
  focusWindowSchema,
  hotkeySchema,
  launchAppSchema,
  noArgsSchema,
  screenshotSchema,
  scrollSchema,
  sessionIdSchema,
  startSessionSchema,
  typeTextSchema,
  waitForStableScreenSchema
} from "./schemas.js";
import { DesktopMcpToolHandlers } from "./toolHandlers.js";

export interface CreateServerOptions {
  readonly sessionManager?: SessionManager;
  readonly defaultWorkspaceDir?: string;
}

export function createDesktopHarnessMcpServer(
  options: CreateServerOptions = {}
): McpServer {
  const server = new McpServer({
    name: "agent-desktop-harness",
    version: "0.0.0"
  });
  const sessionManager = options.sessionManager ?? new SessionManager();
  const handlers = new DesktopMcpToolHandlers(
    sessionManager,
    options.defaultWorkspaceDir
  );

  registerDesktopHarnessTools(server, handlers);
  return server;
}

export function registerDesktopHarnessTools(
  server: McpServer,
  handlers: DesktopMcpToolHandlers
): void {
  registerTool(server, "desktop_start_session", {
    description: "Start an isolated Linux Xvfb desktop session.",
    schema: startSessionSchema,
    handler: (args) => handlers.startSession(args)
  });
  registerTool(server, "desktop_list_sessions", {
    description: "List active desktop harness sessions in this MCP server process.",
    schema: noArgsSchema,
    handler: (args) => handlers.listSessions(args)
  });
  registerTool(server, "desktop_get_session", {
    description: "Get metadata for an active desktop harness session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.getSession(args)
  });
  registerTool(server, "desktop_launch_app", {
    description: "Launch an allowlisted app command inside a desktop session.",
    schema: launchAppSchema,
    handler: (args) => handlers.launchApp(args)
  });
  registerTool(server, "desktop_screenshot", {
    description: "Capture a PNG screenshot from a desktop session.",
    schema: screenshotSchema,
    handler: (args) => handlers.screenshot(args)
  });
  registerTool(server, "desktop_click", {
    description: "Click at X/Y coordinates inside a desktop session.",
    schema: clickSchema,
    handler: (args) => handlers.click(args)
  });
  registerTool(server, "desktop_double_click", {
    description: "Double-click at X/Y coordinates inside a desktop session.",
    schema: clickSchema,
    handler: (args) => handlers.doubleClick(args)
  });
  registerTool(server, "desktop_type_text", {
    description: "Type text into the focused window in a desktop session.",
    schema: typeTextSchema,
    handler: (args) => handlers.typeText(args)
  });
  registerTool(server, "desktop_hotkey", {
    description: "Press a keyboard shortcut in a desktop session.",
    schema: hotkeySchema,
    handler: (args) => handlers.hotkey(args)
  });
  registerTool(server, "desktop_scroll", {
    description: "Scroll inside a desktop session.",
    schema: scrollSchema,
    handler: (args) => handlers.scroll(args)
  });
  registerTool(server, "desktop_get_windows", {
    description: "List windows inside a desktop session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.getWindows(args)
  });
  registerTool(server, "desktop_focus_window", {
    description: "Focus a window inside a desktop session.",
    schema: focusWindowSchema,
    handler: (args) => handlers.focusWindow(args)
  });
  registerTool(server, "desktop_wait_for_stable_screen", {
    description: "Wait until screenshots stop changing significantly.",
    schema: waitForStableScreenSchema,
    handler: (args) => handlers.waitForStableScreen(args)
  });
  registerTool(server, "desktop_stop_session", {
    description: "Stop a desktop session and clean up child processes.",
    schema: sessionIdSchema,
    handler: (args) => handlers.stopSession(args)
  });
  registerTool(server, "desktop_get_evidence_report", {
    description: "Read report.md for a desktop session if it has been generated.",
    schema: sessionIdSchema,
    handler: (args) => handlers.getEvidenceReport(args)
  });
  registerTool(server, "desktop_list_screenshots", {
    description: "List screenshot artifacts for a desktop session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.listScreenshots(args)
  });
  registerTool(server, "desktop_create_annotation", {
    description: "Create a visual annotation for a session screenshot.",
    schema: createAnnotationSchema,
    handler: (args) => handlers.createAnnotation(args)
  });
  registerTool(server, "desktop_list_annotations", {
    description: "List visual annotations for a desktop session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.listAnnotations(args)
  });
  registerTool(server, "desktop_get_visual_handoff", {
    description: "Read visual-handoff.md for a desktop session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.getVisualHandoff(args)
  });
}

export async function startStdioServer(): Promise<void> {
  const sessionManager = new SessionManager();
  const server = createDesktopHarnessMcpServer({ sessionManager });
  const transport = new StdioServerTransport();

  installShutdownHandlers(server, sessionManager);
  await server.connect(transport);
  console.error("agent-desktop-harness MCP stdio server started.");
}

type ToolRegistration = {
  readonly description: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
  readonly handler: (args: unknown) => Promise<unknown> | unknown;
};

function registerTool(
  server: McpServer,
  name: string,
  registration: ToolRegistration
): void {
  server.registerTool(
    name,
    {
      title: name,
      description: registration.description,
      inputSchema: registration.schema.shape
    },
    async (args) => await toToolResult(() => registration.handler(args))
  );
}

async function toToolResult(
  run: () => Promise<unknown> | unknown
): Promise<CallToolResult> {
  try {
    return jsonToolResult(await run());
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: formatErrorMessage(error)
        }
      ]
    };
  }
}

function jsonToolResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return `Invalid tool input: ${error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; ")}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function installShutdownHandlers(server: McpServer, sessionManager: SessionManager): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    void (async () => {
      console.error(`agent-desktop-harness MCP server received ${signal}; stopping sessions.`);
      const sessions = sessionManager.listSessions();
      await Promise.allSettled(
        sessions
          .filter((session) => session.status !== "stopped")
          .map((session) => sessionManager.stopSession(session.id))
      );
      await server.close().catch(() => undefined);
      process.exit(0);
    })();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
