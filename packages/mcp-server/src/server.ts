import { SessionManager } from "@agent-desktop-harness/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  appAssertTextSchema,
  appClickSchema,
  appCloseSchema,
  appFillSchema,
  appOpenSchema,
  appPressSchema,
  appScreenshotSchema,
  browserAssertTextSchema,
  browserClickSchema,
  browserCloseSchema,
  browserFillSchema,
  browserOpenSchema,
  browserPressSchema,
  browserScreenshotSchema,
  clickSchema,
  createAnnotationSchema,
  driverRouteSchema,
  electronAssertTextSchema,
  electronClickSchema,
  electronCloseSchema,
  electronFillSchema,
  electronOpenSchema,
  electronPressSchema,
  electronScreenshotSchema,
  focusWindowSchema,
  hotkeySchema,
  launchAppSchema,
  noArgsSchema,
  observerListSchema,
  observerStartSchema,
  observerStopSchema,
  screenshotSchema,
  scrollSchema,
  sessionIdSchema,
  startSessionSchema,
  tauriAssertTextSchema,
  tauriClickSchema,
  tauriCloseSchema,
  tauriFillSchema,
  tauriOpenSchema,
  tauriScreenshotSchema,
  typeTextSchema,
  visualAssertAnnotationChangedSchema,
  visualAssertAnnotationSimilarSchema,
  visualAssertChangeContainedSchema,
  visualAssertChangedSchema,
  visualAssertSimilarSchema,
  visualCompareBaselineSchema,
  visualCompareSchema,
  visualListBaselinesSchema,
  visualSaveBaselineSchema,
  waitForStableScreenSchema,
  waitForWindowSchema,
} from "./schemas.js";
import { DesktopMcpToolHandlers } from "./toolHandlers.js";

export interface CreateServerOptions {
  readonly sessionManager?: SessionManager;
  readonly defaultWorkspaceDir?: string;
}

export function createDesktopHarnessMcpServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "agent-desktop-harness",
    version: "0.2.0",
  });
  const sessionManager = options.sessionManager ?? new SessionManager();
  const handlers = new DesktopMcpToolHandlers(sessionManager, options.defaultWorkspaceDir);

  registerDesktopHarnessTools(server, handlers);
  return server;
}

