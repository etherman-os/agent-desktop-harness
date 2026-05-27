import assert from "node:assert/strict";
import test from "node:test";
import type {
  AnnotationRegionResult,
  AppActionResult,
  AppRef,
  BrowserActionResult,
  BrowserPageRef,
  CreateAnnotationInput,
  DesktopSession,
  DriverRouteDecision,
  DriverRouteRequest,
  DriverRouterStatus,
  ElectronActionResult,
  ElectronAppRef,
  ElectronDriverStatus,
  InputActionResult,
  LaunchResult,
  LiveObserverRef,
  LiveObserverStatus,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotResult,
  SessionConfig,
  SessionId,
  TauriActionResult,
  TauriAppRef,
  TauriDriverStatus,
  VisualBaselineRef,
  VisualChangeContainmentResult,
  VisualCompareResult,
  VisualHandoff,
  WaitForStableScreenResult,
  WindowActionResult,
  WindowInfo,
} from "@agent-desktop-harness/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatErrorMessage, registerDesktopHarnessTools } from "./server.js";
import type { SessionManagerLike } from "./toolHandlers.js";
import { DesktopMcpToolHandlers } from "./toolHandlers.js";

test("DesktopMcpToolHandlers redacts secret typeText result details", async () => {
  const manager = new MockSessionManager();
  const handlers = new DesktopMcpToolHandlers(manager);

  const result = (await handlers.typeText({
    sessionId: "session-1",
    text: "secret-value",
    secret: true,
  })) as InputActionResult;

  assert.deepEqual(result.details, {
    redacted: true,
    textLength: 12,
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
        secret: true,
      }),
    /backend saw \[redacted\]/,
  );
});

test("DesktopMcpToolHandlers validates sessions before launch", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  await assert.rejects(
    async () =>
      await handlers.launchApp({
        sessionId: "missing",
        command: "xterm",
      }),
    /Desktop session not found/,
  );
});

test("DesktopMcpToolHandlers exposes screenshot annotations and visual handoff", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  const screenshots = (await handlers.listScreenshots({
    sessionId: "session-1",
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
    note: "Button overlaps this text.",
  })) as ScreenshotAnnotation;
  assert.equal(annotation.id, "ann_001");

  const handoff = (await handlers.getVisualHandoff({
    sessionId: "session-1",
  })) as VisualHandoff;
  assert.match(handoff.text, /Visual Handoff/);
});

test("DesktopMcpToolHandlers exposes waitForWindow", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  const window = (await handlers.waitForWindow({
    sessionId: "session-1",
    titleIncludes: "Test",
    excludeDevtools: true,
  })) as WindowInfo;

  assert.equal(window.id, "0x01");
});

test("DesktopMcpToolHandlers exposes browser semantic actions", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  const page = (await handlers.browserOpen({
    sessionId: "session-1",
    url: "http://127.0.0.1:5179",
  })) as BrowserPageRef;
  assert.equal(page.pageId, "page-1");

  const fill = (await handlers.browserFill({
    sessionId: "session-1",
    placeholder: "Type a message",
    value: "secret-value",
    secret: true,
  })) as BrowserActionResult;
  assert.equal(fill.details?.redacted, true);
  assert.equal(JSON.stringify(fill).includes("secret-value"), false);

  const click = (await handlers.browserClick({
    sessionId: "session-1",
    role: "button",
    name: "Save message",
  })) as BrowserActionResult;
  assert.equal(click.actionType, "browser.click");

  const screenshot = (await handlers.browserScreenshot({
    sessionId: "session-1",
    label: "semantic",
  })) as ScreenshotResult;
  assert.equal(screenshot.path, "/tmp/browser-screenshot.png");
});

test("DesktopMcpToolHandlers validates browser click targets", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  await assert.rejects(
    async () =>
      await handlers.browserClick({
        sessionId: "session-1",
      }),
    /browser click requires/,
  );
});

