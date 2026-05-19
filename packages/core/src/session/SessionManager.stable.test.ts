import test from "node:test";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DisplayAllocator } from "./displayAllocator.js";
import {
  fingerprintsMatch,
  SessionManager
} from "./SessionManager.js";
import { EvidenceStore } from "../evidence/EvidenceStore.js";
import { LiveObserverService } from "../observer/LiveObserverService.js";
import { WindowService } from "../window/WindowService.js";
import type { XvfbDisplayOptions } from "../display/XvfbDisplay.js";
import type { WindowBackend } from "../window/types.js";
import type {
  BrowserActionResult,
  BrowserAssertTextOptions,
  BrowserClickOptions,
  BrowserDriver,
  BrowserFillOptions,
  BrowserOpenOptions,
  BrowserPageRef,
  BrowserPressOptions,
  BrowserScreenshotOptions
} from "../drivers/browser/browserTypes.js";
import type {
  TauriActionResult,
  TauriAssertTextOptions,
  TauriClickOptions,
  TauriDriver,
  TauriDriverStatus,
  TauriFillOptions,
  TauriOpenOptions,
  TauriAppRef,
  TauriScreenshotOptions
} from "../drivers/tauri/tauriTypes.js";
import type {
  ElectronActionResult,
  ElectronAssertTextOptions,
  ElectronClickOptions,
  ElectronDriver,
  ElectronDriverStatus,
  ElectronFillOptions,
  ElectronOpenOptions,
  ElectronAppRef,
  ElectronPressOptions,
  ElectronScreenshotOptions
} from "../drivers/electron/electronTypes.js";
import type {
  DesktopSession,
  FocusWindowTarget,
  ScreenshotOptions,
  ScreenshotResult,
  WindowActionResult,
  WindowInfo
} from "../types.js";

test("fingerprintsMatch supports tolerant file-size comparison", () => {
  assert.equal(
    fingerprintsMatch({ size: 100 }, { size: 108 }, "tolerant", 10),
    true
  );
  assert.equal(
    fingerprintsMatch({ size: 100 }, { size: 120 }, "tolerant", 10),
    false
  );
  assert.equal(fingerprintsMatch({ size: 100 }, { size: 100 }, "fileSize"), true);
  assert.equal(
    fingerprintsMatch({ size: 100, hash: "a" }, { size: 100, hash: "b" }, "hash"),
    false
  );
});

