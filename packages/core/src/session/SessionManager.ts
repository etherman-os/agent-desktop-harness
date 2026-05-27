import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { StartedXvfbDisplay, XvfbDisplay } from "../display/XvfbDisplay.js";
import type {
  BrowserActionResult,
  BrowserAssertTextOptions,
  BrowserClickOptions,
  BrowserDriver,
  BrowserFillOptions,
  BrowserOpenOptions,
  BrowserPageRef,
  BrowserPressOptions,
  BrowserScreenshotOptions,
} from "../drivers/browser/browserTypes.js";
import { PlaywrightBrowserDriver } from "../drivers/browser/PlaywrightBrowserDriver.js";
import type {
  ElectronActionResult,
  ElectronAppRef,
  ElectronAssertTextOptions,
  ElectronClickOptions,
  ElectronDriver,
  ElectronDriverStatus,
  ElectronFillOptions,
  ElectronOpenOptions,
  ElectronPressOptions,
  ElectronScreenshotOptions,
} from "../drivers/electron/electronTypes.js";
import { PlaywrightElectronDriver } from "../drivers/electron/PlaywrightElectronDriver.js";
import type {
  AppActionResult,
  AppAssertTextOptions,
  AppClickOptions,
  AppFillOptions,
  AppOpenOptions,
  AppPressOptions,
  AppRef,
  AppScreenshotOptions,
  DriverRouteDecision,
  DriverRouteRequest,
  DriverRouterStatus,
  RoutedAppRecord,
  RoutedDriverKind,
} from "../drivers/router/driverRouterTypes.js";
import { makeDriverRouterStatus, selectDriver } from "../drivers/router/driverSelection.js";
import { TauriWebDriverDriver } from "../drivers/tauri/TauriWebDriverDriver.js";
import type {
  TauriActionResult,
  TauriAppRef,
  TauriAssertTextOptions,
  TauriClickOptions,
  TauriDriver,
  TauriDriverStatus,
  TauriFillOptions,
  TauriOpenOptions,
  TauriScreenshotOptions,
} from "../drivers/tauri/tauriTypes.js";
import { ProcessError, SessionNotFoundError } from "../errors.js";
import type { EvidenceStore } from "../evidence/EvidenceStore.js";
import { InputService } from "../input/InputService.js";
import { makeTypeTextDetails } from "../input/XdotoolInputBackend.js";
import { LiveObserverService } from "../observer/LiveObserverService.js";
import { redactObserverStartDetails } from "../observer/NoVncObserver.js";
import type {
  LiveObserverRef,
  LiveObserverStatus,
  StartLiveObserverOptions,
  StopLiveObserverResult,
} from "../observer/observerTypes.js";
import { PolicyValidator } from "../policy/PolicyValidator.js";
import { ScreenshotService } from "../screenshot/ScreenshotService.js";
import type {
  ActionLogRecord,
  ClickAction,
  CreateAnnotationInput,
  DesktopSession,
  FocusWindowTarget,
  HotkeyAction,
  InputActionResult,
  LaunchConfig,
  LaunchResult,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotOptions,
  ScreenshotResult,
  ScrollAction,
  SessionConfig,
  SessionId,
  TypeTextAction,
  VisualHandoff,
  WaitForStableScreenOptions,
  WaitForStableScreenResult,
  WaitForWindowOptions,
  WindowActionResult,
  WindowFilter,
  WindowInfo,
} from "../types.js";
import {
  createSanitizedEnvironment,
  findExecutableOnPath,
  waitForSpawn,
} from "../utils/command.js";
import { ensureDirectory, fileSize, hashFile } from "../utils/fs.js";
import { isoNow, now } from "../utils/time.js";
import { checkRegionOverlaps } from "../visual/geometry.js";
import { clampImageRegion, readPngSize } from "../visual/imageDiff.js";
import { VisualQaService } from "../visual/VisualQaService.js";
import type {
  AnnotationRegionOptions,
  AnnotationRegionResult,
  CompareVisualBaselineOptions,
  ListVisualBaselinesOptions,
  RectangleOverlapResult,
  SaveVisualBaselineOptions,
  VisualAssertAnnotationChangedOptions,
  VisualAssertAnnotationSimilarOptions,
  VisualAssertChangeContainedOptions,
  VisualAssertChangedOptions,
  VisualAssertionKind,
  VisualAssertSimilarOptions,
  VisualBaselineRef,
  VisualChangeContainmentResult,
  VisualCheckRegionOverlapOptions,
  VisualCompareOptions,
  VisualCompareResult,
} from "../visual/visualTypes.js";
import { WindowService } from "../window/WindowService.js";
import { findBestWindow } from "../window/windowFilters.js";
import { BrowserSessionHandler } from "./BrowserSessionHandler.js";
import type { DisplayAllocator } from "./displayAllocator.js";
import { terminateProcessTree } from "./processTree.js";
import type { ManagedSession } from "./SessionRegistry.js";
import { SessionRegistry } from "./SessionRegistry.js";

export interface SessionManagerOptions {
  readonly displayAllocator?: DisplayAllocator;
  readonly displayBackend?: XvfbDisplay;
  readonly evidenceStore?: EvidenceStore;
  readonly inputService?: InputService;
  readonly policyValidator?: PolicyValidator;
  readonly screenshotService?: ScreenshotService;
  readonly windowService?: WindowService;
  readonly browserDriver?: BrowserDriver;
  readonly tauriDriver?: TauriDriver;
  readonly electronDriver?: ElectronDriver;
  readonly visualQaService?: VisualQaService;
  readonly liveObserverService?: LiveObserverService;
}

interface ManagedRoutedApp extends RoutedAppRecord {
  readonly processId?: number;
}

export class SessionManager {
  private readonly registry: SessionRegistry;
  private readonly inputService: InputService;
  private readonly policyValidator: PolicyValidator;
  private readonly screenshotService: ScreenshotService;
  private readonly windowService: WindowService;
  private readonly browserHandler: BrowserSessionHandler;
  private readonly browserDriver: BrowserDriver;
  private readonly tauriDriver: TauriDriver;
  private readonly electronDriver: ElectronDriver;
  private readonly visualQaService: VisualQaService;
  private readonly liveObserverService: LiveObserverService;
  private readonly routedApps = new Map<string, ManagedRoutedApp>();
  private readonly routedAppsBySession = new Map<SessionId, Set<string>>();
  private readonly lastRoutedAppBySession = new Map<SessionId, string>();

  constructor(options: SessionManagerOptions = {}) {
    this.registry = new SessionRegistry(
      options.displayAllocator,
      options.displayBackend,
      options.evidenceStore,
    );
    this.inputService = options.inputService ?? new InputService();
    this.policyValidator = options.policyValidator ?? new PolicyValidator();
    this.screenshotService = options.screenshotService ?? new ScreenshotService();
    this.windowService = options.windowService ?? new WindowService();
    this.browserDriver = options.browserDriver ?? new PlaywrightBrowserDriver();
    this.browserHandler = new BrowserSessionHandler(this.registry, this.browserDriver);
    this.tauriDriver = options.tauriDriver ?? new TauriWebDriverDriver();
    this.electronDriver = options.electronDriver ?? new PlaywrightElectronDriver();
    this.visualQaService = options.visualQaService ?? new VisualQaService();
    this.liveObserverService = options.liveObserverService ?? new LiveObserverService();
  }

  async createSession(config: SessionConfig): Promise<DesktopSession> {
    const workspacePath = resolve(config.workspacePath);
    const normalizedConfig: SessionConfig = {
      ...config,
      workspacePath,
      evidenceRootPath: config.evidenceRootPath ? resolve(config.evidenceRootPath) : undefined,
    };

    this.policyValidator.validateSessionConfig(normalizedConfig);
    await ensureDirectory(workspacePath);

    const width = normalizedConfig.display?.width ?? 1440;
    const height = normalizedConfig.display?.height ?? 900;
    const depth = normalizedConfig.display?.depth ?? 24;
    const allocatedDisplay = await this.registry.displayAllocator.allocate(
      normalizedConfig.display?.displayNumberRange,
    );
    const sessionId = randomUUID();
    const evidencePath = this.registry.evidenceStore.getSessionPath(
      workspacePath,
      sessionId,
      normalizedConfig.evidenceRootPath,
    );

    let session: DesktopSession = {
      id: sessionId,
      config: normalizedConfig,
      driverKind: "unknown",
      status: "starting",
      createdAt: now(),
      workspacePath,
      evidencePath,
      display: allocatedDisplay.value,
      displayNumber: allocatedDisplay.number,
      width,
      height,
      depth,
      processIds: {
        apps: [],
      },
      warnings: [],
    };

    let startedDisplay: StartedXvfbDisplay | undefined;

    try {
      await this.registry.evidenceStore.createSession(session);
      await this.registry.appendAction(session, "session.created", "ok", {
        display: session.display,
        width,
        height,
        depth,
        workspacePath,
        evidencePath,
      });

      startedDisplay = await this.registry.displayBackend.start({
        display: allocatedDisplay.value,
        width,
        height,
        depth,
      });

      session = {
        ...session,
        status: "running",
        processIds: {
          xvfb: startedDisplay.xvfbProcess.pid,
          windowManager: startedDisplay.windowManagerProcess?.pid,
          apps: [],
        },
        warnings: startedDisplay.warnings,
      };

      const managed: ManagedSession = {
        session,
        xvfbProcess: startedDisplay.xvfbProcess,
        windowManagerProcess: startedDisplay.windowManagerProcess,
        appProcesses: [],
        screenshotSequence: 0,
        displayReleased: false,
      };
      this.registry.sessions.set(session.id, managed);

      await this.registry.evidenceStore.writeSession(session);
      await this.registry.appendAction(session, "display.started", "ok", {
        display: session.display,
        pid: session.processIds.xvfb,
        width,
        height,
        depth,
      });
      await this.registry.appendAction(session, "window_manager.started", "ok", {
        command: "openbox",
        pid: session.processIds.windowManager,
        skipped: session.processIds.windowManager === undefined,
        warnings: session.warnings,
      });

      if (normalizedConfig.command) {
        const [command, ...args] = normalizedConfig.command;
        if (!command) {
          throw new ProcessError("SessionConfig.command cannot be an empty string.");
        }
        await this.launchApp(session.id, {
          command,
          args,
          cwd: workspacePath,
        });
        session = this.registry.requireManagedSession(session.id).session;
      }

      return session;
    } catch (error) {
      const failedSession = {
        ...session,
        status: "failed" as const,
        warnings: [...session.warnings, error instanceof Error ? error.message : String(error)],
      };

      try {
        await this.registry.appendAction(
          failedSession,
          "error",
          "failed",
          {
            phase: "createSession",
          },
          error,
        );
        await this.registry.evidenceStore.writeSession(failedSession);
      } catch (evidenceError) {
        console.error("Failed to record session evidence:", evidenceError);
      }
      if (startedDisplay) {
        await terminateProcessTree(startedDisplay.windowManagerProcess).catch(() => undefined);
        await terminateProcessTree(startedDisplay.xvfbProcess).catch(() => undefined);
      }
      this.registry.sessions.delete(session.id);
      this.registry.displayAllocator.release(allocatedDisplay.number);
      throw error;
    }
  }