export function registerDesktopHarnessTools(
  server: McpServer,
  handlers: DesktopMcpToolHandlers,
): void {
  registerTool(server, "desktop_start_session", {
    description: "Start an isolated Linux Xvfb desktop session.",
    schema: startSessionSchema,
    handler: (args) => handlers.startSession(args),
  });
  registerTool(server, "desktop_list_sessions", {
    description: "List active desktop harness sessions in this MCP server process.",
    schema: noArgsSchema,
    handler: (args) => handlers.listSessions(args),
  });
  registerTool(server, "desktop_get_session", {
    description: "Get metadata for an active desktop harness session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.getSession(args),
  });
  registerTool(server, "desktop_launch_app", {
    description: "Launch an allowlisted app command inside a desktop session.",
    schema: launchAppSchema,
    handler: (args) => handlers.launchApp(args),
  });
  registerTool(server, "desktop_screenshot", {
    description: "Capture a PNG screenshot from a desktop session.",
    schema: screenshotSchema,
    handler: (args) => handlers.screenshot(args),
  });
  registerTool(server, "desktop_click", {
    description: "Click at X/Y coordinates inside a desktop session.",
    schema: clickSchema,
    handler: (args) => handlers.click(args),
  });
  registerTool(server, "desktop_double_click", {
    description: "Double-click at X/Y coordinates inside a desktop session.",
    schema: clickSchema,
    handler: (args) => handlers.doubleClick(args),
  });
  registerTool(server, "desktop_type_text", {
    description: "Type text into the focused window in a desktop session.",
    schema: typeTextSchema,
    handler: (args) => handlers.typeText(args),
  });
  registerTool(server, "desktop_hotkey", {
    description: "Press a keyboard shortcut in a desktop session.",
    schema: hotkeySchema,
    handler: (args) => handlers.hotkey(args),
  });
  registerTool(server, "desktop_scroll", {
    description: "Scroll inside a desktop session.",
    schema: scrollSchema,
    handler: (args) => handlers.scroll(args),
  });
  registerTool(server, "desktop_get_windows", {
    description: "List windows inside a desktop session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.getWindows(args),
  });
  registerTool(server, "desktop_focus_window", {
    description: "Focus a window inside a desktop session.",
    schema: focusWindowSchema,
    handler: (args) => handlers.focusWindow(args),
  });
  registerTool(server, "desktop_wait_for_stable_screen", {
    description: "Wait until screenshots stop changing significantly.",
    schema: waitForStableScreenSchema,
    handler: (args) => handlers.waitForStableScreen(args),
  });
  registerTool(server, "desktop_wait_for_window", {
    description: "Wait until a matching app window appears in a desktop session.",
    schema: waitForWindowSchema,
    handler: (args) => handlers.waitForWindow(args),
  });
  registerTool(server, "desktop_stop_session", {
    description: "Stop a desktop session and clean up child processes.",
    schema: sessionIdSchema,
    handler: (args) => handlers.stopSession(args),
  });
  registerTool(server, "desktop_get_evidence_report", {
    description: "Read report.md for a desktop session if it has been generated.",
    schema: sessionIdSchema,
    handler: (args) => handlers.getEvidenceReport(args),
  });
  registerTool(server, "desktop_list_screenshots", {
    description: "List screenshot artifacts for a desktop session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.listScreenshots(args),
  });
  registerTool(server, "desktop_create_annotation", {
    description: "Create a visual annotation for a session screenshot.",
    schema: createAnnotationSchema,
    handler: (args) => handlers.createAnnotation(args),
  });
  registerTool(server, "desktop_list_annotations", {
    description: "List visual annotations for a desktop session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.listAnnotations(args),
  });
  registerTool(server, "desktop_get_visual_handoff", {
    description: "Read visual-handoff.md for a desktop session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.getVisualHandoff(args),
  });
  registerTool(server, "browser_open", {
    description: "Open a browser page inside an isolated desktop session using Playwright.",
    schema: browserOpenSchema,
    handler: (args) => handlers.browserOpen(args),
  });
  registerTool(server, "browser_click", {
    description:
      "Click a browser element by selector, test id, role/name, label, placeholder, or text.",
    schema: browserClickSchema,
    handler: (args) => handlers.browserClick(args),
  });
  registerTool(server, "browser_fill", {
    description:
      "Fill a browser element by selector, test id, role/name, label, placeholder, or text.",
    schema: browserFillSchema,
    handler: (args) => handlers.browserFill(args),
  });
  registerTool(server, "browser_press", {
    description: "Press a key on a browser page or focused browser element.",
    schema: browserPressSchema,
    handler: (args) => handlers.browserPress(args),
  });
  registerTool(server, "browser_assert_text", {
    description: "Assert that text is visible on a browser page.",
    schema: browserAssertTextSchema,
    handler: (args) => handlers.browserAssertText(args),
  });
  registerTool(server, "browser_screenshot", {
    description: "Capture a Playwright browser-content screenshot into session evidence.",
    schema: browserScreenshotSchema,
    handler: (args) => handlers.browserScreenshot(args),
  });
  registerTool(server, "browser_close", {
    description: "Close a browser page or all browser pages for a session.",
    schema: browserCloseSchema,
    handler: (args) => handlers.browserClose(args),
  });
  registerTool(server, "tauri_get_status", {
    description: "Experimental: inspect Tauri WebDriver prerequisite availability.",
    schema: noArgsSchema,
    handler: (args) => handlers.tauriGetStatus(args),
  });
  registerTool(server, "tauri_open", {
    description:
      "Experimental: open a Tauri app through tauri-driver when possible, otherwise explicit X11 fallback.",
    schema: tauriOpenSchema,
    handler: (args) => handlers.tauriOpen(args),
  });
  registerTool(server, "tauri_click", {
    description: "Experimental: click a Tauri webview element through WebDriver when available.",
    schema: tauriClickSchema,
    handler: (args) => handlers.tauriClick(args),
  });
  registerTool(server, "tauri_fill", {
    description: "Experimental: fill a Tauri webview element through WebDriver when available.",
    schema: tauriFillSchema,
    handler: (args) => handlers.tauriFill(args),
  });
  registerTool(server, "tauri_assert_text", {
    description:
      "Experimental: assert visible Tauri webview text through WebDriver when available.",
    schema: tauriAssertTextSchema,
    handler: (args) => handlers.tauriAssertText(args),
  });
  registerTool(server, "tauri_screenshot", {
    description:
      "Experimental: capture Tauri WebDriver screenshot, falling back to desktop screenshot evidence.",
    schema: tauriScreenshotSchema,
    handler: (args) => handlers.tauriScreenshot(args),
  });
  registerTool(server, "tauri_close", {
    description: "Experimental: close tracked Tauri app and tauri-driver resources.",
    schema: tauriCloseSchema,
    handler: (args) => handlers.tauriClose(args),
  });
  registerTool(server, "electron_get_status", {
    description: "Experimental: inspect Playwright Electron driver readiness.",
    schema: noArgsSchema,
    handler: (args) => handlers.electronGetStatus(args),
  });
  registerTool(server, "electron_open", {
    description:
      "Experimental: open an Electron app through Playwright Electron when possible, otherwise explicit X11 fallback.",
    schema: electronOpenSchema,
    handler: (args) => handlers.electronOpen(args),
  });
  registerTool(server, "electron_click", {
    description:
      "Experimental: click an Electron renderer element by selector, test id, role/name, label, placeholder, or text.",
    schema: electronClickSchema,
    handler: (args) => handlers.electronClick(args),
  });
  registerTool(server, "electron_fill", {
    description:
      "Experimental: fill an Electron renderer element through Playwright Electron when available.",
    schema: electronFillSchema,
    handler: (args) => handlers.electronFill(args),
  });
  registerTool(server, "electron_press", {
    description: "Experimental: press a key in an Electron renderer window.",
    schema: electronPressSchema,
    handler: (args) => handlers.electronPress(args),
  });
  registerTool(server, "electron_assert_text", {
    description: "Experimental: assert visible Electron renderer text through Playwright Electron.",
    schema: electronAssertTextSchema,
    handler: (args) => handlers.electronAssertText(args),
  });
  registerTool(server, "electron_screenshot", {
    description:
      "Experimental: capture an Electron renderer screenshot, falling back to desktop screenshot evidence.",
    schema: electronScreenshotSchema,
    handler: (args) => handlers.electronScreenshot(args),
  });
  registerTool(server, "electron_close", {
    description: "Experimental: close tracked Electron app resources.",
    schema: electronCloseSchema,
    handler: (args) => handlers.electronClose(args),
  });
  registerTool(server, "driver_get_status", {
    description: "High-level router: inspect browser, Tauri, Electron, and X11 driver readiness.",
    schema: noArgsSchema,
    handler: (args) => handlers.driverGetStatus(args),
  });
  registerTool(server, "observer_get_status", {
    description: "Optional live observer: inspect local x11vnc/noVNC dependency readiness.",
    schema: noArgsSchema,
    handler: (args) => handlers.observerGetStatus(args),
  });
  registerTool(server, "observer_start", {
    description:
      "Optional live observer: start a localhost noVNC view for an isolated Xvfb session.",
    schema: observerStartSchema,
    handler: (args) => handlers.observerStart(args),
  });
  registerTool(server, "observer_list", {
    description: "Optional live observer: list active live observers.",
    schema: observerListSchema,
    handler: (args) => handlers.observerList(args),
  });
  registerTool(server, "observer_stop", {
    description: "Optional live observer: stop an active live observer.",
    schema: observerStopSchema,
    handler: (args) => handlers.observerStop(args),
  });
  registerTool(server, "driver_route", {
    description: "High-level router: choose the best available driver for an app kind.",
    schema: driverRouteSchema,
    handler: (args) => handlers.driverRoute(args),
  });
  registerTool(server, "app_open", {
    description:
      "High-level router: open an app through the selected semantic driver or X11 fallback.",
    schema: appOpenSchema,
    handler: (args) => handlers.appOpen(args),
  });
  registerTool(server, "app_click", {
    description:
      "High-level router: click using a semantic target when available, or X/Y fallback when selected.",
    schema: appClickSchema,
    handler: (args) => handlers.appClick(args),
  });
  registerTool(server, "app_fill", {
    description:
      "High-level router: fill text using a semantic target when available, or focused X11 fallback.",
    schema: appFillSchema,
    handler: (args) => handlers.appFill(args),
  });
  registerTool(server, "app_press", {
    description: "High-level router: press a key through the selected driver.",
    schema: appPressSchema,
    handler: (args) => handlers.appPress(args),
  });
  registerTool(server, "app_assert_text", {
    description:
      "High-level router: assert text with semantic drivers; X11 fallback currently has no OCR.",
    schema: appAssertTextSchema,
    handler: (args) => handlers.appAssertText(args),
  });
  registerTool(server, "app_screenshot", {
    description:
      "High-level router: capture a screenshot through the selected driver or X11 fallback.",
    schema: appScreenshotSchema,
    handler: (args) => handlers.appScreenshot(args),
  });
  registerTool(server, "app_close", {
    description: "High-level router: close one routed app or all routed apps in a session.",
    schema: appCloseSchema,
    handler: (args) => handlers.appClose(args),
  });
  registerTool(server, "visual_compare", {
    description: "Compare two PNG evidence screenshots and optionally create a diff PNG.",
    schema: visualCompareSchema,
    handler: (args) => handlers.visualCompare(args),
  });
  registerTool(server, "visual_assert_changed", {
    description:
      "Assert that two PNG evidence screenshots or regions changed by at least a threshold.",
    schema: visualAssertChangedSchema,
    handler: (args) => handlers.visualAssertChanged(args),
  });
  registerTool(server, "visual_assert_similar", {
    description:
      "Assert that two PNG evidence screenshots or regions remain within a diff threshold.",
    schema: visualAssertSimilarSchema,
    handler: (args) => handlers.visualAssertSimilar(args),
  });
  registerTool(server, "visual_save_baseline", {
    description: "Save a PNG screenshot evidence artifact as a named local visual baseline.",
    schema: visualSaveBaselineSchema,
    handler: (args) => handlers.visualSaveBaseline(args),
  });
  registerTool(server, "visual_list_baselines", {
    description: "List named local visual baselines for a session workspace.",
    schema: visualListBaselinesSchema,
    handler: (args) => handlers.visualListBaselines(args),
  });
  registerTool(server, "visual_compare_baseline", {
    description: "Compare a PNG screenshot evidence artifact to a named visual baseline.",
    schema: visualCompareBaselineSchema,
    handler: (args) => handlers.visualCompareBaseline(args),
  });
  registerTool(server, "visual_assert_annotation_changed", {
    description: "Use a rectangle annotation as the region for a changed assertion.",
    schema: visualAssertAnnotationChangedSchema,
    handler: (args) => handlers.visualAssertAnnotationChanged(args),
  });
  registerTool(server, "visual_assert_annotation_similar", {
    description: "Use a rectangle annotation as the region for a similar assertion.",
    schema: visualAssertAnnotationSimilarSchema,
    handler: (args) => handlers.visualAssertAnnotationSimilar(args),
  });
  registerTool(server, "visual_assert_change_contained", {
    description: "Assert that pixel changes stay inside allowed regions.",
    schema: visualAssertChangeContainedSchema,
    handler: (args) => handlers.visualAssertChangeContained(args),
  });
  registerTool(server, "visual_list_assertions", {
    description: "List visual comparison/assertion results recorded for a session.",
    schema: sessionIdSchema,
    handler: (args) => handlers.visualListAssertions(args),
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

function registerTool(server: McpServer, name: string, registration: ToolRegistration): void {
  server.registerTool(
    name,
    {
      title: name,
      description: registration.description,
      inputSchema: registration.schema.shape,
    },
    async (args) => await toToolResult(() => registration.handler(args)),
  );
}

async function toToolResult(run: () => Promise<unknown> | unknown): Promise<CallToolResult> {
  try {
    return jsonToolResult(await run());
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: formatErrorMessage(error),
        },
      ],
    };
  }
}

function jsonToolResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
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
          .map((session) => sessionManager.stopSession(session.id)),
      );
      await server.close().catch(() => undefined);
      process.exit(0);
    })();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