test("DesktopMcpToolHandlers exposes experimental Tauri fallback guidance", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  const status = (await handlers.tauriGetStatus({})) as {
    experimental: boolean;
    status: TauriDriverStatus;
  };
  assert.equal(status.experimental, true);
  assert.equal(status.status.available, false);

  const opened = (await handlers.tauriOpen({
    sessionId: "session-1",
    command: "pnpm",
    args: ["tauri", "dev"],
  })) as { mode: string; app: TauriAppRef };
  assert.equal(opened.mode, "x11-fallback");
  assert.equal(opened.app.appId, "tauri-app-1");

  const click = (await handlers.tauriClick({
    sessionId: "session-1",
    role: "button",
    name: "Save message",
  })) as { result: TauriActionResult };
  assert.equal(click.result.success, false);
  assert.equal(click.result.mode, "x11-fallback");

  const fill = (await handlers.tauriFill({
    sessionId: "session-1",
    placeholder: "Type a message",
    value: "secret-value",
    secret: true,
  })) as { result: TauriActionResult };
  assert.equal(fill.result.details?.redacted, true);
  assert.equal(JSON.stringify(fill).includes("secret-value"), false);

  const screenshot = (await handlers.tauriScreenshot({
    sessionId: "session-1",
    label: "tauri-fallback",
  })) as { screenshot: ScreenshotResult };
  assert.equal(screenshot.screenshot.path, "/tmp/tauri-screenshot.png");
});

test("DesktopMcpToolHandlers validates Tauri click targets", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  await assert.rejects(
    async () =>
      await handlers.tauriClick({
        sessionId: "session-1",
      }),
    /tauri click requires/,
  );
});

test("DesktopMcpToolHandlers exposes experimental Electron semantic actions", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  const status = (await handlers.electronGetStatus({})) as {
    experimental: boolean;
    status: ElectronDriverStatus;
  };
  assert.equal(status.experimental, true);
  assert.equal(status.status.available, true);

  const opened = (await handlers.electronOpen({
    sessionId: "session-1",
    command: "electron",
    args: ["."],
  })) as { mode: string; app: ElectronAppRef };
  assert.equal(opened.mode, "playwright-electron");
  assert.equal(opened.app.appId, "electron-app-1");

  const fill = (await handlers.electronFill({
    sessionId: "session-1",
    placeholder: "Type a message",
    value: "secret-value",
    secret: true,
  })) as { result: ElectronActionResult };
  assert.equal(fill.result.details?.redacted, true);
  assert.equal(JSON.stringify(fill).includes("secret-value"), false);

  const click = (await handlers.electronClick({
    sessionId: "session-1",
    role: "button",
    name: "Save message",
  })) as { result: ElectronActionResult };
  assert.equal(click.result.actionType, "electron.click");

  const press = (await handlers.electronPress({
    sessionId: "session-1",
    selector: "#message-input",
    key: "Enter",
  })) as { result: ElectronActionResult };
  assert.equal(press.result.actionType, "electron.press");

  const screenshot = (await handlers.electronScreenshot({
    sessionId: "session-1",
    label: "electron-semantic",
  })) as { screenshot: ScreenshotResult };
  assert.equal(screenshot.screenshot.path, "/tmp/electron-screenshot.png");
});

test("DesktopMcpToolHandlers validates Electron click targets", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  await assert.rejects(
    async () =>
      await handlers.electronClick({
        sessionId: "session-1",
      }),
    /electron click requires/,
  );
});

test("DesktopMcpToolHandlers exposes high-level driver router actions", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  const status = (await handlers.driverGetStatus({})) as DriverRouterStatus;
  assert.equal(status.browser.available, true);

  const decision = (await handlers.driverRoute({
    sessionId: "session-1",
    appKind: "browser",
    requireSemantic: true,
  })) as DriverRouteDecision;
  assert.equal(decision.selectedDriver, "browser-playwright");

  const app = (await handlers.appOpen({
    sessionId: "session-1",
    appKind: "browser",
    url: "http://127.0.0.1:5179",
    requireSemantic: true,
  })) as AppRef;
  assert.equal(app.appId, "app-1");
  assert.equal(app.semantic, true);

  const fill = (await handlers.appFill({
    sessionId: "session-1",
    placeholder: "Type a message",
    value: "secret-value",
    secret: true,
  })) as AppActionResult;
  assert.equal(fill.details?.redacted, true);
  assert.equal(JSON.stringify(fill).includes("secret-value"), false);

  const click = (await handlers.appClick({
    sessionId: "session-1",
    role: "button",
    name: "Save message",
  })) as AppActionResult;
  assert.equal(click.selectedDriver, "browser-playwright");

  const screenshot = (await handlers.appScreenshot({
    sessionId: "session-1",
    label: "router",
  })) as ScreenshotResult;
  assert.equal(screenshot.path, "/tmp/app-screenshot.png");
});