  async launchApp(sessionId: SessionId, launch: LaunchConfig): Promise<LaunchResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);
    this.policyValidator.validateLaunchConfig(session, launch);

    const args = [...(launch.args ?? [])];
    const cwd = resolve(launch.cwd ?? session.workspacePath);
    const executable = await findExecutableOnPath(launch.command, process.env, cwd);
    if (!executable) {
      const error = new ProcessError(
        `Launch command was not found or is not executable: ${launch.command}`,
      );
      await this.registry.appendAction(
        session,
        "app.launched",
        "failed",
        {
          command: launch.command,
          argCount: args.length,
          cwd,
        },
        error,
      );
      throw error;
    }

    const child = spawn(launch.command, args, {
      cwd,
      detached: true,
      env: createSanitizedEnvironment({
        ...session.config.env,
        ...launch.env,
        DISPLAY: session.display,
        AGENT_DESKTOP_HARNESS_SESSION_ID: session.id,
      }),
      shell: false,
      stdio: "ignore",
    });

    try {
      await waitForSpawn(child, launch.command);
    } catch (error) {
      await this.registry.appendAction(
        session,
        "app.launched",
        "failed",
        {
          command: launch.command,
          argCount: args.length,
          cwd,
        },
        error,
      );
      throw error;
    }

    managed.appProcesses.push(child);
    const updatedSession = this.registry.updateManagedSession(managed, {
      processIds: {
        ...session.processIds,
        apps: managed.appProcesses
          .map((processHandle) => processHandle.pid)
          .filter((pid): pid is number => pid !== undefined),
      },
    });
    await this.registry.evidenceStore.writeSession(updatedSession);
    await this.registry.appendAction(updatedSession, "app.launched", "ok", {
      command: launch.command,
      args,
      cwd,
      pid: child.pid,
    });

    if (child.pid === undefined) {
      throw new ProcessError(`Launch command started without a process id: ${launch.command}`);
    }

    return {
      sessionId: session.id,
      processId: child.pid,
      command: launch.command,
      args,
      cwd,
      display: session.display,
      startedAt: now(),
    };
  }

  async captureScreenshot(
    sessionId: SessionId,
    options: ScreenshotOptions = {},
  ): Promise<ScreenshotResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    const sequence = managed.screenshotSequence + 1;
    const filePath = this.registry.evidenceStore.getScreenshotPath(session, sequence, options);

    try {
      const result = await this.screenshotService.capture(session, filePath, sequence, options);
      managed.screenshotSequence = sequence;
      await this.registry.appendAction(session, "screenshot.captured", "ok", {
        path: result.path,
        display: result.display,
        sequence: result.sequence,
        label: result.label,
        transient: options.transient === true,
      });
      return result;
    } catch (error) {
      await this.registry.appendAction(
        session,
        "screenshot.captured",
        "failed",
        {
          display: session.display,
          sequence,
          label: options.label,
          transient: options.transient === true,
        },
        error,
      );
      throw error;
    }
  }

  async click(sessionId: SessionId, action: ClickAction): Promise<InputActionResult> {
    return await this.performInputAction(
      sessionId,
      "input.click",
      {
        x: action.x,
        y: action.y,
        button: action.button ?? "left",
        label: action.label,
      },
      async (session) => await this.inputService.click(session, action),
    );
  }

  async doubleClick(sessionId: SessionId, action: ClickAction): Promise<InputActionResult> {
    return await this.performInputAction(
      sessionId,
      "input.double_click",
      {
        x: action.x,
        y: action.y,
        button: action.button ?? "left",
        label: action.label,
      },
      async (session) => await this.inputService.doubleClick(session, action),
    );
  }

  async typeText(sessionId: SessionId, action: TypeTextAction): Promise<InputActionResult> {
    const details = makeTypeTextDetails(action);
    return await this.performInputAction(
      sessionId,
      "input.type_text",
      details,
      async (session) => await this.inputService.typeText(session, action),
    );
  }

  async hotkey(sessionId: SessionId, action: HotkeyAction): Promise<InputActionResult> {
    return await this.performInputAction(
      sessionId,
      "input.hotkey",
      {
        keys: action.keys,
        label: action.label,
      },
      async (session) => await this.inputService.hotkey(session, action),
    );
  }

  async scroll(sessionId: SessionId, action: ScrollAction): Promise<InputActionResult> {
    return await this.performInputAction(
      sessionId,
      "input.scroll",
      {
        direction: action.direction,
        amount: action.amount ?? 1,
        x: action.x,
        y: action.y,
        label: action.label,
      },
      async (session) => await this.inputService.scroll(session, action),
    );
  }

  async getWindows(sessionId: SessionId): Promise<WindowInfo[]> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const windows = await this.windowService.getWindows(session);
      await this.registry.appendAction(session, "window.list", "ok", {
        count: windows.length,
        windows: windows.map((window) => ({
          id: window.id,
          title: window.title,
          pid: window.pid,
          desktop: window.desktop,
          x: window.x,
          y: window.y,
          width: window.width,
          height: window.height,
        })),
      });
      return windows;
    } catch (error) {
      await this.registry.appendFailure(session, "window.list", {}, error);
      throw error;
    }
  }

  async focusWindow(sessionId: SessionId, target: FocusWindowTarget): Promise<WindowActionResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const result = await this.windowService.focusWindow(session, target);
      await this.registry.appendAction(session, "window.focus", "ok", {
        target,
        window: result.window,
      });
      return result;
    } catch (error) {
      await this.registry.appendFailure(session, "window.focus", { target }, error);
      throw error;
    }
  }

  async findWindow(sessionId: SessionId, filter: WindowFilter): Promise<WindowInfo | undefined> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const windows = await this.windowService.getWindows(session);
      const window = findBestWindow(windows, filter);
      await this.registry.appendAction(session, "window.find", "ok", {
        filter,
        window,
        matched: window !== undefined,
        candidateCount: windows.length,
      });
      return window;
    } catch (error) {
      await this.registry.appendFailure(session, "window.find", { filter }, error);
      throw error;
    }
  }

  async focusBestWindow(sessionId: SessionId, filter: WindowFilter): Promise<WindowActionResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const window = await this.findWindow(sessionId, filter);
      if (!window) {
        throw new ProcessError("No matching window was found for focusBestWindow.");
      }

      const result = await this.windowService.focusWindow(session, { id: window.id });
      await this.registry.appendAction(session, "window.focus_best", "ok", {
        filter,
        window: result.window,
      });
      return result;
    } catch (error) {
      await this.registry.appendFailure(session, "window.focus_best", { filter }, error);
      throw error;
    }
  }

  async waitForWindow(
    sessionId: SessionId,
    options: WaitForWindowOptions = {},
  ): Promise<WindowInfo> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    const timeoutMs = options.timeoutMs ?? 5000;
    const intervalMs = options.intervalMs ?? 250;
    if (timeoutMs <= 0 || intervalMs <= 0) {
      throw new ProcessError("waitForWindow requires positive timeoutMs and intervalMs.");
    }

    const startTime = Date.now();
    let checks = 0;

    try {
      while (Date.now() - startTime <= timeoutMs) {
        checks += 1;
        const windows = await this.windowService.getWindows(session);
        const window = findBestWindow(windows, options);

        if (window) {
          await this.registry.appendAction(session, "window.wait_for_window", "ok", {
            filter: options,
            checks,
            elapsedMs: Date.now() - startTime,
            window,
          });
          return window;
        }

        await sleep(intervalMs);
      }

      throw new ProcessError(`No matching window appeared within ${timeoutMs}ms.`);
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "window.wait_for_window",
        {
          filter: options,
          checks,
          elapsedMs: Date.now() - startTime,
        },
        error,
      );
      throw error;
    }
  }

  async waitForStableScreen(
    sessionId: SessionId,
    options: WaitForStableScreenOptions = {},
  ): Promise<WaitForStableScreenResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    const timeoutMs = options.timeoutMs ?? 5000;
    const intervalMs = options.intervalMs ?? 500;
    const stableChecks = options.stableChecks ?? 2;
    const label = options.label ?? "stable-check";
    const mode = options.mode ?? "hash";
    const fileSizeToleranceBytes =
      options.fileSizeToleranceBytes ?? (mode === "tolerant" ? 1024 : 0);
    const maxRetainedScreenshots =
      options.retainOnlyLast === true ? 1 : options.maxRetainedScreenshots;

    if (
      timeoutMs <= 0 ||
      intervalMs <= 0 ||
      stableChecks < 1 ||
      !["hash", "fileSize", "tolerant"].includes(mode) ||
      !Number.isInteger(fileSizeToleranceBytes) ||
      fileSizeToleranceBytes < 0 ||
      (maxRetainedScreenshots !== undefined &&
        (!Number.isInteger(maxRetainedScreenshots) || maxRetainedScreenshots < 1))
    ) {
      throw new ProcessError(
        "waitForStableScreen requires positive timeoutMs, intervalMs, stableChecks, and valid retention options.",
      );
    }

    const startTime = Date.now();
    let checks = 0;
    let stableMatches = 0;
    let previousFingerprint: ScreenshotFingerprint | undefined;
    let lastScreenshot: ScreenshotResult | undefined;
    let discardedScreenshotCount = 0;
    const retainedScreenshots: ScreenshotResult[] = [];

    try {
      while (Date.now() - startTime <= timeoutMs) {
        checks += 1;
        lastScreenshot = await this.captureScreenshot(sessionId, {
          label: `${label}-${String(checks).padStart(4, "0")}`,
        });

        const currentFingerprint = await fingerprintScreenshot(lastScreenshot.path, mode);
        retainedScreenshots.push(lastScreenshot);
        discardedScreenshotCount += await applyStableScreenshotRetention(
          this.registry.evidenceStore,
          session,
          retainedScreenshots,
          maxRetainedScreenshots,
        );

        if (
          previousFingerprint &&
          fingerprintsMatch(previousFingerprint, currentFingerprint, mode, fileSizeToleranceBytes)
        ) {
          stableMatches += 1;
        } else {
          stableMatches = 0;
        }

        if (stableMatches >= stableChecks) {
          const result: WaitForStableScreenResult = {
            sessionId,
            stable: true,
            checks,
            elapsedMs: Date.now() - startTime,
            mode,
            retainedScreenshots: [...retainedScreenshots],
            discardedScreenshotCount,
            lastScreenshot,
            reason: "stable",
          };
          await this.registry.appendAction(
            session,
            "screen.wait_for_stable",
            "ok",
            stableScreenActionDetails(result),
          );
          return result;
        }

        previousFingerprint = currentFingerprint;
        await sleep(intervalMs);
      }

      const result = {
        sessionId,
        stable: false,
        checks,
        elapsedMs: Date.now() - startTime,
        mode,
        retainedScreenshots: [...retainedScreenshots],
        discardedScreenshotCount,
        lastScreenshot,
        reason: "timeout",
      };
      await this.registry.appendAction(
        session,
        "screen.wait_for_stable",
        "ok",
        stableScreenActionDetails(result),
      );
      return result;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "screen.wait_for_stable",
        {
          timeoutMs,
          intervalMs,
          stableChecks,
          label,
          mode,
          fileSizeToleranceBytes,
          maxRetainedScreenshots,
        },
        error,
      );
      throw error;
    }
  }

  async openBrowser(sessionId: SessionId, options: BrowserOpenOptions): Promise<BrowserPageRef> {
    return await this.browserHandler.open(sessionId, options);
  }

  async browserClick(
    sessionId: SessionId,
    options: BrowserClickOptions,
  ): Promise<BrowserActionResult> {
    return await this.browserHandler.click(sessionId, options);
  }

  async browserFill(
    sessionId: SessionId,
    options: BrowserFillOptions,
  ): Promise<BrowserActionResult> {
    return await this.browserHandler.fill(sessionId, options);
  }

  async browserPress(
    sessionId: SessionId,
    options: BrowserPressOptions,
  ): Promise<BrowserActionResult> {
    return await this.browserHandler.press(sessionId, options);
  }

  async browserAssertText(
    sessionId: SessionId,
    options: BrowserAssertTextOptions,
  ): Promise<BrowserActionResult> {
    return await this.browserHandler.assertText(sessionId, options);
  }

  async browserScreenshot(
    sessionId: SessionId,
    options: BrowserScreenshotOptions = {},
  ): Promise<ScreenshotResult> {
    return await this.browserHandler.screenshot(sessionId, options);
  }

  async closeBrowser(sessionId: SessionId, pageId?: string): Promise<void> {
    await this.browserHandler.close(sessionId, pageId);
  }

  async getTauriDriverStatus(): Promise<TauriDriverStatus> {
    return await this.tauriDriver.getStatus();
  }

  async openTauriApp(sessionId: SessionId, options: TauriOpenOptions): Promise<TauriAppRef> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);
    this.policyValidator.validateLaunchConfig(session, {
      command: options.command,
      args: options.args,
      cwd: options.cwd,
      env: options.env,
    });

    try {
      const app = await this.tauriDriver.open(session, options);
      const updatedSession = this.registry.updateManagedSession(managed, {
        driverKind: "tauri",
      });
      await this.registry.evidenceStore.writeSession(updatedSession);
      await this.registry.appendAction(updatedSession, "tauri.open", "ok", {
        appId: app.appId,
        mode: app.mode,
        webdriverUrl: app.webdriverUrl,
        processId: app.processId,
        command: options.command,
        args: options.args,
        cwd: options.cwd,
        label: options.label,
        webdriverPort: options.webdriverPort,
        nativePort: options.nativePort,
        applicationPath: options.applicationPath,
        warnings: app.warnings,
      });
      return app;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "tauri.open",
        {
          command: options.command,
          argCount: options.args.length,
          cwd: options.cwd,
          label: options.label,
          webdriverPort: options.webdriverPort,
          nativePort: options.nativePort,
          applicationPath: options.applicationPath,
        },
        error,
      );
      throw error;
    }
  }

  async tauriClick(sessionId: SessionId, options: TauriClickOptions): Promise<TauriActionResult> {
    return await this.performTauriAction(
      sessionId,
      "tauri.click",
      {
        ...browserTargetDetails(options),
        appId: options.appId,
        timeoutMs: options.timeoutMs,
        label: options.label,
      },
      async (session) => await this.tauriDriver.click(session, options),
    );
  }

  async tauriFill(sessionId: SessionId, options: TauriFillOptions): Promise<TauriActionResult> {
    return await this.performTauriAction(
      sessionId,
      "tauri.fill",
      {
        ...browserTargetDetails(options),
        appId: options.appId,
        timeoutMs: options.timeoutMs,
        redacted: options.secret === true,
        valueLength: options.value.length,
        value: options.secret === true ? undefined : truncateForLog(options.value),
        truncated: options.secret === true ? undefined : options.value.length > 256,
        label: options.label,
      },
      async (session) => await this.tauriDriver.fill(session, options),
      options.secret === true ? options.value : undefined,
    );
  }

  async tauriAssertText(
    sessionId: SessionId,
    options: TauriAssertTextOptions,
  ): Promise<TauriActionResult> {
    return await this.performTauriAction(
      sessionId,
      "tauri.assert_text",
      {
        appId: options.appId,
        text: options.text,
        timeoutMs: options.timeoutMs,
        label: options.label,
      },
      async (session) => await this.tauriDriver.assertText(session, options),
    );
  }

  async tauriScreenshot(
    sessionId: SessionId,
    options: TauriScreenshotOptions = {},
  ): Promise<ScreenshotResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    const sequence = managed.screenshotSequence + 1;
    const filePath = this.registry.evidenceStore.getScreenshotPath(session, sequence, {
      label: options.label,
    });

    try {
      const webdriverScreenshot = await this.tauriDriver.screenshot(
        session,
        filePath,
        sequence,
        options,
      );
      const result =
        webdriverScreenshot ??
        (await this.captureScreenshot(sessionId, {
          label: options.label,
        }));
      if (webdriverScreenshot) {
        managed.screenshotSequence = sequence;
        await this.registry.appendAction(session, "screenshot.captured", "ok", {
          path: result.path,
          display: result.display,
          sequence: result.sequence,
          label: result.label,
          source: "tauri-webdriver",
          appId: options.appId,
        });
      }
      await this.registry.appendAction(session, "tauri.screenshot", "ok", {
        path: result.path,
        sequence: result.sequence,
        label: result.label,
        appId: options.appId,
        mode: webdriverScreenshot ? "webdriver" : "x11-fallback",
      });
      return result;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "tauri.screenshot",
        {
          sequence,
          label: options.label,
          appId: options.appId,
        },
        error,
      );
      throw error;
    }
  }

  async closeTauriApp(sessionId: SessionId, appId?: string): Promise<void> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      await this.tauriDriver.close(session, appId);
      await this.registry.appendAction(session, "tauri.close", "ok", {
        appId,
      });
    } catch (error) {
      await this.registry.appendFailure(session, "tauri.close", { appId }, error);
      throw error;
    }
  }

  async getElectronDriverStatus(): Promise<ElectronDriverStatus> {
    return await this.electronDriver.getStatus();
  }

  async openElectronApp(
    sessionId: SessionId,
    options: ElectronOpenOptions,
  ): Promise<ElectronAppRef> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);
    if (options.command) {
      this.policyValidator.validateLaunchConfig(session, {
        command: options.command,
        args: options.args ?? [],
        cwd: options.cwd,
        env: options.env,
      });
    }

    try {
      const app = await this.electronDriver.open(session, options);
      const updatedSession = this.registry.updateManagedSession(managed, {
        driverKind: "electron",
      });
      await this.registry.evidenceStore.writeSession(updatedSession);
      await this.registry.appendAction(updatedSession, "electron.open", "ok", {
        appId: app.appId,
        mode: app.mode,
        processId: app.processId,
        windowTitle: app.windowTitle,
        command: options.command,
        argCount: options.args?.length ?? 0,
        cwd: options.cwd,
        executablePath: options.executablePath,
        appPath: options.appPath,
        label: options.label,
        windowTitleIncludes: options.windowTitleIncludes,
        excludeDevtools: options.excludeDevtools === true,
        warnings: app.warnings,
      });
      return app;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "electron.open",
        {
          command: options.command,
          argCount: options.args?.length ?? 0,
          cwd: options.cwd,
          executablePath: options.executablePath,
          appPath: options.appPath,
          label: options.label,
          windowTitleIncludes: options.windowTitleIncludes,
          excludeDevtools: options.excludeDevtools === true,
        },
        error,
      );
      throw error;
    }
  }

  async electronClick(
    sessionId: SessionId,
    options: ElectronClickOptions,
  ): Promise<ElectronActionResult> {
    return await this.performElectronAction(
      sessionId,
      "electron.click",
      {
        ...browserTargetDetails(options),
        appId: options.appId,
        timeoutMs: options.timeoutMs,
        label: options.label,
      },
      async (session) => await this.electronDriver.click(session, options),
    );
  }

  async electronFill(
    sessionId: SessionId,
    options: ElectronFillOptions,
  ): Promise<ElectronActionResult> {
    return await this.performElectronAction(
      sessionId,
      "electron.fill",
      {
        ...browserTargetDetails(options),
        appId: options.appId,
        timeoutMs: options.timeoutMs,
        redacted: options.secret === true,
        valueLength: options.value.length,
        value: options.secret === true ? undefined : truncateForLog(options.value),
        truncated: options.secret === true ? undefined : options.value.length > 256,
        label: options.label,
      },
      async (session) => await this.electronDriver.fill(session, options),
      options.secret === true ? options.value : undefined,
    );
  }

  async electronPress(
    sessionId: SessionId,
    options: ElectronPressOptions,
  ): Promise<ElectronActionResult> {
    return await this.performElectronAction(
      sessionId,
      "electron.press",
      {
        ...browserTargetDetails(options),
        appId: options.appId,
        key: options.key,
        timeoutMs: options.timeoutMs,
        label: options.label,
      },
      async (session) => await this.electronDriver.press(session, options),
    );
  }

  async electronAssertText(
    sessionId: SessionId,
    options: ElectronAssertTextOptions,
  ): Promise<ElectronActionResult> {
    return await this.performElectronAction(
      sessionId,
      "electron.assert_text",
      {
        appId: options.appId,
        text: options.text,
        timeoutMs: options.timeoutMs,
        label: options.label,
      },
      async (session) => await this.electronDriver.assertText(session, options),
    );
  }

  async electronScreenshot(
    sessionId: SessionId,
    options: ElectronScreenshotOptions = {},
  ): Promise<ScreenshotResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    const sequence = managed.screenshotSequence + 1;
    const filePath = this.registry.evidenceStore.getScreenshotPath(session, sequence, {
      label: options.label,
    });

    try {
      const electronScreenshot = await this.electronDriver.screenshot(
        session,
        filePath,
        sequence,
        options,
      );
      const result =
        electronScreenshot ??
        (await this.captureScreenshot(sessionId, {
          label: options.label,
        }));
      if (electronScreenshot) {
        managed.screenshotSequence = sequence;
        await this.registry.appendAction(session, "screenshot.captured", "ok", {
          path: result.path,
          display: result.display,
          sequence: result.sequence,
          label: result.label,
          source: "electron-playwright",
          appId: options.appId,
          fullPage: options.fullPage === true,
        });
      }
      await this.registry.appendAction(session, "electron.screenshot", "ok", {
        path: result.path,
        sequence: result.sequence,
        label: result.label,
        appId: options.appId,
        fullPage: options.fullPage === true,
        mode: electronScreenshot ? "playwright-electron" : "x11-fallback",
      });
      return result;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "electron.screenshot",
        {
          sequence,
          label: options.label,
          appId: options.appId,
          fullPage: options.fullPage === true,
        },
        error,
      );
      throw error;
    }
  }

  async closeElectronApp(sessionId: SessionId, appId?: string): Promise<void> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      await this.electronDriver.close(session, appId);
      await this.registry.appendAction(session, "electron.close", "ok", {
        appId,
      });
    } catch (error) {
      await this.registry.appendFailure(session, "electron.close", { appId }, error);
      throw error;
    }
  }

  async getDriverRouterStatus(): Promise<DriverRouterStatus> {
    return makeDriverRouterStatus({
      tauri: await this.getTauriDriverStatus(),
      electron: await this.getElectronDriverStatus(),
    });
  }

  async routeDriver(
    sessionId: SessionId,
    request: DriverRouteRequest,
  ): Promise<DriverRouteDecision> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const decision = selectDriver(await this.getDriverRouterStatus(), request);
      await this.registry.appendAction(session, "driver.route", "ok", {
        appKind: decision.appKind,
        selectedDriver: decision.selectedDriver,
        selectionMode: decision.selectionMode,
        semantic: decision.semantic,
        fallbackUsed: decision.fallbackUsed,
        fallbackReason: decision.fallbackReason,
        warnings: decision.warnings,
        errors: decision.errors,
      });
      return decision;
    } catch (error) {
      await this.registry.appendFailure(session, "driver.route", { request }, error);
      throw error;
    }
  }

  async openApp(sessionId: SessionId, options: AppOpenOptions): Promise<AppRef> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);
    const decision = await this.routeDriver(sessionId, {
      appKind: options.appKind,
      preferredDriver: options.preferredDriver,
      allowFallback: options.allowFallback,
      requireSemantic: options.requireSemantic,
    });

    try {
      const app = await this.openAppWithDecision(sessionId, options, decision);
      this.rememberRoutedApp(app);
      await this.registry.appendAction(session, "app.open", "ok", {
        appId: app.appId,
        appKind: app.appKind,
        selectedDriver: app.selectedDriver,
        semantic: app.semantic,
        fallbackUsed: app.fallbackUsed,
        warnings: app.warnings,
        label: options.label,
      });
      return toAppRef(app);
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "app.open",
        {
          appKind: options.appKind,
          selectedDriver: decision.selectedDriver,
          label: options.label,
        },
        error,
      );
      throw error;
    }
  }

  async appClick(sessionId: SessionId, options: AppClickOptions): Promise<AppActionResult> {
    const app = this.requireRoutedApp(sessionId, options.appId);
    const driver = this.resolveActionDriver(app, options.preferredDriver, options.allowFallback);

    if (driver === "browser-playwright") {
      const result = await this.browserClick(sessionId, {
        ...semanticTargetForApp(options),
        pageId: app.underlyingId,
        timeoutMs: options.timeoutMs,
      });
      return this.appResult(app, driver, "app.click", result.success, result.details);
    }
    if (driver === "tauri-webdriver") {
      const result = await this.tauriClick(sessionId, {
        ...semanticTargetForApp(options),
        appId: app.underlyingId,
        timeoutMs: options.timeoutMs,
      });
      return this.appResult(
        app,
        driver,
        "app.click",
        result.success,
        result.details,
        result.warnings,
      );
    }
    if (driver === "electron-playwright") {
      const result = await this.electronClick(sessionId, {
        ...semanticTargetForApp(options),
        appId: app.underlyingId,
        timeoutMs: options.timeoutMs,
      });
      return this.appResult(
        app,
        driver,
        "app.click",
        result.success,
        result.details,
        result.warnings,
      );
    }

    if (options.x === undefined || options.y === undefined) {
      throw new ProcessError("appClick using X11 fallback requires x and y coordinates.");
    }
    const result = await this.click(sessionId, {
      x: options.x,
      y: options.y,
      button: options.button,
      label: options.label,
    });
    return this.appResult(app, "x11-fallback", "app.click", result.success, result.details);
  }

  async appFill(sessionId: SessionId, options: AppFillOptions): Promise<AppActionResult> {
    const app = this.requireRoutedApp(sessionId, options.appId);
    const driver = this.resolveActionDriver(app, options.preferredDriver, options.allowFallback);

    if (driver === "browser-playwright") {
      const result = await this.browserFill(sessionId, {
        ...semanticTargetForApp(options),
        pageId: app.underlyingId,
        value: options.value,
        secret: options.secret,
        timeoutMs: options.timeoutMs,
      });
      return this.appResult(app, driver, "app.fill", result.success, result.details);
    }
    if (driver === "tauri-webdriver") {
      const result = await this.tauriFill(sessionId, {
        ...semanticTargetForApp(options),
        appId: app.underlyingId,
        value: options.value,
        secret: options.secret,
        timeoutMs: options.timeoutMs,
      });
      return this.appResult(
        app,
        driver,
        "app.fill",
        result.success,
        result.details,
        result.warnings,
      );
    }
    if (driver === "electron-playwright") {
      const result = await this.electronFill(sessionId, {
        ...semanticTargetForApp(options),
        appId: app.underlyingId,
        value: options.value,
        secret: options.secret,
        timeoutMs: options.timeoutMs,
      });
      return this.appResult(
        app,
        driver,
        "app.fill",
        result.success,
        result.details,
        result.warnings,
      );
    }

    if (options.x === undefined || options.y === undefined) {
      throw new ProcessError(
        "appFill using X11 fallback requires x and y coordinates before typing.",
      );
    }
    await this.click(sessionId, {
      x: options.x,
      y: options.y,
      button: options.button,
      label: options.label,
    });
    const result = await this.typeText(sessionId, {
      text: options.value,
      secret: options.secret,
      label: options.label,
    });
    return this.appResult(app, "x11-fallback", "app.fill", result.success, result.details);
  }

  async appPress(sessionId: SessionId, options: AppPressOptions): Promise<AppActionResult> {
    const app = this.requireRoutedApp(sessionId, options.appId);
    const driver = this.resolveActionDriver(app, options.preferredDriver, options.allowFallback);

    if (driver === "browser-playwright") {
      const result = await this.browserPress(sessionId, {
        ...semanticTargetForApp(options),
        pageId: app.underlyingId,
        key: options.key,
        timeoutMs: options.timeoutMs,
      });
      return this.appResult(app, driver, "app.press", result.success, result.details);
    }
    if (driver === "electron-playwright") {
      const result = await this.electronPress(sessionId, {
        ...semanticTargetForApp(options),
        appId: app.underlyingId,
        key: options.key,
        timeoutMs: options.timeoutMs,
      });
      return this.appResult(
        app,
        driver,
        "app.press",
        result.success,
        result.details,
        result.warnings,
      );
    }
    if (driver === "tauri-webdriver") {
      return this.unsupportedAppResult(
        app,
        driver,
        "app.press",
        "Tauri press is not implemented yet.",
      );
    }

    const result = await this.hotkey(sessionId, {
      keys: [options.key],
      label: options.label,
    });
    return this.appResult(app, "x11-fallback", "app.press", result.success, result.details);
  }

  async appAssertText(
    sessionId: SessionId,
    options: AppAssertTextOptions,
  ): Promise<AppActionResult> {
    const app = this.requireRoutedApp(sessionId, options.appId);
    const driver = this.resolveActionDriver(app, options.preferredDriver, options.allowFallback);

    if (driver === "browser-playwright") {
      const result = await this.browserAssertText(sessionId, {
        pageId: app.underlyingId,
        text: options.text,
        timeoutMs: options.timeoutMs,
        label: options.label,
      });
      return this.appResult(app, driver, "app.assert_text", result.success, result.details);
    }
    if (driver === "tauri-webdriver") {
      const result = await this.tauriAssertText(sessionId, {
        appId: app.underlyingId,
        text: options.text,
        timeoutMs: options.timeoutMs,
        label: options.label,
      });
      return this.appResult(
        app,
        driver,
        "app.assert_text",
        result.success,
        result.details,
        result.warnings,
      );
    }
    if (driver === "electron-playwright") {
      const result = await this.electronAssertText(sessionId, {
        appId: app.underlyingId,
        text: options.text,
        timeoutMs: options.timeoutMs,
        label: options.label,
      });
      return this.appResult(
        app,
        driver,
        "app.assert_text",
        result.success,
        result.details,
        result.warnings,
      );
    }

    return this.unsupportedAppResult(
      app,
      "x11-fallback",
      "app.assert_text",
      "X11 fallback cannot assert text without OCR.",
    );
  }

  async appScreenshot(
    sessionId: SessionId,
    options: AppScreenshotOptions = {},
  ): Promise<ScreenshotResult> {
    const app = this.requireRoutedApp(sessionId, options.appId);
    const driver = this.resolveActionDriver(app, options.preferredDriver, true);
    const result =
      driver === "browser-playwright"
        ? await this.browserScreenshot(sessionId, {
            pageId: app.underlyingId,
            label: options.label,
            fullPage: options.fullPage,
          })
        : driver === "tauri-webdriver"
          ? await this.tauriScreenshot(sessionId, {
              appId: app.underlyingId,
              label: options.label,
            })
          : driver === "electron-playwright"
            ? await this.electronScreenshot(sessionId, {
                appId: app.underlyingId,
                label: options.label,
                fullPage: options.fullPage,
              })
            : await this.captureScreenshot(sessionId, {
                label: options.label,
              });

    const session = this.registry.requireManagedSession(sessionId).session;
    await this.registry.appendAction(session, "app.screenshot", "ok", {
      appId: app.appId,
      appKind: app.appKind,
      selectedDriver: driver,
      semantic: driver !== "x11-fallback",
      fallbackUsed: driver === "x11-fallback",
      path: result.path,
      sequence: result.sequence,
      label: result.label,
    });
    return result;
  }

  async closeApp(sessionId: SessionId, appId?: string): Promise<void> {
    const appIds = appId ? [appId] : [...(this.routedAppsBySession.get(sessionId) ?? [])];
    for (const id of appIds) {
      const app = this.requireRoutedApp(sessionId, id);
      if (app.underlyingKind === "browser") {
        await this.closeBrowser(sessionId, app.underlyingId);
      } else if (app.underlyingKind === "tauri") {
        await this.closeTauriApp(sessionId, app.underlyingId);
      } else if (app.underlyingKind === "electron") {
        await this.closeElectronApp(sessionId, app.underlyingId);
      }
      this.forgetRoutedApp(app);
      await this.registry.appendAction(
        this.registry.requireManagedSession(sessionId).session,
        "app.close",
        "ok",
        {
          appId: app.appId,
          selectedDriver: app.selectedDriver,
        },
      );
    }
  }

  async visualCompare(
    sessionId: SessionId,
    options: VisualCompareOptions,
  ): Promise<VisualCompareResult> {
    return await this.performVisualQa(sessionId, "compare", options);
  }

  async visualAssertChanged(
    sessionId: SessionId,
    options: VisualAssertChangedOptions,
  ): Promise<VisualCompareResult> {
    return await this.performVisualQa(sessionId, "assert-changed", {
      ...options,
      minDiffPixelRatio: options.minDiffPixelRatio,
    });
  }

  async visualAssertSimilar(
    sessionId: SessionId,
    options: VisualAssertSimilarOptions,
  ): Promise<VisualCompareResult> {
    return await this.performVisualQa(sessionId, "assert-similar", {
      ...options,
      maxDiffPixelRatio: options.maxDiffPixelRatio,
    });
  }

  async saveVisualBaseline(
    sessionId: SessionId,
    options: SaveVisualBaselineOptions,
  ): Promise<VisualBaselineRef> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);
    try {
      const baseline = await this.registry.evidenceStore.saveVisualBaseline(session, options);
      await this.registry.appendAction(session, "visual.baseline_saved", "ok", {
        name: baseline.name,
        suite: baseline.suite ?? "default",
        path: baseline.path,
        sourceScreenshotPath: this.registry.evidenceStore.toEvidenceRelativePath(
          session,
          baseline.sourceScreenshotPath,
        ),
        width: baseline.width,
        height: baseline.height,
        overwrite: options.overwrite === true,
      });
      return baseline;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "visual.baseline_saved",
        {
          name: options.name,
          suite: options.suite ?? "default",
          screenshotPath: options.screenshotPath,
          overwrite: options.overwrite === true,
        },
        error,
      );
      throw error;
    }
  }

  async listVisualBaselines(
    sessionId: SessionId,
    options: ListVisualBaselinesOptions = {},
  ): Promise<VisualBaselineRef[]> {
    const managed = this.registry.requireManagedSession(sessionId);
    return await this.registry.evidenceStore.listVisualBaselines(managed.session, options);
  }

  async compareVisualBaseline(
    sessionId: SessionId,
    options: CompareVisualBaselineOptions,
  ): Promise<VisualCompareResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);
    const suite = options.suite ?? "default";
    const baseline = await this.registry.evidenceStore.findVisualBaseline(
      session,
      options.baselineName,
      suite,
    );
    if (!baseline) {
      throw new ProcessError(`Visual baseline not found: ${suite}/${options.baselineName}`);
    }
    const screenshotPath = this.registry.evidenceStore.resolveEvidencePath(
      session,
      options.screenshotPath,
    );
    const diffPath =
      options.createDiffImage === true
        ? await this.registry.evidenceStore.getNextVisualDiffPath(
            session,
            options.label ?? "compare-baseline",
          )
        : undefined;

    try {
      const comparison = await this.visualQaService.compare({
        kind: "compare",
        beforePath: baseline.path,
        afterPath: screenshotPath,
        diffPath,
        region: options.region,
        threshold: options.threshold,
        maxDiffPixelRatio: options.maxDiffPixelRatio,
      });
      const result: VisualCompareResult = {
        sessionId,
        label: options.label,
        kind: "compare-baseline",
        baselineName: baseline.name,
        baselineSuite: baseline.suite ?? "default",
        beforePath: baseline.path,
        afterPath: screenshotPath,
        diffPath,
        region: options.region,
        width: comparison.width,
        height: comparison.height,
        comparedPixels: comparison.comparedPixels,
        diffPixels: comparison.diffPixels,
        diffPixelRatio: comparison.diffPixelRatio,
        threshold: comparison.threshold,
        maxDiffPixelRatio: comparison.maxDiffPixelRatio,
        passed: comparison.passed,
        createdAt: isoNow(),
        warnings: comparison.warnings,
      };
      await this.recordVisualResult(session, "visual.compare_baseline", result);
      return result;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "visual.compare_baseline",
        {
          baselineName: options.baselineName,
          suite,
          screenshotPath: options.screenshotPath,
          label: options.label,
          region: options.region,
        },
        error,
      );
      throw error;
    }
  }

  async getAnnotationRegion(
    sessionId: SessionId,
    options: AnnotationRegionOptions,
  ): Promise<AnnotationRegionResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    return await this.resolveAnnotationRegion(managed.session, options);
  }

  async visualAssertAnnotationChanged(
    sessionId: SessionId,
    options: VisualAssertAnnotationChangedOptions,
  ): Promise<VisualCompareResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const annotationRegion = await this.resolveAnnotationRegion(managed.session, options);
    return await this.performVisualQa(
      sessionId,
      "assert-changed",
      {
        beforePath: options.beforePath ?? annotationRegion.screenshotPath,
        afterPath: options.afterPath,
        label: options.label ?? `${options.annotationId}-changed`,
        region: annotationRegion.region,
        threshold: options.threshold,
        minDiffPixelRatio: options.minDiffPixelRatio,
        createDiffImage: options.createDiffImage,
      },
      "visual.assert_annotation_changed",
      "assert-annotation-changed",
      {
        annotationId: annotationRegion.annotationId,
        annotationNote: annotationRegion.note,
      },
    );
  }

  async visualAssertAnnotationSimilar(
    sessionId: SessionId,
    options: VisualAssertAnnotationSimilarOptions,
  ): Promise<VisualCompareResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const annotationRegion = await this.resolveAnnotationRegion(managed.session, options);
    return await this.performVisualQa(
      sessionId,
      "assert-similar",
      {
        beforePath: options.beforePath ?? annotationRegion.screenshotPath,
        afterPath: options.afterPath,
        label: options.label ?? `${options.annotationId}-similar`,
        region: annotationRegion.region,
        threshold: options.threshold,
        maxDiffPixelRatio: options.maxDiffPixelRatio,
        createDiffImage: options.createDiffImage,
      },
      "visual.assert_annotation_similar",
      "assert-annotation-similar",
      {
        annotationId: annotationRegion.annotationId,
        annotationNote: annotationRegion.note,
      },
    );
  }

  async visualAssertChangeContained(
    sessionId: SessionId,
    options: VisualAssertChangeContainedOptions,
  ): Promise<VisualChangeContainmentResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);
    const beforePath = this.registry.evidenceStore.resolveEvidencePath(session, options.beforePath);
    const afterPath = this.registry.evidenceStore.resolveEvidencePath(session, options.afterPath);
    const diffPath =
      options.createDiffImage === true
        ? await this.registry.evidenceStore.getNextVisualDiffPath(
            session,
            options.label ?? "change-contained",
          )
        : undefined;

    try {
      const containment = await this.visualQaService.assertChangeContained({
        ...options,
        beforePath,
        afterPath,
        diffPath,
      });
      const result: VisualChangeContainmentResult = {
        sessionId,
        label: options.label,
        kind: "assert-change-contained",
        beforePath,
        afterPath,
        diffPath,
        allowedRegions: containment.allowedRegions,
        width: containment.width,
        height: containment.height,
        comparedPixels: containment.comparedPixels,
        diffPixels: containment.diffPixels,
        diffPixelRatio: containment.diffPixelRatio,
        threshold: containment.threshold,
        maxOutsideDiffPixelRatio: containment.maxOutsideDiffPixelRatio,
        minInsideDiffPixelRatio: containment.minInsideDiffPixelRatio,
        insideComparedPixels: containment.insideComparedPixels,
        insideDiffPixels: containment.insideDiffPixels,
        insideDiffPixelRatio: containment.insideDiffPixelRatio,
        outsideComparedPixels: containment.outsideComparedPixels,
        outsideDiffPixels: containment.outsideDiffPixels,
        outsideDiffPixelRatio: containment.outsideDiffPixelRatio,
        containmentPassed: containment.containmentPassed,
        passed: containment.passed,
        createdAt: isoNow(),
        warnings: containment.warnings,
      };
      await this.recordVisualResult(session, "visual.assert_change_contained", result);
      return result;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "visual.assert_change_contained",
        {
          beforePath: options.beforePath,
          afterPath: options.afterPath,
          allowedRegions: options.allowedRegions,
          maxOutsideDiffPixelRatio: options.maxOutsideDiffPixelRatio,
          minInsideDiffPixelRatio: options.minInsideDiffPixelRatio,
        },
        error,
      );
      throw error;
    }
  }

  checkRegionOverlaps(options: VisualCheckRegionOverlapOptions): RectangleOverlapResult[] {
    return checkRegionOverlaps(options);
  }

  async listVisualAssertions(sessionId: SessionId): Promise<VisualCompareResult[]> {
    const managed = this.registry.requireManagedSession(sessionId);
    return await this.registry.evidenceStore.listVisualAssertions(managed.session);
  }

  getVisualDiffFilePath(sessionId: SessionId, fileName: string): string {
    const managed = this.registry.requireManagedSession(sessionId);
    return this.registry.evidenceStore.getVisualDiffFilePath(managed.session, fileName);
  }

  async getLiveObserverStatus(): Promise<LiveObserverStatus> {
    return await this.liveObserverService.status();
  }

  async startLiveObserver(
    sessionId: SessionId,
    options: StartLiveObserverOptions = {},
  ): Promise<LiveObserverRef> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const observer = await this.liveObserverService.start(session, {
        ...options,
        sessionId,
      });
      await this.registry.appendAction(session, "observer.start", "ok", {
        observerId: observer.observerId,
        host: observer.host,
        vncPort: observer.vncPort,
        webPort: observer.webPort,
        viewOnly: observer.viewOnly,
        url: observer.url,
        passwordProvided: options.password !== undefined,
        label: options.label,
        warnings: observer.warnings,
      });
      return observer;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "observer.start",
        redactObserverStartDetails(options),
        error,
      );
      throw error;
    }
  }

  async stopLiveObserver(
    sessionId: SessionId,
    observerId?: string,
  ): Promise<StopLiveObserverResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;

    try {
      const result = await this.liveObserverService.stop(sessionId, observerId);
      await this.registry.appendAction(session, "observer.stop", result.stopped ? "ok" : "failed", {
        observerId: result.observerId,
        stopped: result.stopped,
      });
      return result;
    } catch (error) {
      await this.registry.appendFailure(session, "observer.stop", { observerId }, error);
      throw error;
    }
  }

  listLiveObservers(sessionId?: SessionId): LiveObserverRef[] {
    if (sessionId) {
      this.registry.requireManagedSession(sessionId);
    }
    return this.liveObserverService.list(sessionId);
  }

  async stopSession(sessionId: SessionId): Promise<void> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;

    if (session.status === "stopped") {
      return;
    }

    this.registry.updateManagedSession(managed, { status: "stopping" });
    await this.registry.evidenceStore.writeSession(managed.session);

    const cleanupErrors: string[] = [];

    try {
      await this.closeRoutedAppResources(session.id, session);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }

    try {
      await this.liveObserverService.stopAll(session.id);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }

    try {
      await this.tauriDriver.closeAll(session.id);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }

    try {
      await this.electronDriver.closeAll(session.id);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }

    try {
      await this.browserDriver.closeAll(session.id);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }

    for (const appProcess of [...managed.appProcesses].reverse()) {
      try {
        await terminateProcessTree(appProcess);
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
    }

    try {
      await terminateProcessTree(managed.windowManagerProcess);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }

    try {
      await terminateProcessTree(managed.xvfbProcess);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    } finally {
      if (!managed.displayReleased) {
        this.registry.displayAllocator.release(session.displayNumber);
        managed.displayReleased = true;
      }
    }

    const stoppedSession = this.registry.updateManagedSession(managed, {
      status: cleanupErrors.length === 0 ? "stopped" : "failed",
      stoppedAt: now(),
      warnings: [...managed.session.warnings, ...cleanupErrors],
    });

    await this.registry.appendAction(
      stoppedSession,
      "session.stopped",
      cleanupErrors.length === 0 ? "ok" : "failed",
      {
        display: stoppedSession.display,
        processIds: stoppedSession.processIds,
      },
      cleanupErrors.length > 0 ? new Error(cleanupErrors.join("; ")) : undefined,
    );
    await this.registry.evidenceStore.writeSession(stoppedSession);
    await this.registry.evidenceStore.writeReport(stoppedSession);

    if (cleanupErrors.length > 0) {
      throw new ProcessError(`Session cleanup failed: ${cleanupErrors.join("; ")}`);
    }
  }

  async listScreenshots(sessionId: SessionId): Promise<ScreenshotArtifact[]> {
    const managed = this.registry.requireManagedSession(sessionId);
    return await this.registry.evidenceStore.listScreenshots(managed.session);
  }

  getScreenshotFilePath(sessionId: SessionId, fileName: string): string {
    const managed = this.registry.requireManagedSession(sessionId);
    return this.registry.evidenceStore.getScreenshotFilePath(managed.session, fileName);
  }

  getAnnotationFilePath(sessionId: SessionId, fileName: string): string {
    const managed = this.registry.requireManagedSession(sessionId);
    return this.registry.evidenceStore.getAnnotationFilePath(managed.session, fileName);
  }

  async createAnnotation(
    sessionId: SessionId,
    input: CreateAnnotationInput,
  ): Promise<ScreenshotAnnotation> {
    const managed = this.registry.requireManagedSession(sessionId);
    const annotation = await this.registry.evidenceStore.createAnnotation(managed.session, input);
    await this.registry.appendAction(managed.session, "annotation.created", "ok", {
      annotationId: annotation.id,
      screenshotFileName: annotation.screenshotFileName,
      type: annotation.type,
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
      x2: annotation.x2,
      y2: annotation.y2,
      hasCrop: annotation.cropPath !== undefined,
    });
    return annotation;
  }

  async listAnnotations(sessionId: SessionId): Promise<ScreenshotAnnotation[]> {
    const managed = this.registry.requireManagedSession(sessionId);
    return await this.registry.evidenceStore.listAnnotations(managed.session);
  }

  async getVisualHandoff(sessionId: SessionId): Promise<VisualHandoff> {
    const managed = this.registry.requireManagedSession(sessionId);
    return await this.registry.evidenceStore.getVisualHandoff(managed.session);
  }

  async regenerateVisualHandoff(sessionId: SessionId): Promise<VisualHandoff> {
    const managed = this.registry.requireManagedSession(sessionId);
    return await this.registry.evidenceStore.regenerateVisualHandoff(managed.session);
  }

  getSession(sessionId: SessionId): DesktopSession | undefined {
    return this.registry.getSession(sessionId);
  }

  listSessions(): DesktopSession[] {
    return this.registry.listSessions();
  }

  async start(config: SessionConfig): Promise<DesktopSession> {
    return await this.createSession(config);
  }

  async stop(sessionId: SessionId): Promise<void> {
    await this.stopSession(sessionId);
  }

  get(sessionId: SessionId): DesktopSession | undefined {
    return this.getSession(sessionId);
  }

  private async performInputAction(
    sessionId: SessionId,
    type: Extract<ActionLogRecord["type"], `input.${string}`>,
    details: Readonly<Record<string, unknown>>,
    action: (session: DesktopSession) => Promise<InputActionResult>,
  ): Promise<InputActionResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const result = await action(session);
      await this.registry.appendAction(session, type, "ok", details);
      return result;
    } catch (error) {
      await this.registry.appendFailure(session, type, details, error);
      throw error;
    }
  }

  private async performTauriAction(
    sessionId: SessionId,
    type: Extract<ActionLogRecord["type"], `tauri.${string}`>,
    details: Readonly<Record<string, unknown>>,
    action: (session: DesktopSession) => Promise<TauriActionResult>,
    secretValue?: string,
  ): Promise<TauriActionResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const result = await action(session);
      await this.registry.appendAction(session, type, result.success ? "ok" : "failed", {
        ...details,
        mode: result.mode,
        success: result.success,
        warnings: result.warnings,
      });
      return result;
    } catch (error) {
      const safeError = secretValue ? redactErrorMessage(error, secretValue) : error;
      await this.registry.appendFailure(session, type, details, safeError);
      throw safeError;
    }
  }

  private async performElectronAction(
    sessionId: SessionId,
    type: Extract<ActionLogRecord["type"], `electron.${string}`>,
    details: Readonly<Record<string, unknown>>,
    action: (session: DesktopSession) => Promise<ElectronActionResult>,
    secretValue?: string,
  ): Promise<ElectronActionResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const result = await action(session);
      await this.registry.appendAction(session, type, result.success ? "ok" : "failed", {
        ...details,
        mode: result.mode,
        success: result.success,
        warnings: result.warnings,
      });
      return result;
    } catch (error) {
      const safeError = secretValue ? redactErrorMessage(error, secretValue) : error;
      await this.registry.appendFailure(session, type, details, safeError);
      throw safeError;
    }
  }

  private async openAppWithDecision(
    sessionId: SessionId,
    options: AppOpenOptions,
    decision: DriverRouteDecision,
  ): Promise<ManagedRoutedApp> {
    if (decision.selectedDriver === "browser-playwright") {
      if (!options.url) {
        throw new ProcessError("openApp with browser-playwright requires url.");
      }
      const page = await this.openBrowser(sessionId, {
        url: options.url,
        browserExecutablePath: options.browserExecutablePath,
        browserName: options.browserName,
        viewport: options.viewport,
        label: options.label,
        timeoutMs: options.timeoutMs,
      });
      return {
        sessionId,
        appId: randomUUID(),
        appKind: options.appKind,
        selectedDriver: "browser-playwright",
        semantic: true,
        fallbackUsed: false,
        createdAt: page.createdAt,
        warnings: decision.warnings,
        underlyingId: page.pageId,
        underlyingKind: "browser",
      };
    }

    if (decision.selectedDriver === "tauri-webdriver") {
      const command = requireOpenCommand(options, "Tauri");
      const app = await this.openTauriApp(sessionId, {
        command,
        args: options.args ?? [],
        cwd: options.cwd,
        env: options.env,
        label: options.label,
        timeoutMs: options.timeoutMs,
        windowTitleIncludes: options.windowTitleIncludes,
        applicationPath: options.appPath,
      });
      if (options.requireSemantic === true && app.mode !== "webdriver") {
        await this.closeTauriApp(sessionId, app.appId).catch(() => undefined);
        throw new ProcessError(
          "openApp required semantic Tauri WebDriver mode, but the Tauri app opened in X11 fallback mode.",
        );
      }
      return {
        sessionId,
        appId: randomUUID(),
        appKind: options.appKind,
        selectedDriver: app.mode === "webdriver" ? "tauri-webdriver" : "x11-fallback",
        semantic: app.mode === "webdriver",
        fallbackUsed: app.mode !== "webdriver",
        createdAt: app.createdAt,
        processId: app.processId,
        warnings: [...decision.warnings, ...(app.warnings ?? [])],
        underlyingId: app.appId,
        underlyingKind: "tauri",
      };
    }

    if (decision.selectedDriver === "electron-playwright") {
      const app = await this.openElectronApp(sessionId, {
        command: options.command,
        args: options.args ?? [],
        cwd: options.cwd,
        env: options.env,
        executablePath: options.executablePath,
        appPath: options.appPath,
        label: options.label,
        timeoutMs: options.timeoutMs,
        windowTitleIncludes: options.windowTitleIncludes,
        excludeDevtools: options.excludeDevtools,
      });
      if (options.requireSemantic === true && app.mode !== "playwright-electron") {
        await this.closeElectronApp(sessionId, app.appId).catch(() => undefined);
        throw new ProcessError(
          "openApp required semantic Electron mode, but the Electron app opened in X11 fallback mode.",
        );
      }
      return {
        sessionId,
        appId: randomUUID(),
        appKind: options.appKind,
        selectedDriver: app.mode === "playwright-electron" ? "electron-playwright" : "x11-fallback",
        semantic: app.mode === "playwright-electron",
        fallbackUsed: app.mode !== "playwright-electron",
        createdAt: app.createdAt,
        processId: app.processId,
        warnings: [...decision.warnings, ...(app.warnings ?? [])],
        underlyingId: app.appId,
        underlyingKind: "electron",
      };
    }

    const command = requireOpenCommand(options, "X11 fallback");
    const launch = await this.launchApp(sessionId, {
      command,
      args: options.args ?? [],
      cwd: options.cwd,
      env: options.env,
    });
    return {
      sessionId,
      appId: randomUUID(),
      appKind: options.appKind,
      selectedDriver: "x11-fallback",
      semantic: false,
      fallbackUsed: decision.fallbackUsed,
      createdAt: launch.startedAt.toISOString(),
      processId: launch.processId,
      warnings: decision.warnings,
      underlyingKind: "x11",
    };
  }

  private rememberRoutedApp(app: ManagedRoutedApp): void {
    this.routedApps.set(app.appId, app);
    const appIds = this.routedAppsBySession.get(app.sessionId) ?? new Set<string>();
    appIds.add(app.appId);
    this.routedAppsBySession.set(app.sessionId, appIds);
    this.lastRoutedAppBySession.set(app.sessionId, app.appId);
  }

  private forgetRoutedApp(app: ManagedRoutedApp): void {
    this.routedApps.delete(app.appId);
    const appIds = this.routedAppsBySession.get(app.sessionId);
    appIds?.delete(app.appId);
    if (appIds && appIds.size === 0) {
      this.routedAppsBySession.delete(app.sessionId);
    }
    if (this.lastRoutedAppBySession.get(app.sessionId) === app.appId) {
      const replacement = [...(appIds ?? [])].at(-1);
      if (replacement) {
        this.lastRoutedAppBySession.set(app.sessionId, replacement);
      } else {
        this.lastRoutedAppBySession.delete(app.sessionId);
      }
    }
  }

  private requireRoutedApp(sessionId: SessionId, appId?: string): ManagedRoutedApp {
    const resolvedAppId = appId ?? this.lastRoutedAppBySession.get(sessionId);
    if (!resolvedAppId) {
      throw new ProcessError(`No routed app is open for session ${sessionId}.`);
    }
    const app = this.routedApps.get(resolvedAppId);
    if (!app || app.sessionId !== sessionId) {
      throw new ProcessError(`Routed app was not found: ${resolvedAppId}`);
    }
    return app;
  }

  private resolveActionDriver(
    app: ManagedRoutedApp,
    preferredDriver: RoutedDriverKind | undefined,
    allowFallback = true,
  ): RoutedDriverKind {
    if (!preferredDriver || preferredDriver === app.selectedDriver) {
      return app.selectedDriver;
    }
    if (preferredDriver === "x11-fallback" && allowFallback) {
      return "x11-fallback";
    }
    throw new ProcessError(
      `App ${app.appId} was opened with ${app.selectedDriver}; cannot use preferred driver ${preferredDriver}.`,
    );
  }

  private async appResult(
    app: ManagedRoutedApp,
    selectedDriver: RoutedDriverKind,
    actionType: string,
    success: boolean,
    details: Readonly<Record<string, unknown>> | undefined = undefined,
    warnings: readonly string[] | undefined = undefined,
  ): Promise<AppActionResult> {
    const result: AppActionResult = {
      sessionId: app.sessionId,
      appId: app.appId,
      appKind: app.appKind,
      selectedDriver,
      semantic: selectedDriver !== "x11-fallback",
      fallbackUsed: selectedDriver === "x11-fallback" || app.fallbackUsed,
      actionType,
      success,
      createdAt: isoNow(),
      warnings: warnings ?? app.warnings,
      details,
    };
    const session = this.registry.requireManagedSession(app.sessionId).session;
    await this.registry.appendAction(
      session,
      actionType as ActionLogRecord["type"],
      success ? "ok" : "failed",
      {
        appId: result.appId,
        appKind: result.appKind,
        selectedDriver: result.selectedDriver,
        semantic: result.semantic,
        fallbackUsed: result.fallbackUsed,
        warnings: result.warnings,
        details: result.details,
      },
    );
    return result;
  }

  private async unsupportedAppResult(
    app: ManagedRoutedApp,
    selectedDriver: RoutedDriverKind,
    actionType: string,
    reason: string,
  ): Promise<AppActionResult> {
    return await this.appResult(
      app,
      selectedDriver,
      actionType,
      false,
      {
        unsupported: true,
        reason,
      },
      [...app.warnings, reason],
    );
  }

  private async closeRoutedAppResources(
    sessionId: SessionId,
    session: DesktopSession,
  ): Promise<void> {
    const appIds = [...(this.routedAppsBySession.get(sessionId) ?? [])];
    const errors: string[] = [];
    for (const appId of appIds) {
      const app = this.routedApps.get(appId);
      if (!app) {
        continue;
      }
      try {
        if (app.underlyingKind === "browser") {
          await this.browserDriver.close(session, app.underlyingId);
        } else if (app.underlyingKind === "tauri") {
          await this.tauriDriver.close(session, app.underlyingId);
        } else if (app.underlyingKind === "electron") {
          await this.electronDriver.close(session, app.underlyingId);
        }
        this.forgetRoutedApp(app);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (errors.length > 0) {
      throw new ProcessError(`Routed app cleanup failed: ${errors.join("; ")}`);
    }
  }

  private async performVisualQa(
    sessionId: SessionId,
    kind: VisualAssertionKind,
    options: VisualCompareOptions & {
      readonly minDiffPixelRatio?: number;
    },
    actionTypeOverride?: Extract<ActionLogRecord["type"], `visual.${string}`>,
    resultKindOverride?: VisualAssertionKind,
    extraResult: Partial<VisualCompareResult> = {},
  ): Promise<VisualCompareResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    const actionType =
      actionTypeOverride ??
      (kind === "assert-changed"
        ? "visual.assert_changed"
        : kind === "assert-similar"
          ? "visual.assert_similar"
          : "visual.compare");
    const beforePath = this.registry.evidenceStore.resolveEvidencePath(session, options.beforePath);
    const afterPath = this.registry.evidenceStore.resolveEvidencePath(session, options.afterPath);
    const diffPath =
      options.createDiffImage === true
        ? await this.registry.evidenceStore.getNextVisualDiffPath(session, options.label ?? kind)
        : undefined;

    try {
      const comparison = await this.visualQaService.compare({
        kind,
        beforePath,
        afterPath,
        diffPath,
        region: options.region,
        threshold: options.threshold,
        minDiffPixelRatio: options.minDiffPixelRatio,
        maxDiffPixelRatio: options.maxDiffPixelRatio,
      });
      const result: VisualCompareResult = {
        sessionId,
        label: options.label,
        kind: resultKindOverride ?? kind,
        ...extraResult,
        beforePath,
        afterPath,
        diffPath,
        region: options.region,
        width: comparison.width,
        height: comparison.height,
        comparedPixels: comparison.comparedPixels,
        diffPixels: comparison.diffPixels,
        diffPixelRatio: comparison.diffPixelRatio,
        threshold: comparison.threshold,
        minDiffPixelRatio: comparison.minDiffPixelRatio,
        maxDiffPixelRatio: comparison.maxDiffPixelRatio,
        passed: comparison.passed,
        createdAt: isoNow(),
        warnings: comparison.warnings,
      };

      await this.recordVisualResult(session, actionType, result);
      return result;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        actionType,
        {
          label: options.label,
          kind,
          beforePath: options.beforePath,
          afterPath: options.afterPath,
          region: options.region,
          threshold: options.threshold,
          minDiffPixelRatio: options.minDiffPixelRatio,
          maxDiffPixelRatio: options.maxDiffPixelRatio,
          createDiffImage: options.createDiffImage === true,
        },
        error,
      );
      throw error;
    }
  }

  private async recordVisualResult(
    session: DesktopSession,
    actionType: Extract<ActionLogRecord["type"], `visual.${string}`>,
    result: VisualCompareResult,
  ): Promise<void> {
    await this.registry.evidenceStore.appendVisualAssertion(session, result);
    await this.registry.appendAction(
      session,
      actionType,
      result.passed === false ? "failed" : "ok",
      {
        label: result.label,
        kind: result.kind,
        baselineName: result.baselineName,
        baselineSuite: result.baselineSuite,
        annotationId: result.annotationId,
        beforePath: this.registry.evidenceStore.toEvidenceRelativePath(session, result.beforePath),
        afterPath: this.registry.evidenceStore.toEvidenceRelativePath(session, result.afterPath),
        diffPath: result.diffPath
          ? this.registry.evidenceStore.toEvidenceRelativePath(session, result.diffPath)
          : undefined,
        region: result.region,
        allowedRegions: result.allowedRegions,
        width: result.width,
        height: result.height,
        comparedPixels: result.comparedPixels,
        diffPixels: result.diffPixels,
        diffPixelRatio: result.diffPixelRatio,
        threshold: result.threshold,
        minDiffPixelRatio: result.minDiffPixelRatio,
        maxDiffPixelRatio: result.maxDiffPixelRatio,
        maxOutsideDiffPixelRatio: result.maxOutsideDiffPixelRatio,
        minInsideDiffPixelRatio: result.minInsideDiffPixelRatio,
        insideDiffPixelRatio: result.insideDiffPixelRatio,
        outsideDiffPixelRatio: result.outsideDiffPixelRatio,
        containmentPassed: result.containmentPassed,
        passed: result.passed,
        warnings: result.warnings,
      },
    );
  }

  private async resolveAnnotationRegion(
    session: DesktopSession,
    options: AnnotationRegionOptions,
  ): Promise<AnnotationRegionResult> {
    const annotation = (await this.registry.evidenceStore.listAnnotations(session)).find(
      (item) => item.id === options.annotationId,
    );
    if (!annotation) {
      throw new ProcessError(`Annotation not found: ${options.annotationId}`);
    }
    if (
      annotation.type !== "rectangle" ||
      annotation.width === undefined ||
      annotation.height === undefined
    ) {
      throw new ProcessError(`Annotation ${options.annotationId} is not a rectangle annotation.`);
    }
    const padding = options.padding ?? 0;
    if (!Number.isFinite(padding) || padding < 0) {
      throw new ProcessError("Annotation region padding must be a non-negative finite number.");
    }
    const size = await readPngSize(annotation.screenshotPath);
    const region = clampImageRegion(
      {
        x: annotation.x - padding,
        y: annotation.y - padding,
        width: annotation.width + padding * 2,
        height: annotation.height + padding * 2,
      },
      size.width,
      size.height,
    );
    return {
      annotationId: annotation.id,
      region,
      screenshotPath: annotation.screenshotPath,
      note: annotation.note,
    };
  }

  private requireManagedSession(sessionId: SessionId): ManagedSession {
    const managed = this.registry.sessions.get(sessionId);
    if (!managed) {
      throw new SessionNotFoundError(sessionId);
    }
    return managed;
  }

  private updateManagedSession(
    managed: ManagedSession,
    patch: Partial<DesktopSession>,
  ): DesktopSession {
    managed.session = {
      ...managed.session,
      ...patch,
    };
    return managed.session;
  }

  private ensureRunning(session: DesktopSession): void {
    if (session.status !== "running") {
      throw new ProcessError(`Session ${session.id} is not running; status is ${session.status}.`);
    }
  }

  private async appendAction(
    session: DesktopSession,
    type: ActionLogRecord["type"],
    status: ActionLogRecord["status"],
    details?: Readonly<Record<string, unknown>>,
    error?: unknown,
  ): Promise<void> {
    await this.registry.evidenceStore.appendAction(session, {
      timestamp: isoNow(),
      sessionId: session.id,
      type,
      status,
      details,
      errorMessage: error instanceof Error ? error.message : undefined,
    });
  }

  private async appendFailure(
    session: DesktopSession,
    type: ActionLogRecord["type"],
    details: Readonly<Record<string, unknown>>,
    error: unknown,
  ): Promise<void> {
    await this.registry.appendAction(session, type, "failed", details, error);
    await this.registry.appendAction(
      session,
      "error",
      "failed",
      {
        phase: type,
        ...details,
      },
      error,
    );
  }
}

