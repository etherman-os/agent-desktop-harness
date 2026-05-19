import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  BrowserActionResult,
  BrowserAssertTextOptions,
  BrowserClickOptions,
  BrowserFillOptions,
  BrowserOpenOptions,
  BrowserPageRef,
  BrowserPressOptions,
  BrowserScreenshotOptions,
  AppActionResult,
  AppAssertTextOptions,
  AppClickOptions,
  AppFillOptions,
  AppOpenOptions,
  AppPressOptions,
  AppRef,
  AppScreenshotOptions,
  CreateAnnotationInput,
  DesktopSession,
  DriverRouteDecision,
  DriverRouteRequest,
  DriverRouterStatus,
  ElectronActionResult,
  ElectronAppRef,
  ElectronAssertTextOptions,
  ElectronClickOptions,
  ElectronDriverStatus,
  ElectronFillOptions,
  ElectronOpenOptions,
  ElectronPressOptions,
  ElectronScreenshotOptions,
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
  TauriAssertTextOptions,
  TauriClickOptions,
  TauriDriverStatus,
  TauriFillOptions,
  TauriOpenOptions,
  TauriScreenshotOptions,
  AnnotationRegionOptions,
  AnnotationRegionResult,
  CompareVisualBaselineOptions,
  ListVisualBaselinesOptions,
  SaveVisualBaselineOptions,
  VisualAssertAnnotationChangedOptions,
  VisualAssertAnnotationSimilarOptions,
  VisualAssertChangedOptions,
  VisualAssertChangeContainedOptions,
  VisualAssertSimilarOptions,
  VisualBaselineRef,
  VisualChangeContainmentResult,
  VisualCompareOptions,
  VisualCompareResult,
  VisualHandoff,
  WaitForStableScreenResult,
  WaitForWindowOptions,
  WindowActionResult,
  WindowInfo
} from "@agent-desktop-harness/core";
import { SessionManager } from "@agent-desktop-harness/core";
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
  electronAssertTextSchema,
  electronClickSchema,
  electronCloseSchema,
  electronFillSchema,
  electronOpenSchema,
  electronPressSchema,
  electronScreenshotSchema,
  driverRouteSchema,
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
  waitForStableScreenSchema,
  waitForWindowSchema,
  visualAssertAnnotationChangedSchema,
  visualAssertAnnotationSimilarSchema,
  visualAssertChangedSchema,
  visualAssertChangeContainedSchema,
  visualAssertSimilarSchema,
  visualCompareBaselineSchema,
  visualCompareSchema,
  visualListBaselinesSchema,
  visualSaveBaselineSchema
} from "./schemas.js";