test("DesktopMcpToolHandlers exposes optional live observer tools", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  const status = (await handlers.observerGetStatus({})) as {
    optional: boolean;
    status: LiveObserverStatus;
  };
  assert.equal(status.optional, true);
  assert.equal(status.status.available, true);

  const observer = (await handlers.observerStart({
    sessionId: "session-1",
    host: "127.0.0.1",
    vncPort: 5901,
    webPort: 6081,
    password: "secret-value",
  })) as LiveObserverRef;
  assert.equal(observer.observerId, "observer-1");
  assert.equal(JSON.stringify(observer).includes("secret-value"), false);

  const listed = (await handlers.observerList({
    sessionId: "session-1",
  })) as { observers: LiveObserverRef[] };
  assert.equal(listed.observers.length, 1);

  const stopped = (await handlers.observerStop({
    sessionId: "session-1",
    observerId: "observer-1",
  })) as { stopped: boolean };
  assert.equal(stopped.stopped, true);
});

test("DesktopMcpToolHandlers validates high-level app click targets", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  await assert.rejects(
    async () =>
      await handlers.appClick({
        sessionId: "session-1",
      }),
    /app click requires/,
  );
});

test("DesktopMcpToolHandlers exposes visual QA comparisons and assertions", async () => {
  const handlers = new DesktopMcpToolHandlers(new MockSessionManager());

  const compare = (await handlers.visualCompare({
    sessionId: "session-1",
    beforePath: "screenshots/0001-before.png",
    afterPath: "screenshots/0002-after.png",
    label: "router",
    createDiffImage: true,
  })) as VisualCompareResult;
  assert.equal(compare.kind, "compare");
  assert.match(compare.diffPath ?? "", /visual-diffs/);

  const changed = (await handlers.visualAssertChanged({
    sessionId: "session-1",
    beforePath: "screenshots/0001-before.png",
    afterPath: "screenshots/0002-after.png",
    minDiffPixelRatio: 0.01,
  })) as VisualCompareResult;
  assert.equal(changed.passed, true);

  const similar = (await handlers.visualAssertSimilar({
    sessionId: "session-1",
    beforePath: "screenshots/0001-before.png",
    afterPath: "screenshots/0002-after.png",
    maxDiffPixelRatio: 0.1,
  })) as VisualCompareResult;
  assert.equal(similar.passed, true);

  const baseline = (await handlers.visualSaveBaseline({
    sessionId: "session-1",
    screenshotPath: "screenshots/0001-before.png",
    name: "sample-vite-clean",
    suite: "smoke",
    overwrite: true,
  })) as VisualBaselineRef;
  assert.equal(baseline.name, "sample-vite-clean");

  const baselines = (await handlers.visualListBaselines({
    sessionId: "session-1",
    suite: "smoke",
  })) as { baselines: VisualBaselineRef[] };
  assert.equal(baselines.baselines[0]?.suite, "smoke");

  const baselineCompare = (await handlers.visualCompareBaseline({
    sessionId: "session-1",
    screenshotPath: "screenshots/0002-after.png",
    baselineName: "sample-vite-clean",
    suite: "smoke",
    createDiffImage: true,
  })) as VisualCompareResult;
  assert.equal(baselineCompare.kind, "compare-baseline");
  assert.equal(baselineCompare.baselineName, "sample-vite-clean");

  const annotationChanged = (await handlers.visualAssertAnnotationChanged({
    sessionId: "session-1",
    annotationId: "ann_001",
    afterPath: "screenshots/0002-after.png",
    minDiffPixelRatio: 0.01,
  })) as VisualCompareResult;
  assert.equal(annotationChanged.kind, "assert-annotation-changed");
  assert.equal(annotationChanged.annotationId, "ann_001");

  const annotationSimilar = (await handlers.visualAssertAnnotationSimilar({
    sessionId: "session-1",
    annotationId: "ann_001",
    afterPath: "screenshots/0002-after.png",
    maxDiffPixelRatio: 0.1,
  })) as VisualCompareResult;
  assert.equal(annotationSimilar.kind, "assert-annotation-similar");

  const contained = (await handlers.visualAssertChangeContained({
    sessionId: "session-1",
    beforePath: "screenshots/0001-before.png",
    afterPath: "screenshots/0002-after.png",
    allowedRegions: [
      {
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      },
    ],
    maxOutsideDiffPixelRatio: 0.01,
  })) as VisualChangeContainmentResult;
  assert.equal(contained.kind, "assert-change-contained");
  assert.equal(contained.containmentPassed, true);
  assert.equal(contained.outsideDiffPixelRatio, 0);

  const assertions = (await handlers.visualListAssertions({
    sessionId: "session-1",
  })) as { assertions: VisualCompareResult[] };
  assert.equal(assertions.assertions[0]?.kind, "assert-changed");
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
        note: "bad path",
      }),
    /file name/,
  );
});