export interface ScreenshotFingerprint {
  readonly size: number;
  readonly hash?: string;
}

async function fingerprintScreenshot(
  path: string,
  mode: NonNullable<WaitForStableScreenOptions["mode"]>,
): Promise<ScreenshotFingerprint> {
  const size = await fileSize(path);
  return mode === "hash"
    ? {
        size,
        hash: await hashFile(path),
      }
    : { size };
}

export function fingerprintsMatch(
  left: ScreenshotFingerprint,
  right: ScreenshotFingerprint,
  mode: NonNullable<WaitForStableScreenOptions["mode"]> = "hash",
  fileSizeToleranceBytes = 0,
): boolean {
  if (mode === "tolerant") {
    return Math.abs(left.size - right.size) <= fileSizeToleranceBytes;
  }

  if (mode === "fileSize") {
    return left.size === right.size;
  }

  return left.size === right.size && left.hash === right.hash;
}

async function applyStableScreenshotRetention(
  evidenceStore: EvidenceStore,
  session: DesktopSession,
  retainedScreenshots: ScreenshotResult[],
  maxRetainedScreenshots: number | undefined,
): Promise<number> {
  if (maxRetainedScreenshots === undefined) {
    return 0;
  }

  let discarded = 0;
  while (retainedScreenshots.length > maxRetainedScreenshots) {
    const screenshot = retainedScreenshots.shift();
    if (!screenshot) {
      break;
    }
    await evidenceStore.moveScreenshotToTransient(session, screenshot);
    discarded += 1;
  }

  return discarded;
}