export interface SessionManagerLike {
  createSession(config: SessionConfig): Promise<DesktopSession>;
  listSessions(): DesktopSession[];
  getSession(sessionId: SessionId): DesktopSession | undefined;
  launchApp(sessionId: SessionId, launch: {
    command: string;
    args?: readonly string[];
    cwd?: string;
    env?: Readonly<Record<string, string>>;
  }): Promise<LaunchResult>;
  captureScreenshot(sessionId: SessionId, options?: {
    label?: string;
  }): Promise<ScreenshotResult>;
  click(sessionId: SessionId, action: {
    x: number;
    y: number;
    button?: "left" | "right" | "middle";
    label?: string;
  }): Promise<InputActionResult>;
  doubleClick(sessionId: SessionId, action: {
    x: number;
    y: number;
    button?: "left" | "right" | "middle";
    label?: string;
  }): Promise<InputActionResult>;
  typeText(sessionId: SessionId, action: {
    text: string;
    secret?: boolean;
    label?: string;
  }): Promise<InputActionResult>;
  hotkey(sessionId: SessionId, action: {
    keys: readonly string[];
    label?: string;
  }): Promise<InputActionResult>;
  scroll(sessionId: SessionId, action: {
    direction: "up" | "down" | "left" | "right";
    amount?: number;
    x?: number;
    y?: number;
    label?: string;
  }): Promise<InputActionResult>;
  getWindows(sessionId: SessionId): Promise<WindowInfo[]>;
  focusWindow(sessionId: SessionId, target: {
    id?: string;
    title?: string;
    titleIncludes?: string;
    titleExcludes?: readonly string[];
    pid?: number;
    preferLargest?: boolean;
    excludeDevtools?: boolean;
  }): Promise<WindowActionResult>;
  waitForStableScreen(sessionId: SessionId, options?: {
    timeoutMs?: number;
    intervalMs?: number;
    stableChecks?: number;
    label?: string;
    mode?: "hash" | "fileSize" | "tolerant";
    fileSizeToleranceBytes?: number;
    maxRetainedScreenshots?: number;
    retainOnlyLast?: boolean;
  }): Promise<WaitForStableScreenResult>;
  waitForWindow(sessionId: SessionId, options?: WaitForWindowOptions): Promise<WindowInfo>;
  openBrowser(sessionId: SessionId, options: BrowserOpenOptions): Promise<BrowserPageRef>;
  browserClick(sessionId: SessionId, options: BrowserClickOptions): Promise<BrowserActionResult>;
  browserFill(sessionId: SessionId, options: BrowserFillOptions): Promise<BrowserActionResult>;
  browserPress(sessionId: SessionId, options: BrowserPressOptions): Promise<BrowserActionResult>;
  browserAssertText(
    sessionId: SessionId,
    options: BrowserAssertTextOptions
  ): Promise<BrowserActionResult>;
  browserScreenshot(
    sessionId: SessionId,
    options?: BrowserScreenshotOptions
  ): Promise<ScreenshotResult>;
  closeBrowser(sessionId: SessionId, pageId?: string): Promise<void>;
  getTauriDriverStatus(): Promise<TauriDriverStatus>;
  openTauriApp(sessionId: SessionId, options: TauriOpenOptions): Promise<TauriAppRef>;
  tauriClick(sessionId: SessionId, options: TauriClickOptions): Promise<TauriActionResult>;
  tauriFill(sessionId: SessionId, options: TauriFillOptions): Promise<TauriActionResult>;
  tauriAssertText(
    sessionId: SessionId,
    options: TauriAssertTextOptions
  ): Promise<TauriActionResult>;
  tauriScreenshot(
    sessionId: SessionId,
    options?: TauriScreenshotOptions
  ): Promise<ScreenshotResult>;
  closeTauriApp(sessionId: SessionId, appId?: string): Promise<void>;
  getElectronDriverStatus(): Promise<ElectronDriverStatus>;
  openElectronApp(sessionId: SessionId, options: ElectronOpenOptions): Promise<ElectronAppRef>;
  electronClick(sessionId: SessionId, options: ElectronClickOptions): Promise<ElectronActionResult>;
  electronFill(sessionId: SessionId, options: ElectronFillOptions): Promise<ElectronActionResult>;
  electronPress(sessionId: SessionId, options: ElectronPressOptions): Promise<ElectronActionResult>;
  electronAssertText(
    sessionId: SessionId,
    options: ElectronAssertTextOptions
  ): Promise<ElectronActionResult>;
  electronScreenshot(
    sessionId: SessionId,
    options?: ElectronScreenshotOptions
  ): Promise<ScreenshotResult>;
  closeElectronApp(sessionId: SessionId, appId?: string): Promise<void>;
  getLiveObserverStatus(): Promise<LiveObserverStatus>;
  startLiveObserver(sessionId: SessionId, options?: {
    sessionId?: SessionId;
    host?: string;
    vncPort?: number;
    webPort?: number;
    viewOnly?: boolean;
    password?: string;
    label?: string;
  }): Promise<LiveObserverRef>;
  stopLiveObserver(sessionId: SessionId, observerId?: string): Promise<{
    readonly sessionId: SessionId;
    readonly observerId: string;
    readonly stopped: boolean;
  }>;
  listLiveObservers(sessionId?: SessionId): LiveObserverRef[];
  getDriverRouterStatus(): Promise<DriverRouterStatus>;
  routeDriver(sessionId: SessionId, request: DriverRouteRequest): Promise<DriverRouteDecision>;
  openApp(sessionId: SessionId, options: AppOpenOptions): Promise<AppRef>;
  appClick(sessionId: SessionId, options: AppClickOptions): Promise<AppActionResult>;
  appFill(sessionId: SessionId, options: AppFillOptions): Promise<AppActionResult>;
  appPress(sessionId: SessionId, options: AppPressOptions): Promise<AppActionResult>;
  appAssertText(
    sessionId: SessionId,
    options: AppAssertTextOptions
  ): Promise<AppActionResult>;
  appScreenshot(sessionId: SessionId, options?: AppScreenshotOptions): Promise<ScreenshotResult>;
  closeApp(sessionId: SessionId, appId?: string): Promise<void>;
  visualCompare(sessionId: SessionId, options: VisualCompareOptions): Promise<VisualCompareResult>;
  visualAssertChanged(
    sessionId: SessionId,
    options: VisualAssertChangedOptions
  ): Promise<VisualCompareResult>;
  visualAssertSimilar(
    sessionId: SessionId,
    options: VisualAssertSimilarOptions
  ): Promise<VisualCompareResult>;
  saveVisualBaseline(
    sessionId: SessionId,
    options: SaveVisualBaselineOptions
  ): Promise<VisualBaselineRef>;
  listVisualBaselines(
    sessionId: SessionId,
    options?: ListVisualBaselinesOptions
  ): Promise<VisualBaselineRef[]>;
  compareVisualBaseline(
    sessionId: SessionId,
    options: CompareVisualBaselineOptions
  ): Promise<VisualCompareResult>;
  getAnnotationRegion(
    sessionId: SessionId,
    options: AnnotationRegionOptions
  ): Promise<AnnotationRegionResult>;
  visualAssertAnnotationChanged(
    sessionId: SessionId,
    options: VisualAssertAnnotationChangedOptions
  ): Promise<VisualCompareResult>;
  visualAssertAnnotationSimilar(
    sessionId: SessionId,
    options: VisualAssertAnnotationSimilarOptions
  ): Promise<VisualCompareResult>;
  visualAssertChangeContained(
    sessionId: SessionId,
    options: VisualAssertChangeContainedOptions
  ): Promise<VisualChangeContainmentResult>;
  listVisualAssertions(sessionId: SessionId): Promise<VisualCompareResult[]>;
  listScreenshots(sessionId: SessionId): Promise<ScreenshotArtifact[]>;
  createAnnotation(
    sessionId: SessionId,
    input: CreateAnnotationInput
  ): Promise<ScreenshotAnnotation>;
  listAnnotations(sessionId: SessionId): Promise<ScreenshotAnnotation[]>;
  getVisualHandoff(sessionId: SessionId): Promise<VisualHandoff>;
  stopSession(sessionId: SessionId): Promise<void>;
}