test("waitForStableScreen retains only the last stable-check screenshot when requested", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-stable-"));
  const evidenceStore = new EvidenceStore();
  const manager = makeManager({
    evidenceStore,
    screenshotService: new MockScreenshotService([100, 104])
  });

  try {
    const session = await manager.createSession({ workspacePath });
    const result = await manager.waitForStableScreen(session.id, {
      mode: "tolerant",
      fileSizeToleranceBytes: 10,
      retainOnlyLast: true,
      stableChecks: 1,
      intervalMs: 1,
      timeoutMs: 1000,
      label: "stable-test"
    });

    assert.equal(result.stable, true);
    assert.equal(result.checks, 2);
    assert.equal(result.mode, "tolerant");
    assert.equal(result.discardedScreenshotCount, 1);
    assert.equal(result.retainedScreenshots?.length, 1);

    const paths = evidenceStore.getPaths(workspacePath, session.id);
    assert.deepEqual(await readdir(paths.screenshotsPath), [
      "0002-stable-test-0002.png"
    ]);
    assert.deepEqual(await readdir(paths.transientPath), [
      "0001-stable-test-0001.png"
    ]);

    await evidenceStore.writeReport(manager.getSession(session.id)!);
    const report = await readFile(paths.reportPath, "utf8");
    assert.match(report, /## Stable Screen/);
    assert.match(report, /discarded=1/);
    assert.match(report, /retained=screenshots\/0002-stable-test-0002\.png/);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("waitForWindow returns the best matching non-devtools window", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-window-"));
  const manager = makeManager({
    windowService: new WindowService({
      backend: new MockWindowBackend([
        [
          {
            id: "0x01",
            title: "DevTools - Demo App",
            width: 1200,
            height: 900
          },
          {
            id: "0x02",
            title: "Demo App",
            width: 900,
            height: 700
          }
        ]
      ])
    })
  });

  try {
    const session = await manager.createSession({ workspacePath });
    const window = await manager.waitForWindow(session.id, {
      titleIncludes: "Demo",
      excludeDevtools: true,
      preferLargest: true,
      timeoutMs: 1000,
      intervalMs: 1
    });

    assert.equal(window.id, "0x02");
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("waitForWindow fails clearly on timeout", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-window-timeout-"));
  const manager = makeManager({
    windowService: new WindowService({
      backend: new MockWindowBackend([[]])
    })
  });

  try {
    const session = await manager.createSession({ workspacePath });
    await assert.rejects(
      async () =>
        await manager.waitForWindow(session.id, {
          titleIncludes: "Missing",
          timeoutMs: 5,
          intervalMs: 1
        }),
      /No matching window appeared/
    );
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("stopSession closes browser resources before process cleanup completes", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-browser-cleanup-"));
  const browserDriver = new MockBrowserDriver();
  const manager = makeManager({ browserDriver });

  try {
    const session = await manager.createSession({ workspacePath });
    await manager.openBrowser(session.id, {
      url: "http://127.0.0.1:5179"
    });
    await manager.stopSession(session.id);

    assert.deepEqual(browserDriver.closedSessionIds, [session.id]);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("openApp tracks browser app refs and delegates routed actions", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-router-browser-"));
  const browserDriver = new MockBrowserDriver();
  const manager = makeManager({ browserDriver });

  try {
    const session = await manager.createSession({ workspacePath });
    const app = await manager.openApp(session.id, {
      appKind: "browser",
      url: "http://127.0.0.1:5179",
      requireSemantic: true
    });

    assert.equal(app.selectedDriver, "browser-playwright");
    assert.equal(app.semantic, true);

    const result = await manager.appClick(session.id, {
      appId: app.appId,
      role: "button",
      name: "Save message"
    });

    assert.equal(result.appId, app.appId);
    assert.equal(result.selectedDriver, "browser-playwright");
    assert.deepEqual(browserDriver.clickedPageIds, ["page-1"]);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("stopSession closes routed browser app resources", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-router-cleanup-"));
  const browserDriver = new MockBrowserDriver();
  const manager = makeManager({ browserDriver });

  try {
    const session = await manager.createSession({ workspacePath });
    await manager.openApp(session.id, {
      appKind: "browser",
      url: "http://127.0.0.1:5179"
    });
    await manager.stopSession(session.id);

    assert.deepEqual(browserDriver.closedPageIds, ["page-1"]);
    assert.deepEqual(browserDriver.closedSessionIds, [session.id]);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("stopSession closes Tauri resources before process cleanup completes", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-tauri-cleanup-"));
  const tauriDriver = new MockTauriDriver();
  const manager = makeManager({ tauriDriver });

  try {
    const session = await manager.createSession({
      workspacePath,
      policy: {
        allowedCommands: ["pnpm"]
      }
    });
    await manager.openTauriApp(session.id, {
      command: "pnpm",
      args: ["tauri", "dev"]
    });
    await manager.stopSession(session.id);

    assert.deepEqual(tauriDriver.closedSessionIds, [session.id]);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("stopSession closes Electron resources before process cleanup completes", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-electron-cleanup-"));
  const electronDriver = new MockElectronDriver();
  const manager = makeManager({ electronDriver });

  try {
    const session = await manager.createSession({
      workspacePath,
      policy: {
        allowedCommands: ["electron"]
      }
    });
    await manager.openElectronApp(session.id, {
      command: "electron",
      args: ["."]
    });
    await manager.stopSession(session.id);

    assert.deepEqual(electronDriver.closedSessionIds, [session.id]);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("stopSession stops live observers before display cleanup completes", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-observer-cleanup-"));
  const liveObserverService = new MockLiveObserverService();
  const manager = makeManager({ liveObserverService });

  try {
    const session = await manager.createSession({ workspacePath });
    await manager.stopSession(session.id);

    assert.deepEqual(liveObserverService.closedSessionIds, [session.id]);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

function makeManager(options: {
  readonly evidenceStore?: EvidenceStore;
  readonly screenshotService?: MockScreenshotService;
  readonly windowService?: WindowService;
  readonly browserDriver?: BrowserDriver;
  readonly tauriDriver?: TauriDriver;
  readonly electronDriver?: ElectronDriver;
  readonly liveObserverService?: LiveObserverService;
} = {}): SessionManager {
  return new SessionManager({
    displayAllocator: new DisplayAllocator({
      min: 191,
      max: 191,
      isDisplayInUse: () => false
    }),
    displayBackend: {
      start: async ({ display, width, height, depth }: XvfbDisplayOptions) => ({
        display,
        width,
        height,
        depth,
        xvfbProcess: { pid: 1000 } as ChildProcess,
        warnings: []
      })
    } as never,
    evidenceStore: options.evidenceStore,
    screenshotService: options.screenshotService as never,
    windowService: options.windowService,
    browserDriver: options.browserDriver,
    tauriDriver: options.tauriDriver,
    electronDriver: options.electronDriver,
    liveObserverService: options.liveObserverService
  });
}

class MockLiveObserverService extends LiveObserverService {
  readonly closedSessionIds: string[] = [];

  override async stopAll(sessionId?: string): Promise<void> {
    if (sessionId) {
      this.closedSessionIds.push(sessionId);
    }
  }
}

class MockScreenshotService {
  private index = 0;

  constructor(private readonly sizes: readonly number[]) {}

  async capture(
    session: DesktopSession,
    filePath: string,
    sequence: number,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotResult> {
    const size = this.sizes[Math.min(this.index, this.sizes.length - 1)] ?? 100;
    this.index += 1;
    await writeFile(filePath, Buffer.alloc(size, this.index));
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    return {
      artifactId: `screenshot-${String(sequence).padStart(4, "0")}`,
      sessionId: session.id,
      path: filePath,
      width: session.width,
      height: session.height,
      capturedAt: createdAt,
      createdAt,
      display: session.display,
      sequence,
      label: options.label
    };
  }
}

class MockWindowBackend implements WindowBackend {
  private index = 0;

  constructor(private readonly windowsByCall: readonly (readonly WindowInfo[])[]) {}

  async getWindows(): Promise<WindowInfo[]> {
    const windows =
      this.windowsByCall[Math.min(this.index, this.windowsByCall.length - 1)] ?? [];
    this.index += 1;
    return [...windows];
  }

  async focusWindow(
    session: DesktopSession,
    target: FocusWindowTarget
  ): Promise<WindowActionResult> {
    const windows = await this.getWindows();
    return {
      sessionId: session.id,
      success: true,
      window: windows.find((window) => window.id === target.id),
      createdAt: "2026-01-01T00:00:00.000Z"
    };
  }
}

class MockBrowserDriver implements BrowserDriver {
  readonly closedSessionIds: string[] = [];
  readonly closedPageIds: string[] = [];
  readonly clickedPageIds: string[] = [];

  async open(session: DesktopSession, options: BrowserOpenOptions): Promise<BrowserPageRef> {
    return {
      sessionId: session.id,
      pageId: "page-1",
      url: options.url,
      title: "Mock Page",
      createdAt: "2026-01-01T00:00:00.000Z"
    };
  }

  async click(
    session: DesktopSession,
    options: BrowserClickOptions
  ): Promise<BrowserActionResult> {
    if (options.pageId) {
      this.clickedPageIds.push(options.pageId);
    }
    return makeBrowserResult(session, "browser.click");
  }

  async fill(
    session: DesktopSession,
    _options: BrowserFillOptions
  ): Promise<BrowserActionResult> {
    return makeBrowserResult(session, "browser.fill");
  }

  async press(
    session: DesktopSession,
    _options: BrowserPressOptions
  ): Promise<BrowserActionResult> {
    return makeBrowserResult(session, "browser.press");
  }

  async assertText(
    session: DesktopSession,
    _options: BrowserAssertTextOptions
  ): Promise<BrowserActionResult> {
    return makeBrowserResult(session, "browser.assert_text");
  }

  async screenshot(
    session: DesktopSession,
    filePath: string,
    sequence: number,
    options: BrowserScreenshotOptions
  ): Promise<ScreenshotResult> {
    await writeFile(filePath, Buffer.alloc(100, 1));
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    return {
      artifactId: `screenshot-${String(sequence).padStart(4, "0")}`,
      sessionId: session.id,
      path: filePath,
      width: session.width,
      height: session.height,
      capturedAt: createdAt,
      createdAt,
      display: session.display,
      sequence,
      label: options.label
    };
  }

  async close(_session: DesktopSession, pageId?: string): Promise<void> {
    if (pageId) {
      this.closedPageIds.push(pageId);
    }
    return;
  }

  async closeAll(sessionId: string): Promise<void> {
    this.closedSessionIds.push(sessionId);
  }
}

function makeBrowserResult(
  session: DesktopSession,
  actionType: string
): BrowserActionResult {
  return {
    sessionId: session.id,
    pageId: "page-1",
    actionType,
    success: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

class MockTauriDriver implements TauriDriver {
  readonly closedSessionIds: string[] = [];

  async getStatus(): Promise<TauriDriverStatus> {
    return {
      available: false,
      warnings: [],
      errors: ["tauri-driver is missing."]
    };
  }

  async open(session: DesktopSession, _options: TauriOpenOptions): Promise<TauriAppRef> {
    return {
      sessionId: session.id,
      appId: "tauri-app-1",
      processId: 2000,
      createdAt: "2026-01-01T00:00:00.000Z",
      mode: "x11-fallback",
      warnings: ["fallback"]
    };
  }

  async click(
    session: DesktopSession,
    _options: TauriClickOptions
  ): Promise<TauriActionResult> {
    return makeTauriResult(session, "tauri.click");
  }

  async fill(
    session: DesktopSession,
    _options: TauriFillOptions
  ): Promise<TauriActionResult> {
    return makeTauriResult(session, "tauri.fill");
  }

  async assertText(
    session: DesktopSession,
    _options: TauriAssertTextOptions
  ): Promise<TauriActionResult> {
    return makeTauriResult(session, "tauri.assert_text");
  }

  async screenshot(
    _session: DesktopSession,
    _filePath: string,
    _sequence: number,
    _options: TauriScreenshotOptions
  ): Promise<ScreenshotResult | undefined> {
    return undefined;
  }

  async close(_session: DesktopSession, _appId?: string): Promise<void> {
    return;
  }

  async closeAll(sessionId: string): Promise<void> {
    this.closedSessionIds.push(sessionId);
  }
}

function makeTauriResult(
  session: DesktopSession,
  actionType: string
): TauriActionResult {
  return {
    sessionId: session.id,
    appId: "tauri-app-1",
    actionType,
    success: false,
    mode: "x11-fallback",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

class MockElectronDriver implements ElectronDriver {
  readonly closedSessionIds: string[] = [];

  async getStatus(): Promise<ElectronDriverStatus> {
    return {
      available: true,
      playwrightAvailable: true,
      warnings: [],
      errors: []
    };
  }

  async open(session: DesktopSession, _options: ElectronOpenOptions): Promise<ElectronAppRef> {
    return {
      sessionId: session.id,
      appId: "electron-app-1",
      processId: 3000,
      createdAt: "2026-01-01T00:00:00.000Z",
      mode: "playwright-electron",
      windowTitle: "Mock Electron"
    };
  }

  async click(
    session: DesktopSession,
    _options: ElectronClickOptions
  ): Promise<ElectronActionResult> {
    return makeElectronResult(session, "electron.click");
  }

  async fill(
    session: DesktopSession,
    _options: ElectronFillOptions
  ): Promise<ElectronActionResult> {
    return makeElectronResult(session, "electron.fill");
  }

  async press(
    session: DesktopSession,
    _options: ElectronPressOptions
  ): Promise<ElectronActionResult> {
    return makeElectronResult(session, "electron.press");
  }

  async assertText(
    session: DesktopSession,
    _options: ElectronAssertTextOptions
  ): Promise<ElectronActionResult> {
    return makeElectronResult(session, "electron.assert_text");
  }

  async screenshot(
    _session: DesktopSession,
    _filePath: string,
    _sequence: number,
    _options: ElectronScreenshotOptions
  ): Promise<ScreenshotResult | undefined> {
    return undefined;
  }

  async close(_session: DesktopSession, _appId?: string): Promise<void> {
    return;
  }

  async closeAll(sessionId: string): Promise<void> {
    this.closedSessionIds.push(sessionId);
  }
}

function makeElectronResult(
  session: DesktopSession,
  actionType: string
): ElectronActionResult {
  return {
    sessionId: session.id,
    appId: "electron-app-1",
    actionType,
    success: true,
    mode: "playwright-electron",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}