function stableScreenActionDetails(
  result: WaitForStableScreenResult,
): Readonly<Record<string, unknown>> {
  return {
    stable: result.stable,
    checks: result.checks,
    elapsedMs: result.elapsedMs,
    mode: result.mode,
    retainedScreenshots: result.retainedScreenshots?.map((screenshot) => screenshot.path),
    discardedScreenshotCount: result.discardedScreenshotCount,
    lastScreenshot: result.lastScreenshot?.path,
    reason: result.reason,
  };
}

function toAppRef(app: ManagedRoutedApp): AppRef {
  return {
    sessionId: app.sessionId,
    appId: app.appId,
    appKind: app.appKind,
    selectedDriver: app.selectedDriver,
    semantic: app.semantic,
    fallbackUsed: app.fallbackUsed,
    createdAt: app.createdAt,
    processId: app.processId,
    warnings: app.warnings,
  };
}

function requireOpenCommand(options: AppOpenOptions, label: string): string {
  if (!options.command) {
    throw new ProcessError(`openApp using ${label} requires command.`);
  }
  return options.command;
}

function semanticTargetForApp(
  options: Readonly<{
    selector?: string;
    text?: string;
    role?: string;
    name?: string;
    label?: string;
    placeholder?: string;
    testId?: string;
  }>,
): {
  readonly selector?: string;
  readonly text?: string;
  readonly role?: string;
  readonly name?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly testId?: string;
} {
  const hasTargetOtherThanLabel =
    options.selector !== undefined ||
    options.text !== undefined ||
    options.role !== undefined ||
    options.placeholder !== undefined ||
    options.testId !== undefined;

  return {
    selector: options.selector,
    text: options.text,
    role: options.role,
    name: options.name,
    label: hasTargetOtherThanLabel ? undefined : options.label,
    placeholder: options.placeholder,
    testId: options.testId,
  };
}

function browserTargetDetails(
  target: Readonly<{
    selector?: string;
    text?: string;
    role?: string;
    name?: string;
    label?: string;
    placeholder?: string;
    testId?: string;
  }>,
): Readonly<Record<string, unknown>> {
  return {
    selector: target.selector,
    text: target.text,
    role: target.role,
    name: target.name,
    targetLabel: target.label,
    placeholder: target.placeholder,
    testId: target.testId,
  };
}

function redactErrorMessage(error: unknown, secretValue: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new ProcessError(message.split(secretValue).join("[redacted]"), error);
}

function truncateForLog(value: string): string {
  return value.length > 256 ? `${value.slice(0, 256)}...` : value;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