export class DesktopMcpToolHandlers {
  constructor(
    private readonly sessionManager: SessionManagerLike = new SessionManager(),
    private readonly defaultWorkspaceDir: string = process.cwd()
  ) {}

  async startSession(input: unknown): Promise<unknown> {
    const args = startSessionSchema.parse(input);
    const workspacePath = resolve(args.workspaceDir ?? this.defaultWorkspaceDir);
    const session = await this.sessionManager.createSession({
      name: args.name,
      workspacePath,
      display: {
        width: args.width,
        height: args.height,
        depth: args.depth
      },
      policy: args.policy
    });

    return serializeSession(session);
  }

  listSessions(input: unknown): unknown {
    noArgsSchema.parse(input);
    return {
      sessions: this.sessionManager.listSessions().map(serializeSession)
    };
  }

  getSession(input: unknown): unknown {
    const args = sessionIdSchema.parse(input);
    return serializeSession(this.requireSession(args.sessionId));
  }

  async launchApp(input: unknown): Promise<unknown> {
    const args = launchAppSchema.parse(input);
    this.requireSession(args.sessionId);
    const result = await this.sessionManager.launchApp(args.sessionId, {
      command: args.command,
      args: args.args ?? [],
      cwd: args.cwd,
      env: args.env
    });

    return {
      ...serializeLaunchResult(result),
      label: args.label
    };
  }

  async screenshot(input: unknown): Promise<unknown> {
    const args = screenshotSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeScreenshot(
      await this.sessionManager.captureScreenshot(args.sessionId, {
        label: args.label
      })
    );
  }

  async click(input: unknown): Promise<unknown> {
    const args = clickSchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.click(args.sessionId, {
      x: args.x,
      y: args.y,
      button: args.button,
      label: args.label
    });
  }

  async doubleClick(input: unknown): Promise<unknown> {
    const args = clickSchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.doubleClick(args.sessionId, {
      x: args.x,
      y: args.y,
      button: args.button,
      label: args.label
    });
  }

  async typeText(input: unknown): Promise<unknown> {
    const args = typeTextSchema.parse(input);
    this.requireSession(args.sessionId);

    try {
      const result = await this.sessionManager.typeText(args.sessionId, {
        text: args.text,
        secret: args.secret,
        label: args.label
      });
      return args.secret ? redactTypeTextResult(result, args.text.length) : result;
    } catch (error) {
      if (args.secret) {
        throw new Error(redactErrorMessage(error, args.text));
      }
      throw error;
    }
  }

  async hotkey(input: unknown): Promise<unknown> {
    const args = hotkeySchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.hotkey(args.sessionId, {
      keys: args.keys,
      label: args.label
    });
  }

  async scroll(input: unknown): Promise<unknown> {
    const args = scrollSchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.scroll(args.sessionId, {
      direction: args.direction,
      amount: args.amount,
      x: args.x,
      y: args.y,
      label: args.label
    });
  }

  async getWindows(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    return {
      windows: await this.sessionManager.getWindows(args.sessionId)
    };
  }

  async focusWindow(input: unknown): Promise<unknown> {
    const args = focusWindowSchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.focusWindow(args.sessionId, {
      id: args.id,
      title: args.title,
      titleIncludes: args.titleIncludes,
      titleExcludes: args.titleExcludes,
      pid: args.pid,
      preferLargest: args.preferLargest,
      excludeDevtools: args.excludeDevtools
    });
  }

  async waitForStableScreen(input: unknown): Promise<unknown> {
    const args = waitForStableScreenSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeWaitForStableScreenResult(
      await this.sessionManager.waitForStableScreen(args.sessionId, {
        timeoutMs: args.timeoutMs,
        intervalMs: args.intervalMs,
        stableChecks: args.stableChecks,
        label: args.label,
        mode: args.mode,
        fileSizeToleranceBytes: args.fileSizeToleranceBytes,
        maxRetainedScreenshots: args.maxRetainedScreenshots,
        retainOnlyLast: args.retainOnlyLast
      })
    );
  }

  async waitForWindow(input: unknown): Promise<unknown> {
    const args = waitForWindowSchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.waitForWindow(args.sessionId, {
      titleIncludes: args.titleIncludes,
      titleExcludes: args.titleExcludes,
      pid: args.pid,
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs,
      preferLargest: args.preferLargest,
      excludeDevtools: args.excludeDevtools
    });
  }

