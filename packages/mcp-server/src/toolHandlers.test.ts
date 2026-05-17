import test from "node:test";
import assert from "node:assert/strict";
import type {
  CreateAnnotationInput,
  DesktopSession,
  InputActionResult,
  LaunchResult,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotResult,
  SessionConfig,
  SessionId,
  VisualHandoff,
  WaitForStableScreenResult,
  WindowActionResult,
  WindowInfo
} from "@agent-desktop-harness/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DesktopMcpToolHandlers } from "./toolHandlers.js";
import type { SessionManagerLike } from "./toolHandlers.js";
import { formatErrorMessage, registerDesktopHarnessTools } from "./server.js";

test("DesktopMcpToolHandlers redacts secret typeText result details", async () => {
  const manager = new MockSessionManager();
  const handlers = new DesktopMcpToolHandlers(manager);

  const result = (await handlers.typeText({
    sessionId: "session-1",
    text: "secret-value",
    secret: true
  })) as InputActionResult;

  assert.deepEqual(result.details, {
    redacted: true,
    textLength: 12
  });
});

test("DesktopMcpToolHandlers redacts secret text from typeText errors", async () => {
  const manager = new MockSessionManager();
  manager.typeTextError = new Error("backend saw secret-value");
  const handlers = new DesktopMcpToolHandlers(manager);

  await assert.rejects(
    async () =>
      await handlers.typeText({
        sessionId: "session-1",
        text: "secret-value",
        secret: true
      }),
    /backend saw \[redacted\]/
  );
});

test("DesktopMcpToolHandlers validates sessions before launch", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  await assert.rejects(
    async () =>
      await handlers.launchApp({
        sessionId: "missing",
        command: "xterm"
      }),
    /Desktop session not found/
  );
});

test("DesktopMcpToolHandlers exposes screenshot annotations and visual handoff", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  const screenshots = (await handlers.listScreenshots({
    sessionId: "session-1"
  })) as { screenshots: ScreenshotArtifact[] };
  assert.equal(screenshots.screenshots[0]?.fileName, "0001-demo.png");

  const annotation = (await handlers.createAnnotation({
    sessionId: "session-1",
    screenshotFileName: "0001-demo.png",
    type: "rectangle",
    x: 1,
    y: 2,
    width: 3,
    height: 4,
    note: "Button overlaps this text."
  })) as ScreenshotAnnotation;
  assert.equal(annotation.id, "ann_001");

  const handoff = (await handlers.getVisualHandoff({
    sessionId: "session-1"
  })) as VisualHandoff;
  assert.match(handoff.text, /Visual Handoff/);
});

test("DesktopMcpToolHandlers rejects invalid annotation screenshot paths", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  await assert.rejects(
    async () =>
      await handlers.createAnnotation({
        sessionId: "session-1",
        screenshotFileName: "../0001-demo.png",
        type: "rectangle",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        note: "bad path"
      }),
    /file name/
  );
});

test("registerDesktopHarnessTools registers all expected tool names", () => {
  const server = new McpServer({
    name: "test",
    version: "0.0.0"
  });
  registerDesktopHarnessTools(server, new DesktopMcpToolHandlers(new MockSessionManager()));

  const registeredTools = (server as unknown as {
    _registeredTools: Record<string, unknown>;
  })._registeredTools;

  assert.deepEqual(Object.keys(registeredTools).sort(), [
    "desktop_click",
    "desktop_create_annotation",
    "desktop_double_click",
    "desktop_focus_window",
    "desktop_get_evidence_report",
    "desktop_get_session",
    "desktop_get_visual_handoff",
    "desktop_get_windows",
    "desktop_hotkey",
    "desktop_launch_app",
    "desktop_list_annotations",
    "desktop_list_screenshots",
    "desktop_list_sessions",
    "desktop_screenshot",
    "desktop_scroll",
    "desktop_start_session",
    "desktop_stop_session",
    "desktop_type_text",
    "desktop_wait_for_stable_screen"
  ]);
});

test("formatErrorMessage does not include stack traces for normal errors", () => {
  assert.equal(formatErrorMessage(new Error("plain failure")), "plain failure");
});

class MockSessionManager implements SessionManagerLike {
  typeTextError: Error | undefined;
  private readonly session = makeSession();

  async createSession(config: SessionConfig): Promise<DesktopSession> {
    return {
      ...this.session,
      config,
      workspacePath: config.workspacePath
    };
  }