test("registerDesktopHarnessTools registers all expected tool names", () => {
  const server = new McpServer({
    name: "test",
    version: "0.2.0",
  });
  registerDesktopHarnessTools(server, new DesktopMcpToolHandlers(new MockSessionManager()));

  const registeredTools = (
    server as unknown as {
      _registeredTools: Record<string, unknown>;
    }
  )._registeredTools;

  assert.deepEqual(Object.keys(registeredTools).sort(), [
    "app_assert_text",
    "app_click",
    "app_close",
    "app_fill",
    "app_open",
    "app_press",
    "app_screenshot",
    "browser_assert_text",
    "browser_click",
    "browser_close",
    "browser_fill",
    "browser_open",
    "browser_press",
    "browser_screenshot",
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
    "desktop_wait_for_stable_screen",
    "desktop_wait_for_window",
    "driver_get_status",
    "driver_route",
    "electron_assert_text",
    "electron_click",
    "electron_close",
    "electron_fill",
    "electron_get_status",
    "electron_open",
    "electron_press",
    "electron_screenshot",
    "observer_get_status",
    "observer_list",
    "observer_start",
    "observer_stop",
    "tauri_assert_text",
    "tauri_click",
    "tauri_close",
    "tauri_fill",
    "tauri_get_status",
    "tauri_open",
    "tauri_screenshot",
    "visual_assert_annotation_changed",
    "visual_assert_annotation_similar",
    "visual_assert_change_contained",
    "visual_assert_changed",
    "visual_assert_similar",
    "visual_compare",
    "visual_compare_baseline",
    "visual_list_assertions",
    "visual_list_baselines",
    "visual_save_baseline",
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
      workspacePath: config.workspacePath,
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
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
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
      sequence: 1,
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
      text: "secret-value",
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
        pid: 123,
      },
    ];
  }

  async focusWindow(): Promise<WindowActionResult> {
    return {
      sessionId: this.session.id,
      success: true,
      window: {
        id: "0x01",
        title: "Test Window",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  async waitForStableScreen(): Promise<WaitForStableScreenResult> {
    return {
      sessionId: this.session.id,
      stable: true,
      checks: 2,
      elapsedMs: 1000,
      mode: "hash",
      discardedScreenshotCount: 0,
    };
  }

  async waitForWindow(): Promise<WindowInfo> {
    return {
      id: "0x01",
      title: "Test Window",
      pid: 123,
    };
  }

  async openBrowser(): Promise<BrowserPageRef> {
    return {
      sessionId: this.session.id,
      pageId: "page-1",
      url: "http://127.0.0.1:5179",
      title: "Agent Desktop Harness Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  async browserClick(): Promise<BrowserActionResult> {
    return this.browserResult("browser.click");
  }

  async browserFill(): Promise<BrowserActionResult> {
    return this.browserResult("browser.fill", {
      redacted: true,
      valueLength: 12,
    });
  }

  async browserPress(): Promise<BrowserActionResult> {
    return this.browserResult("browser.press");
  }

  async browserAssertText(): Promise<BrowserActionResult> {
    return this.browserResult("browser.assert_text");
  }

  async browserScreenshot(): Promise<ScreenshotResult> {
    return {
      artifactId: "screenshot-0002",
      sessionId: this.session.id,
      path: "/tmp/browser-screenshot.png",
      width: 1440,
      height: 900,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      display: this.session.display,
      sequence: 2,
      label: "semantic",
    };
  }

  async closeBrowser(): Promise<void> {
    return;
  }

  async getTauriDriverStatus(): Promise<TauriDriverStatus> {
    return {
      available: false,
      warnings: [],
      errors: ["tauri-driver is missing."],
    };
  }

  async openTauriApp(): Promise<TauriAppRef> {
    return {
      sessionId: this.session.id,
      appId: "tauri-app-1",
      processId: 456,
      createdAt: "2026-01-01T00:00:00.000Z",
      mode: "x11-fallback",
      warnings: ["Tauri WebDriver semantic mode is unavailable; use desktop_* X11 fallback tools."],
    };
  }

  async tauriClick(): Promise<TauriActionResult> {
    return this.tauriResult("tauri.click");
  }

  async tauriFill(): Promise<TauriActionResult> {
    return this.tauriResult("tauri.fill", {
      redacted: true,
      valueLength: 12,
    });
  }

  async tauriAssertText(): Promise<TauriActionResult> {
    return this.tauriResult("tauri.assert_text");
  }

  async tauriScreenshot(): Promise<ScreenshotResult> {
    return {
      artifactId: "screenshot-0003",
      sessionId: this.session.id,
      path: "/tmp/tauri-screenshot.png",
      width: 1440,
      height: 900,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      display: this.session.display,
      sequence: 3,
      label: "tauri-fallback",
    };
  }

  async closeTauriApp(): Promise<void> {
    return;
  }

  async getElectronDriverStatus(): Promise<ElectronDriverStatus> {
    return {
      available: true,
      playwrightAvailable: true,
      electronBinaryPath: "/tmp/electron",
      warnings: [],
      errors: [],
    };
  }

  async openElectronApp(): Promise<ElectronAppRef> {
    return {
      sessionId: this.session.id,
      appId: "electron-app-1",
      processId: 789,
      createdAt: "2026-01-01T00:00:00.000Z",
      mode: "playwright-electron",
      windowTitle: "Agent Desktop Harness Electron Demo",
      warnings: [],
    };
  }

  async electronClick(): Promise<ElectronActionResult> {
    return this.electronResult("electron.click");
  }

  async electronFill(): Promise<ElectronActionResult> {
    return this.electronResult("electron.fill", {
      redacted: true,
      valueLength: 12,
    });
  }

  async electronPress(): Promise<ElectronActionResult> {
    return this.electronResult("electron.press");
  }

  async electronAssertText(): Promise<ElectronActionResult> {
    return this.electronResult("electron.assert_text");
  }

  async electronScreenshot(): Promise<ScreenshotResult> {
    return {
      artifactId: "screenshot-0004",
      sessionId: this.session.id,
      path: "/tmp/electron-screenshot.png",
      width: 1440,
      height: 900,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      display: this.session.display,
      sequence: 4,
      label: "electron-semantic",
    };
  }

  async closeElectronApp(): Promise<void> {
    return;
  }

  async getLiveObserverStatus(): Promise<LiveObserverStatus> {
    return {
      available: true,
      x11vncPath: "/usr/bin/x11vnc",
      websockifyPath: "/usr/bin/websockify",
      novncProxyPath: "/usr/bin/novnc_proxy",
      novncPath: "/usr/bin/novnc_proxy",
      noVncWebRootPath: "/usr/share/novnc",
      warnings: [],
      errors: [],
      installHints: ["sudo apt install -y x11vnc novnc websockify"],
    };
  }

  async startLiveObserver(): Promise<LiveObserverRef> {
    return this.liveObserver();
  }

  async stopLiveObserver(): Promise<{
    readonly sessionId: SessionId;
    readonly observerId: string;
    readonly stopped: boolean;
  }> {
    return {
      sessionId: this.session.id,
      observerId: "observer-1",
      stopped: true,
    };
  }

  listLiveObservers(): LiveObserverRef[] {
    return [this.liveObserver()];
  }

  async getDriverRouterStatus(): Promise<DriverRouterStatus> {
    return {
      browser: {
        available: true,
        driver: "browser-playwright",
        warnings: [],
        errors: [],
      },
      tauri: {
        available: false,
        driver: "tauri-webdriver",
        experimental: true,
        warnings: [],
        errors: ["tauri-driver is missing."],
      },
      electron: {
        available: true,
        driver: "electron-playwright",
        experimental: true,
        warnings: [],
        errors: [],
      },
      x11Fallback: {
        available: true,
        driver: "x11-fallback",
        warnings: [],
        errors: [],
      },
    };
  }

  async routeDriver(
    _sessionId: SessionId,
    request: DriverRouteRequest,
  ): Promise<DriverRouteDecision> {
    return {
      appKind: request.appKind,
      selectedDriver: request.appKind === "browser" ? "browser-playwright" : "x11-fallback",
      selectionMode: request.preferredDriver ? "explicit" : "auto",
      semantic: request.appKind === "browser",
      fallbackUsed: request.appKind !== "browser",
      fallbackReason: request.appKind === "browser" ? undefined : "semantic driver unavailable",
      warnings: [],
      errors: [],
    };
  }

  async openApp(): Promise<AppRef> {
    return {
      sessionId: this.session.id,
      appId: "app-1",
      appKind: "browser",
      selectedDriver: "browser-playwright",
      semantic: true,
      fallbackUsed: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      warnings: [],
    };
  }

  async appClick(): Promise<AppActionResult> {
    return this.appResult("app.click");
  }

  async appFill(): Promise<AppActionResult> {
    return this.appResult("app.fill", {
      redacted: true,
      valueLength: 12,
    });
  }

  async appPress(): Promise<AppActionResult> {
    return this.appResult("app.press");
  }

  async appAssertText(): Promise<AppActionResult> {
    return this.appResult("app.assert_text");
  }

  async appScreenshot(): Promise<ScreenshotResult> {
    return {
      artifactId: "screenshot-0005",
      sessionId: this.session.id,
      path: "/tmp/app-screenshot.png",
      width: 1440,
      height: 900,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      display: this.session.display,
      sequence: 5,
      label: "router",
    };
  }

  async closeApp(): Promise<void> {
    return;
  }

  async visualCompare(): Promise<VisualCompareResult> {
    return this.visualResult("compare", undefined);
  }

  async visualAssertChanged(): Promise<VisualCompareResult> {
    return this.visualResult("assert-changed", true);
  }

  async visualAssertSimilar(): Promise<VisualCompareResult> {
    return this.visualResult("assert-similar", true);
  }

  async saveVisualBaseline(): Promise<VisualBaselineRef> {
    return this.visualBaseline();
  }

  async listVisualBaselines(): Promise<VisualBaselineRef[]> {
    return [this.visualBaseline()];
  }

  async compareVisualBaseline(): Promise<VisualCompareResult> {
    return {
      ...this.visualResult("compare-baseline", true),
      baselineName: "sample-vite-clean",
      baselineSuite: "smoke",
    };
  }

  async getAnnotationRegion(): Promise<AnnotationRegionResult> {
    return {
      annotationId: "ann_001",
      region: {
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      },
      screenshotPath: `${this.session.evidencePath}/screenshots/0001-demo.png`,
      note: "Button overlaps this text.",
    };
  }

  async visualAssertAnnotationChanged(): Promise<VisualCompareResult> {
    return {
      ...this.visualResult("assert-annotation-changed", true),
      annotationId: "ann_001",
      annotationNote: "Button overlaps this text.",
    };
  }

  async visualAssertAnnotationSimilar(): Promise<VisualCompareResult> {
    return {
      ...this.visualResult("assert-annotation-similar", true),
      annotationId: "ann_001",
      annotationNote: "Button overlaps this text.",
    };
  }

  async visualAssertChangeContained(): Promise<VisualChangeContainmentResult> {
    return {
      ...this.visualResult("assert-change-contained", true),
      allowedRegions: [
        {
          x: 1,
          y: 2,
          width: 3,
          height: 4,
        },
      ],
      insideComparedPixels: 12,
      insideDiffPixels: 4,
      insideDiffPixelRatio: 0.3333333333333333,
      outsideComparedPixels: 88,
      outsideDiffPixels: 0,
      outsideDiffPixelRatio: 0,
      containmentPassed: true,
    };
  }

  async listVisualAssertions(): Promise<VisualCompareResult[]> {
    return [this.visualResult("assert-changed", true)];
  }

  async listScreenshots(): Promise<ScreenshotArtifact[]> {
    return [
      {
        sessionId: this.session.id,
        fileName: "0001-demo.png",
        path: `${this.session.evidencePath}/screenshots/0001-demo.png`,
        sequence: 1,
        label: "demo",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
  }

  async createAnnotation(
    sessionId: SessionId,
    input: CreateAnnotationInput,
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
      createdAt: "2026-01-01T00:00:00.000Z",
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
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
  }

  async getVisualHandoff(): Promise<VisualHandoff> {
    return {
      sessionId: this.session.id,
      path: `${this.session.evidencePath}/visual-handoff.md`,
      text: "# Visual Handoff\n\nButton overlaps this text.\n",
      annotations: await this.listAnnotations(),
    };
  }

  async stopSession(): Promise<void> {
    return;
  }

  private inputResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {},
  ): InputActionResult {
    return {
      sessionId: this.session.id,
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: true,
      details,
    };
  }

  private browserResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {},
  ): BrowserActionResult {
    return {
      sessionId: this.session.id,
      pageId: "page-1",
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: true,
      details,
    };
  }

  private tauriResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {},
  ): TauriActionResult {
    return {
      sessionId: this.session.id,
      appId: "tauri-app-1",
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: false,
      mode: "x11-fallback",
      details: {
        unavailable: true,
        ...details,
      },
      warnings: ["Tauri WebDriver semantic mode is unavailable; use desktop_* X11 fallback tools."],
    };
  }

  private electronResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {},
  ): ElectronActionResult {
    return {
      sessionId: this.session.id,
      appId: "electron-app-1",
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: true,
      mode: "playwright-electron",
      details,
    };
  }

  private appResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {},
  ): AppActionResult {
    return {
      sessionId: this.session.id,
      appId: "app-1",
      appKind: "browser",
      selectedDriver: "browser-playwright",
      semantic: true,
      fallbackUsed: false,
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: true,
      warnings: [],
      details,
    };
  }

  private visualResult(
    kind:
      | "compare"
      | "assert-changed"
      | "assert-similar"
      | "compare-baseline"
      | "assert-annotation-changed"
      | "assert-annotation-similar"
      | "assert-change-contained",
    passed: boolean | undefined,
  ): VisualCompareResult {
    return {
      sessionId: this.session.id,
      label: "router",
      kind,
      beforePath: `${this.session.evidencePath}/screenshots/0001-before.png`,
      afterPath: `${this.session.evidencePath}/screenshots/0002-after.png`,
      diffPath: `${this.session.evidencePath}/visual-diffs/diff_001-router.png`,
      width: 10,
      height: 10,
      comparedPixels: 100,
      diffPixels: 4,
      diffPixelRatio: 0.04,
      threshold: 0.1,
      minDiffPixelRatio: kind === "assert-changed" ? 0.01 : undefined,
      maxDiffPixelRatio: kind === "assert-similar" ? 0.1 : undefined,
      passed,
      createdAt: "2026-01-01T00:00:00.000Z",
      warnings: [],
    };
  }

  private visualBaseline(): VisualBaselineRef {
    return {
      name: "sample-vite-clean",
      suite: "smoke",
      path: `${this.session.evidencePath}/../../baselines/smoke/sample-vite-clean.png`,
      sourceScreenshotPath: `${this.session.evidencePath}/screenshots/0001-before.png`,
      width: 10,
      height: 10,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  private liveObserver(): LiveObserverRef {
    return {
      sessionId: this.session.id,
      observerId: "observer-1",
      host: "127.0.0.1",
      vncPort: 5901,
      webPort: 6081,
      viewOnly: true,
      url: "http://127.0.0.1:6081/vnc.html?autoconnect=1&resize=scale&view_only=1",
      createdAt: "2026-01-01T00:00:00.000Z",
      warnings: [],
    };
  }
}

function makeSession(): DesktopSession {
  return {
    id: "session-1",
    config: {
      workspacePath: "/tmp/agent-desktop-harness-test",
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
      apps: [],
    },
    warnings: [],
  };
}