  async browserOpen(input: unknown): Promise<unknown> {
    const args = browserOpenSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeBrowserPageRef(
      await this.sessionManager.openBrowser(args.sessionId, {
        url: args.url,
        browserExecutablePath: args.browserExecutablePath,
        browserName: args.browserName,
        viewport: args.viewport,
        userDataDir: args.userDataDir,
        label: args.label,
        timeoutMs: args.timeoutMs
      })
    );
  }

  async browserClick(input: unknown): Promise<unknown> {
    const args = browserClickSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeBrowserActionResult(
      await this.sessionManager.browserClick(args.sessionId, args)
    );
  }

  async browserFill(input: unknown): Promise<unknown> {
    const args = browserFillSchema.parse(input);
    this.requireSession(args.sessionId);
    try {
      return serializeBrowserActionResult(
        await this.sessionManager.browserFill(args.sessionId, args)
      );
    } catch (error) {
      if (args.secret) {
        throw new Error(redactErrorMessage(error, args.value));
      }
      throw error;
    }
  }

  async browserPress(input: unknown): Promise<unknown> {
    const args = browserPressSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeBrowserActionResult(
      await this.sessionManager.browserPress(args.sessionId, args)
    );
  }

  async browserAssertText(input: unknown): Promise<unknown> {
    const args = browserAssertTextSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeBrowserActionResult(
      await this.sessionManager.browserAssertText(args.sessionId, args)
    );
  }

  async browserScreenshot(input: unknown): Promise<unknown> {
    const args = browserScreenshotSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeScreenshot(
      await this.sessionManager.browserScreenshot(args.sessionId, {
        pageId: args.pageId,
        label: args.label,
        fullPage: args.fullPage
      })
    );
  }

  async browserClose(input: unknown): Promise<unknown> {
    const args = browserCloseSchema.parse(input);
    this.requireSession(args.sessionId);
    await this.sessionManager.closeBrowser(args.sessionId, args.pageId);
    return {
      sessionId: args.sessionId,
      pageId: args.pageId,
      success: true
    };
  }

  async tauriGetStatus(input: unknown): Promise<unknown> {
    noArgsSchema.parse(input);
    return {
      experimental: true,
      status: serializeTauriDriverStatus(
        await this.sessionManager.getTauriDriverStatus()
      )
    };
  }

  async tauriOpen(input: unknown): Promise<unknown> {
    const args = tauriOpenSchema.parse(input);
    this.requireSession(args.sessionId);
    const app = await this.sessionManager.openTauriApp(args.sessionId, {
      command: args.command,
      args: args.args ?? [],
      cwd: args.cwd,
      env: args.env,
      label: args.label,
      webdriverPort: args.webdriverPort,
      nativePort: args.nativePort,
      timeoutMs: args.timeoutMs,
      windowTitleIncludes: args.windowTitleIncludes,
      applicationPath: args.applicationPath
    });
    return {
      experimental: true,
      mode: app.mode,
      app: serializeTauriAppRef(app),
      warnings: app.warnings
    };
  }

  async tauriClick(input: unknown): Promise<unknown> {
    const args = tauriClickSchema.parse(input);
    this.requireSession(args.sessionId);
    const result = await this.sessionManager.tauriClick(args.sessionId, args);
    return {
      experimental: true,
      mode: result.mode,
      result: serializeTauriActionResult(result),
      warnings: result.warnings
    };
  }

  async tauriFill(input: unknown): Promise<unknown> {
    const args = tauriFillSchema.parse(input);
    this.requireSession(args.sessionId);
    try {
      const result = await this.sessionManager.tauriFill(args.sessionId, args);
      return {
        experimental: true,
        mode: result.mode,
        result: serializeTauriActionResult(result),
        warnings: result.warnings
      };
    } catch (error) {
      if (args.secret) {
        throw new Error(redactErrorMessage(error, args.value));
      }
      throw error;
    }
  }

  async tauriAssertText(input: unknown): Promise<unknown> {
    const args = tauriAssertTextSchema.parse(input);
    this.requireSession(args.sessionId);
    const result = await this.sessionManager.tauriAssertText(args.sessionId, args);
    return {
      experimental: true,
      mode: result.mode,
      result: serializeTauriActionResult(result),
      warnings: result.warnings
    };
  }

  async tauriScreenshot(input: unknown): Promise<unknown> {
    const args = tauriScreenshotSchema.parse(input);
    this.requireSession(args.sessionId);
    return {
      experimental: true,
      screenshot: serializeScreenshot(
        await this.sessionManager.tauriScreenshot(args.sessionId, {
          appId: args.appId,
          label: args.label
        })
      )
    };
  }

  async tauriClose(input: unknown): Promise<unknown> {
    const args = tauriCloseSchema.parse(input);
    this.requireSession(args.sessionId);
    await this.sessionManager.closeTauriApp(args.sessionId, args.appId);
    return {
      experimental: true,
      sessionId: args.sessionId,
      appId: args.appId,
      success: true
    };
  }