  listSessions(): DesktopSession[] {
    return [this.session];
  }

  getSession(sessionId: SessionId): DesktopSession | undefined {
    return sessionId === this.session.id ? this.session : undefined;
  }

  async launchApp(): Promise<LaunchResult> {
    return {
      sessionId: this.session.id,
      processId: 123,
      command: "xterm",
      args: [],
      cwd: this.session.workspacePath,
      display: this.session.display,
      startedAt: new Date("2026-01-01T00:00:00.000Z")
    };
  }

  async captureScreenshot(): Promise<ScreenshotResult> {
    return {
      artifactId: "screenshot-0001",
      sessionId: this.session.id,
      path: "/tmp/screenshot.png",
      width: 1440,
      height: 900,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      display: this.session.display,
      sequence: 1
    };
  }

  async click(): Promise<InputActionResult> {
    return this.inputResult("input.click");
  }

  async doubleClick(): Promise<InputActionResult> {
    return this.inputResult("input.double_click");
  }

  async typeText(): Promise<InputActionResult> {
    if (this.typeTextError) {
      throw this.typeTextError;
    }
    return this.inputResult("input.type_text", {
      text: "secret-value"
    });
  }

  async hotkey(): Promise<InputActionResult> {
    return this.inputResult("input.hotkey");
  }

  async scroll(): Promise<InputActionResult> {
    return this.inputResult("input.scroll");
  }

  async getWindows(): Promise<WindowInfo[]> {
    return [
      {
        id: "0x01",
        title: "Test Window",
        pid: 123
      }
    ];
  }

  async focusWindow(): Promise<WindowActionResult> {
    return {
      sessionId: this.session.id,
      success: true,
      window: {
        id: "0x01",
        title: "Test Window"
      },
      createdAt: "2026-01-01T00:00:00.000Z"
    };
  }

  async waitForStableScreen(): Promise<WaitForStableScreenResult> {
    return {
      sessionId: this.session.id,
      stable: true,
      checks: 2,
      elapsedMs: 1000
    };
  }

  async listScreenshots(): Promise<ScreenshotArtifact[]> {
    return [
      {
        sessionId: this.session.id,
        fileName: "0001-demo.png",
        path: `${this.session.evidencePath}/screenshots/0001-demo.png`,
        sequence: 1,
        label: "demo",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];
  }

  async createAnnotation(
    sessionId: SessionId,
    input: CreateAnnotationInput
  ): Promise<ScreenshotAnnotation> {
    return {
      id: "ann_001",
      sessionId,
      screenshotPath: `${this.session.evidencePath}/screenshots/${input.screenshotFileName}`,
      screenshotFileName: input.screenshotFileName,
      type: input.type,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      x2: input.x2,
      y2: input.y2,
      note: input.note,
      color: input.color,
      cropPath: `${this.session.evidencePath}/annotations/ann_001-crop.png`,
      createdAt: "2026-01-01T00:00:00.000Z"
    };
  }

  async listAnnotations(): Promise<ScreenshotAnnotation[]> {
    return [
      {
        id: "ann_001",
        sessionId: this.session.id,
        screenshotPath: `${this.session.evidencePath}/screenshots/0001-demo.png`,
        screenshotFileName: "0001-demo.png",
        type: "rectangle",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        note: "Button overlaps this text.",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];
  }

  async getVisualHandoff(): Promise<VisualHandoff> {
    return {
      sessionId: this.session.id,
      path: `${this.session.evidencePath}/visual-handoff.md`,
      text: "# Visual Handoff\n\nButton overlaps this text.\n",
      annotations: await this.listAnnotations()
    };
  }

  async stopSession(): Promise<void> {
    return;
  }

  private inputResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {}
  ): InputActionResult {
    return {
      sessionId: this.session.id,
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: true,
      details
    };
  }
}

function makeSession(): DesktopSession {
  return {
    id: "session-1",
    config: {
      workspacePath: "/tmp/agent-desktop-harness-test"
    },
    driverKind: "unknown",
    status: "running",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    workspacePath: "/tmp/agent-desktop-harness-test",
    evidencePath: "/tmp/agent-desktop-harness-test/.desktop-harness/sessions/session-1",
    display: ":90",
    displayNumber: 90,
    width: 1440,
    height: 900,
    depth: 24,
    processIds: {
      apps: []
    },
    warnings: []
  };
}