  async electronGetStatus(input: unknown): Promise<unknown> {
    noArgsSchema.parse(input);
    return {
      experimental: true,
      status: serializeElectronDriverStatus(
        await this.sessionManager.getElectronDriverStatus()
      )
    };
  }

  async electronOpen(input: unknown): Promise<unknown> {
    const args = electronOpenSchema.parse(input);
    this.requireSession(args.sessionId);
    const app = await this.sessionManager.openElectronApp(args.sessionId, {
      command: args.command,
      args: args.args ?? [],
      cwd: args.cwd,
      env: args.env,
      executablePath: args.executablePath,
      appPath: args.appPath,
      label: args.label,
      timeoutMs: args.timeoutMs,
      windowTitleIncludes: args.windowTitleIncludes,
      excludeDevtools: args.excludeDevtools
    });
    return {
      experimental: true,
      mode: app.mode,
      app: serializeElectronAppRef(app),
      warnings: app.warnings
    };
  }

  async electronClick(input: unknown): Promise<unknown> {
    const args = electronClickSchema.parse(input);
    this.requireSession(args.sessionId);
    const result = await this.sessionManager.electronClick(args.sessionId, args);
    return {
      experimental: true,
      mode: result.mode,
      result: serializeElectronActionResult(result),
      warnings: result.warnings
    };
  }

  async electronFill(input: unknown): Promise<unknown> {
    const args = electronFillSchema.parse(input);
    this.requireSession(args.sessionId);
    try {
      const result = await this.sessionManager.electronFill(args.sessionId, args);
      return {
        experimental: true,
        mode: result.mode,
        result: serializeElectronActionResult(result),
        warnings: result.warnings
      };
    } catch (error) {
      if (args.secret) {
        throw new Error(redactErrorMessage(error, args.value));
      }
      throw error;
    }
  }

  async electronPress(input: unknown): Promise<unknown> {
    const args = electronPressSchema.parse(input);
    this.requireSession(args.sessionId);
    const result = await this.sessionManager.electronPress(args.sessionId, args);
    return {
      experimental: true,
      mode: result.mode,
      result: serializeElectronActionResult(result),
      warnings: result.warnings
    };
  }

  async electronAssertText(input: unknown): Promise<unknown> {
    const args = electronAssertTextSchema.parse(input);
    this.requireSession(args.sessionId);
    const result = await this.sessionManager.electronAssertText(args.sessionId, args);
    return {
      experimental: true,
      mode: result.mode,
      result: serializeElectronActionResult(result),
      warnings: result.warnings
    };
  }

  async electronScreenshot(input: unknown): Promise<unknown> {
    const args = electronScreenshotSchema.parse(input);
    this.requireSession(args.sessionId);
    return {
      experimental: true,
      screenshot: serializeScreenshot(
        await this.sessionManager.electronScreenshot(args.sessionId, {
          appId: args.appId,
          label: args.label,
          fullPage: args.fullPage
        })
      )
    };
  }

  async electronClose(input: unknown): Promise<unknown> {
    const args = electronCloseSchema.parse(input);
    this.requireSession(args.sessionId);
    await this.sessionManager.closeElectronApp(args.sessionId, args.appId);
    return {
      experimental: true,
      sessionId: args.sessionId,
      appId: args.appId,
      success: true
    };
  }

  async driverGetStatus(input: unknown): Promise<unknown> {
    noArgsSchema.parse(input);
    return serializeDriverRouterStatus(await this.sessionManager.getDriverRouterStatus());
  }

  async observerGetStatus(input: unknown): Promise<unknown> {
    noArgsSchema.parse(input);
    return {
      optional: true,
      status: serializeLiveObserverStatus(
        await this.sessionManager.getLiveObserverStatus()
      )
    };
  }

  async observerStart(input: unknown): Promise<unknown> {
    const args = observerStartSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeLiveObserverRef(
      await this.sessionManager.startLiveObserver(args.sessionId, args)
    );
  }

  observerList(input: unknown): unknown {
    const args = observerListSchema.parse(input);
    if (args.sessionId) {
      this.requireSession(args.sessionId);
    }
    return {
      observers: this.sessionManager.listLiveObservers(args.sessionId).map(serializeLiveObserverRef)
    };
  }

  async observerStop(input: unknown): Promise<unknown> {
    const args = observerStopSchema.parse(input);
    this.requireSession(args.sessionId);
    return await this.sessionManager.stopLiveObserver(args.sessionId, args.observerId);
  }

  async driverRoute(input: unknown): Promise<unknown> {
    const args = driverRouteSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeDriverRouteDecision(
      await this.sessionManager.routeDriver(args.sessionId, {
        appKind: args.appKind,
        preferredDriver: args.preferredDriver,
        allowFallback: args.allowFallback,
        requireSemantic: args.requireSemantic
      })
    );
  }

  async appOpen(input: unknown): Promise<unknown> {
    const args = appOpenSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeAppRef(
      await this.sessionManager.openApp(args.sessionId, {
        appKind: args.appKind,
        preferredDriver: args.preferredDriver,
        allowFallback: args.allowFallback,
        requireSemantic: args.requireSemantic,
        url: args.url,
        browserExecutablePath: args.browserExecutablePath,
        browserName: args.browserName,
        viewport: args.viewport,
        command: args.command,
        args: args.args ?? [],
        cwd: args.cwd,
        env: args.env,
        appPath: args.appPath,
        executablePath: args.executablePath,
        label: args.label,
        timeoutMs: args.timeoutMs,
        windowTitleIncludes: args.windowTitleIncludes,
        excludeDevtools: args.excludeDevtools
      })
    );
  }

  async appClick(input: unknown): Promise<unknown> {
    const args = appClickSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeAppActionResult(await this.sessionManager.appClick(args.sessionId, args));
  }

  async appFill(input: unknown): Promise<unknown> {
    const args = appFillSchema.parse(input);
    this.requireSession(args.sessionId);
    try {
      return serializeAppActionResult(await this.sessionManager.appFill(args.sessionId, args));
    } catch (error) {
      if (args.secret) {
        throw new Error(redactErrorMessage(error, args.value));
      }
      throw error;
    }
  }

  async appPress(input: unknown): Promise<unknown> {
    const args = appPressSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeAppActionResult(await this.sessionManager.appPress(args.sessionId, args));
  }

  async appAssertText(input: unknown): Promise<unknown> {
    const args = appAssertTextSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeAppActionResult(
      await this.sessionManager.appAssertText(args.sessionId, args)
    );
  }

  async appScreenshot(input: unknown): Promise<unknown> {
    const args = appScreenshotSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeScreenshot(
      await this.sessionManager.appScreenshot(args.sessionId, {
        appId: args.appId,
        preferredDriver: args.preferredDriver,
        label: args.label,
        fullPage: args.fullPage
      })
    );
  }

  async appClose(input: unknown): Promise<unknown> {
    const args = appCloseSchema.parse(input);
    this.requireSession(args.sessionId);
    await this.sessionManager.closeApp(args.sessionId, args.appId);
    return {
      sessionId: args.sessionId,
      appId: args.appId,
      success: true
    };
  }

  async visualCompare(input: unknown): Promise<unknown> {
    const args = visualCompareSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeVisualCompareResult(
      await this.sessionManager.visualCompare(args.sessionId, args)
    );
  }

  async visualAssertChanged(input: unknown): Promise<unknown> {
    const args = visualAssertChangedSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeVisualCompareResult(
      await this.sessionManager.visualAssertChanged(args.sessionId, args)
    );
  }

  async visualAssertSimilar(input: unknown): Promise<unknown> {
    const args = visualAssertSimilarSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeVisualCompareResult(
      await this.sessionManager.visualAssertSimilar(args.sessionId, args)
    );
  }

  async visualSaveBaseline(input: unknown): Promise<unknown> {
    const args = visualSaveBaselineSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeVisualBaseline(
      await this.sessionManager.saveVisualBaseline(args.sessionId, args)
    );
  }

  async visualListBaselines(input: unknown): Promise<unknown> {
    const args = visualListBaselinesSchema.parse(input);
    this.requireSession(args.sessionId);
    return {
      baselines: (await this.sessionManager.listVisualBaselines(args.sessionId, args)).map(
        serializeVisualBaseline
      )
    };
  }

  async visualCompareBaseline(input: unknown): Promise<unknown> {
    const args = visualCompareBaselineSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeVisualCompareResult(
      await this.sessionManager.compareVisualBaseline(args.sessionId, args)
    );
  }

  async visualAssertAnnotationChanged(input: unknown): Promise<unknown> {
    const args = visualAssertAnnotationChangedSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeVisualCompareResult(
      await this.sessionManager.visualAssertAnnotationChanged(args.sessionId, args)
    );
  }

  async visualAssertAnnotationSimilar(input: unknown): Promise<unknown> {
    const args = visualAssertAnnotationSimilarSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeVisualCompareResult(
      await this.sessionManager.visualAssertAnnotationSimilar(args.sessionId, args)
    );
  }

  async visualAssertChangeContained(input: unknown): Promise<unknown> {
    const args = visualAssertChangeContainedSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeVisualCompareResult(
      await this.sessionManager.visualAssertChangeContained(args.sessionId, args)
    );
  }

  async visualListAssertions(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    return {
      assertions: (await this.sessionManager.listVisualAssertions(args.sessionId)).map(
        serializeVisualCompareResult
      )
    };
  }

  async stopSession(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    await this.sessionManager.stopSession(args.sessionId);
    return {
      sessionId: args.sessionId,
      success: true
    };
  }

  async getEvidenceReport(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    const session = this.requireSession(args.sessionId);
    const path = join(session.evidencePath, "report.md");

    try {
      return {
        sessionId: args.sessionId,
        path,
        text: await readFile(path, "utf8")
      };
    } catch (error) {
      throw new Error(
        `Evidence report is not available for session ${args.sessionId}. Stop the session first to generate report.md.`
      );
    }
  }

  async listScreenshots(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    return {
      screenshots: (await this.sessionManager.listScreenshots(args.sessionId)).map(
        serializeScreenshotArtifact
      )
    };
  }

  async createAnnotation(input: unknown): Promise<unknown> {
    const args = createAnnotationSchema.parse(input);
    this.requireSession(args.sessionId);
    const annotation = await this.sessionManager.createAnnotation(args.sessionId, {
      screenshotFileName: args.screenshotFileName,
      type: args.type,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      x2: args.x2,
      y2: args.y2,
      note: args.note,
      color: args.color,
      cropPngBase64: args.cropPngBase64
    });
    return serializeAnnotation(annotation);
  }

  async listAnnotations(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    return {
      annotations: (await this.sessionManager.listAnnotations(args.sessionId)).map(
        serializeAnnotation
      )
    };
  }

  async getVisualHandoff(input: unknown): Promise<unknown> {
    const args = sessionIdSchema.parse(input);
    this.requireSession(args.sessionId);
    return serializeVisualHandoff(await this.sessionManager.getVisualHandoff(args.sessionId));
  }

  private requireSession(sessionId: SessionId): DesktopSession {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Desktop session not found: ${sessionId}`);
    }
    return session;
  }
}

export function serializeSession(session: DesktopSession): Record<string, unknown> {
  return {
    id: session.id,
    name: session.config.name,
    status: session.status,
    display: session.display,
    displayNumber: session.displayNumber,
    width: session.width,
    height: session.height,
    depth: session.depth,
    workspacePath: session.workspacePath,
    evidencePath: session.evidencePath,
    createdAt: session.createdAt.toISOString(),
    stoppedAt: session.stoppedAt?.toISOString(),
    processIds: session.processIds,
    warnings: session.warnings
  };
}

export function serializeLaunchResult(result: LaunchResult): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    processId: result.processId,
    command: result.command,
    args: result.args,
    cwd: result.cwd,
    display: result.display,
    startedAt: result.startedAt.toISOString()
  };
}

export function serializeScreenshot(result: ScreenshotResult): Record<string, unknown> {
  return {
    artifactId: result.artifactId,
    sessionId: result.sessionId,
    path: result.path,
    width: result.width,
    height: result.height,
    capturedAt: result.capturedAt.toISOString(),
    createdAt: result.createdAt.toISOString(),
    display: result.display,
    sequence: result.sequence,
    label: result.label
  };
}

export function serializeScreenshotArtifact(
  artifact: ScreenshotArtifact
): Record<string, unknown> {
  return {
    sessionId: artifact.sessionId,
    fileName: artifact.fileName,
    path: artifact.path,
    sequence: artifact.sequence,
    label: artifact.label,
    createdAt: artifact.createdAt
  };
}

export function serializeBrowserPageRef(page: BrowserPageRef): Record<string, unknown> {
  return {
    sessionId: page.sessionId,
    pageId: page.pageId,
    url: page.url,
    title: page.title,
    createdAt: page.createdAt
  };
}

export function serializeBrowserActionResult(
  result: BrowserActionResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    pageId: result.pageId,
    actionType: result.actionType,
    success: result.success,
    createdAt: result.createdAt,
    details: result.details
  };
}

export function serializeTauriDriverStatus(
  status: TauriDriverStatus
): Record<string, unknown> {
  return {
    available: status.available,
    tauriDriverPath: status.tauriDriverPath,
    webKitWebDriverPath: status.webKitWebDriverPath,
    cargoPath: status.cargoPath,
    warnings: status.warnings,
    errors: status.errors
  };
}

export function serializeTauriAppRef(app: TauriAppRef): Record<string, unknown> {
  return {
    sessionId: app.sessionId,
    appId: app.appId,
    webdriverUrl: app.webdriverUrl,
    processId: app.processId,
    createdAt: app.createdAt,
    mode: app.mode,
    warnings: app.warnings
  };
}

export function serializeTauriActionResult(
  result: TauriActionResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    appId: result.appId,
    actionType: result.actionType,
    success: result.success,
    mode: result.mode,
    createdAt: result.createdAt,
    details: result.details,
    warnings: result.warnings
  };
}

export function serializeElectronDriverStatus(
  status: ElectronDriverStatus
): Record<string, unknown> {
  return {
    available: status.available,
    playwrightAvailable: status.playwrightAvailable,
    electronBinaryPath: status.electronBinaryPath,
    warnings: status.warnings,
    errors: status.errors
  };
}

export function serializeElectronAppRef(app: ElectronAppRef): Record<string, unknown> {
  return {
    sessionId: app.sessionId,
    appId: app.appId,
    createdAt: app.createdAt,
    mode: app.mode,
    processId: app.processId,
    windowTitle: app.windowTitle,
    warnings: app.warnings
  };
}

export function serializeElectronActionResult(
  result: ElectronActionResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    appId: result.appId,
    actionType: result.actionType,
    success: result.success,
    mode: result.mode,
    createdAt: result.createdAt,
    details: result.details,
    warnings: result.warnings
  };
}

export function serializeLiveObserverStatus(
  status: LiveObserverStatus
): Record<string, unknown> {
  return {
    available: status.available,
    x11vncPath: status.x11vncPath,
    websockifyPath: status.websockifyPath,
    novncProxyPath: status.novncProxyPath,
    novncPath: status.novncPath,
    noVncWebRootPath: status.noVncWebRootPath,
    warnings: status.warnings,
    errors: status.errors,
    installHints: status.installHints
  };
}

export function serializeLiveObserverRef(
  observer: LiveObserverRef
): Record<string, unknown> {
  return {
    sessionId: observer.sessionId,
    observerId: observer.observerId,
    host: observer.host,
    vncPort: observer.vncPort,
    webPort: observer.webPort,
    viewOnly: observer.viewOnly,
    url: observer.url,
    createdAt: observer.createdAt,
    warnings: observer.warnings
  };
}

export function serializeDriverRouterStatus(
  status: DriverRouterStatus
): Record<string, unknown> {
  return {
    browser: status.browser,
    tauri: status.tauri,
    electron: status.electron,
    x11Fallback: status.x11Fallback
  };
}

export function serializeDriverRouteDecision(
  decision: DriverRouteDecision
): Record<string, unknown> {
  return {
    appKind: decision.appKind,
    selectedDriver: decision.selectedDriver,
    selectionMode: decision.selectionMode,
    semantic: decision.semantic,
    fallbackUsed: decision.fallbackUsed,
    fallbackReason: decision.fallbackReason,
    warnings: decision.warnings,
    errors: decision.errors
  };
}

export function serializeAppRef(app: AppRef): Record<string, unknown> {
  return {
    sessionId: app.sessionId,
    appId: app.appId,
    appKind: app.appKind,
    selectedDriver: app.selectedDriver,
    semantic: app.semantic,
    fallbackUsed: app.fallbackUsed,
    createdAt: app.createdAt,
    processId: app.processId,
    warnings: app.warnings
  };
}

export function serializeAppActionResult(
  result: AppActionResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    appId: result.appId,
    appKind: result.appKind,
    selectedDriver: result.selectedDriver,
    semantic: result.semantic,
    fallbackUsed: result.fallbackUsed,
    actionType: result.actionType,
    success: result.success,
    createdAt: result.createdAt,
    warnings: result.warnings,
    details: result.details
  };
}

export function serializeVisualCompareResult(
  result: VisualCompareResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    label: result.label,
    kind: result.kind,
    baselineName: result.baselineName,
    baselineSuite: result.baselineSuite,
    annotationId: result.annotationId,
    annotationNote: result.annotationNote,
    beforePath: result.beforePath,
    afterPath: result.afterPath,
    diffPath: result.diffPath,
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
    insideComparedPixels: result.insideComparedPixels,
    insideDiffPixels: result.insideDiffPixels,
    insideDiffPixelRatio: result.insideDiffPixelRatio,
    outsideComparedPixels: result.outsideComparedPixels,
    outsideDiffPixels: result.outsideDiffPixels,
    outsideDiffPixelRatio: result.outsideDiffPixelRatio,
    containmentPassed: result.containmentPassed,
    passed: result.passed,
    createdAt: result.createdAt,
    warnings: result.warnings
  };
}

export function serializeVisualBaseline(
  baseline: VisualBaselineRef
): Record<string, unknown> {
  return {
    name: baseline.name,
    suite: baseline.suite,
    path: baseline.path,
    sourceScreenshotPath: baseline.sourceScreenshotPath,
    width: baseline.width,
    height: baseline.height,
    createdAt: baseline.createdAt,
    updatedAt: baseline.updatedAt,
    metadata: baseline.metadata
  };
}

export function serializeAnnotation(
  annotation: ScreenshotAnnotation
): Record<string, unknown> {
  return {
    id: annotation.id,
    sessionId: annotation.sessionId,
    screenshotPath: annotation.screenshotPath,
    screenshotFileName: annotation.screenshotFileName,
    type: annotation.type,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
    x2: annotation.x2,
    y2: annotation.y2,
    note: annotation.note,
    color: annotation.color,
    cropPath: annotation.cropPath,
    createdAt: annotation.createdAt
  };
}

export function serializeVisualHandoff(handoff: VisualHandoff): Record<string, unknown> {
  return {
    sessionId: handoff.sessionId,
    path: handoff.path,
    text: handoff.text,
    annotations: handoff.annotations.map(serializeAnnotation)
  };
}

export function serializeWaitForStableScreenResult(
  result: WaitForStableScreenResult
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    stable: result.stable,
    checks: result.checks,
    elapsedMs: result.elapsedMs,
    mode: result.mode,
    retainedScreenshots: result.retainedScreenshots?.map(serializeScreenshot),
    discardedScreenshotCount: result.discardedScreenshotCount,
    lastScreenshot: result.lastScreenshot
      ? serializeScreenshot(result.lastScreenshot)
      : undefined,
    reason: result.reason
  };
}

export function redactTypeTextResult(
  result: InputActionResult,
  textLength: number
): InputActionResult {
  return {
    ...result,
    details: {
      redacted: true,
      textLength
    }
  };
}

function redactErrorMessage(error: unknown, secretText: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (secretText.length === 0) {
    return message;
  }
  return message.split(secretText).join("[redacted]");
}
