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
  WaitForStableScreenResult,
  WaitForWindowOptions,
  VisualHandoff,
  WindowActionResult,
  WindowInfo
} from "@agent-desktop-harness/core";
import { SessionManager } from "@agent-desktop-harness/core";
import { HttpError } from "./errors.js";
import {
  browserAssertTextBodySchema,
  browserClickBodySchema,
  browserCloseBodySchema,
  browserFillBodySchema,
  browserOpenBodySchema,
  browserPressBodySchema,
  browserScreenshotBodySchema,
  appAssertTextBodySchema,
  appClickBodySchema,
  appCloseBodySchema,
  appFillBodySchema,
  appOpenBodySchema,
  appPressBodySchema,
  appScreenshotBodySchema,
  clickBodySchema,
  createAnnotationBodySchema,
  electronAssertTextBodySchema,
  electronClickBodySchema,
  electronCloseBodySchema,
  electronFillBodySchema,
  electronOpenBodySchema,
  electronPressBodySchema,
  electronScreenshotBodySchema,
  driverRouteBodySchema,
  createSessionBodySchema,
  focusWindowBodySchema,
  hotkeyBodySchema,
  launchBodySchema,
  screenshotBodySchema,
  scrollBodySchema,
  sessionIdSchema,
  pngFileNameSchema,
  startLiveObserverBodySchema,
  tauriAssertTextBodySchema,
  tauriClickBodySchema,
  tauriCloseBodySchema,
  tauriFillBodySchema,
  tauriOpenBodySchema,
  tauriScreenshotBodySchema,
  typeTextBodySchema,
  waitForStableScreenBodySchema,
  waitForWindowBodySchema,
  compareVisualBaselineBodySchema,
  listVisualBaselinesQuerySchema,
  saveVisualBaselineBodySchema,
  visualAssertAnnotationChangedBodySchema,
  visualAssertAnnotationSimilarBodySchema,
  visualAssertChangedBodySchema,
  visualAssertChangeContainedBodySchema,
  visualAssertSimilarBodySchema,
  visualCompareBodySchema
} from "./schemas.js";
import {
  redactErrorMessage,
  redactTypeTextResult,
  serializeLaunchResult,
  serializeScreenshotArtifact,
  serializeScreenshot,
  serializeAnnotation,
  serializeBrowserActionResult,
  serializeBrowserPageRef,
  serializeAppActionResult,
  serializeAppRef,
  serializeDriverRouteDecision,
  serializeDriverRouterStatus,
  serializeElectronActionResult,
  serializeElectronAppRef,
  serializeElectronDriverStatus,
  serializeLiveObserverRef,
  serializeLiveObserverStatus,
  serializeTauriActionResult,
  serializeTauriAppRef,
  serializeTauriDriverStatus,
  serializeVisualBaseline,
  serializeVisualHandoff,
  serializeSession,
  serializeVisualCompareResult,
  serializeWaitForStableScreenResult
} from "./serializers.js";
import { renderAnnotationUi } from "./annotationUi.js";

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
  getVisualDiffFilePath(sessionId: SessionId, fileName: string): string;
  listScreenshots(sessionId: SessionId): Promise<ScreenshotArtifact[]>;
  getScreenshotFilePath(sessionId: SessionId, fileName: string): string;
  getAnnotationFilePath(sessionId: SessionId, fileName: string): string;
  createAnnotation(
    sessionId: SessionId,
    input: CreateAnnotationInput
  ): Promise<ScreenshotAnnotation>;
  listAnnotations(sessionId: SessionId): Promise<ScreenshotAnnotation[]>;
  getVisualHandoff(sessionId: SessionId): Promise<VisualHandoff>;
  stopSession(sessionId: SessionId): Promise<void>;
}

export class DesktopHttpApi {
  constructor(
    private readonly sessionManager: SessionManagerLike = new SessionManager(),
    private readonly defaultWorkspaceDir: string = process.cwd()
  ) {}

  health(): Record<string, unknown> {
    return {
      ok: true,
      service: "agent-desktop-harness-http",
      version: "0.0.0"
    };
  }

  async tauriStatus(): Promise<Record<string, unknown>> {
    return {
      ok: true,
      experimental: true,
      status: serializeTauriDriverStatus(
        await this.sessionManager.getTauriDriverStatus()
      )
    };
  }

  async electronStatus(): Promise<Record<string, unknown>> {
    return {
      ok: true,
      experimental: true,
      status: serializeElectronDriverStatus(
        await this.sessionManager.getElectronDriverStatus()
      )
    };
  }

  async driverStatus(): Promise<Record<string, unknown>> {
    return {
      ok: true,
      status: serializeDriverRouterStatus(
        await this.sessionManager.getDriverRouterStatus()
      )
    };
  }

  async observerStatus(): Promise<Record<string, unknown>> {
    return {
      ok: true,
      optional: true,
      status: serializeLiveObserverStatus(
        await this.sessionManager.getLiveObserverStatus()
      )
    };
  }

  async createSession(body: unknown): Promise<Record<string, unknown>> {
    const args = createSessionBodySchema.parse(body);
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

    return {
      ok: true,
      session: serializeSession(session)
    };
  }

  listSessions(): Record<string, unknown> {
    return {
      ok: true,
      sessions: this.sessionManager.listSessions().map(serializeSession)
    };
  }

  getSession(sessionId: string): Record<string, unknown> {
    return {
      ok: true,
      session: serializeSession(this.requireSession(sessionId))
    };
  }

  async stopSession(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    await this.sessionManager.stopSession(sessionId);
    return {
      ok: true,
      sessionId
    };
  }

  async launchApp(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = launchBodySchema.parse(body);
    const result = await this.sessionManager.launchApp(sessionId, {
      command: args.command,
      args: args.args ?? [],
      cwd: args.cwd,
      env: args.env
    });

    return {
      ok: true,
      launch: {
        ...serializeLaunchResult(result),
        label: args.label
      }
    };
  }

  async screenshot(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = screenshotBodySchema.parse(body);
    return {
      ok: true,
      screenshot: serializeScreenshot(
        await this.sessionManager.captureScreenshot(sessionId, {
          label: args.label
        })
      )
    };
  }

  async click(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = clickBodySchema.parse(body);
    return {
      ok: true,
      result: await this.sessionManager.click(sessionId, {
        x: args.x,
        y: args.y,
        button: args.button,
        label: args.label
      })
    };
  }

  async doubleClick(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = clickBodySchema.parse(body);
    return {
      ok: true,
      result: await this.sessionManager.doubleClick(sessionId, {
        x: args.x,
        y: args.y,
        button: args.button,
        label: args.label
      })
    };
  }

  async typeText(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = typeTextBodySchema.parse(body);

    try {
      const result = await this.sessionManager.typeText(sessionId, {
        text: args.text,
        secret: args.secret,
        label: args.label
      });

      return {
        ok: true,
        result: args.secret ? redactTypeTextResult(result, args.text.length) : result
      };
    } catch (error) {
      if (args.secret) {
        throw new HttpError(
          500,
          "INTERNAL_ERROR",
          redactErrorMessage(error, args.text)
        );
      }
      throw error;
    }
  }

  async hotkey(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = hotkeyBodySchema.parse(body);
    return {
      ok: true,
      result: await this.sessionManager.hotkey(sessionId, {
        keys: args.keys,
        label: args.label
      })
    };
  }

  async scroll(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = scrollBodySchema.parse(body);
    return {
      ok: true,
      result: await this.sessionManager.scroll(sessionId, {
        direction: args.direction,
        amount: args.amount,
        x: args.x,
        y: args.y,
        label: args.label
      })
    };
  }

  async getWindows(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    return {
      ok: true,
      windows: await this.sessionManager.getWindows(sessionId)
    };
  }

  async focusWindow(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = focusWindowBodySchema.parse(body);
    return {
      ok: true,
      result: await this.sessionManager.focusWindow(sessionId, {
        id: args.id,
        title: args.title,
        titleIncludes: args.titleIncludes,
        titleExcludes: args.titleExcludes,
        pid: args.pid,
        preferLargest: args.preferLargest,
        excludeDevtools: args.excludeDevtools
      })
    };
  }

  async waitForStableScreen(
    sessionId: string,
    body: unknown
  ): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = waitForStableScreenBodySchema.parse(body);
    return {
      ok: true,
      result: serializeWaitForStableScreenResult(
        await this.sessionManager.waitForStableScreen(sessionId, {
          timeoutMs: args.timeoutMs,
          intervalMs: args.intervalMs,
          stableChecks: args.stableChecks,
          label: args.label,
          mode: args.mode,
          fileSizeToleranceBytes: args.fileSizeToleranceBytes,
          maxRetainedScreenshots: args.maxRetainedScreenshots,
          retainOnlyLast: args.retainOnlyLast
        })
      )
    };
  }

  async waitForWindow(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = waitForWindowBodySchema.parse(body);
    return {
      ok: true,
      window: await this.sessionManager.waitForWindow(sessionId, {
        titleIncludes: args.titleIncludes,
        titleExcludes: args.titleExcludes,
        pid: args.pid,
        timeoutMs: args.timeoutMs,
        intervalMs: args.intervalMs,
        preferLargest: args.preferLargest,
        excludeDevtools: args.excludeDevtools
      })
    };
  }

  async browserOpen(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = browserOpenBodySchema.parse(body);
    return {
      ok: true,
      page: serializeBrowserPageRef(
        await this.sessionManager.openBrowser(sessionId, {
          url: args.url,
          browserExecutablePath: args.browserExecutablePath,
          browserName: args.browserName,
          viewport: args.viewport,
          userDataDir: args.userDataDir,
          label: args.label,
          timeoutMs: args.timeoutMs
        })
      )
    };
  }

  async browserClick(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = browserClickBodySchema.parse(body);
    return {
      ok: true,
      result: serializeBrowserActionResult(
        await this.sessionManager.browserClick(sessionId, args)
      )
    };
  }

  async browserFill(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = browserFillBodySchema.parse(body);

    try {
      return {
        ok: true,
        result: serializeBrowserActionResult(
          await this.sessionManager.browserFill(sessionId, args)
        )
      };
    } catch (error) {
      if (args.secret) {
        throw new HttpError(500, "INTERNAL_ERROR", redactErrorMessage(error, args.value));
      }
      throw error;
    }
  }

  async browserPress(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = browserPressBodySchema.parse(body);
    return {
      ok: true,
      result: serializeBrowserActionResult(
        await this.sessionManager.browserPress(sessionId, args)
      )
    };
  }

  async browserAssertText(
    sessionId: string,
    body: unknown
  ): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = browserAssertTextBodySchema.parse(body);
    return {
      ok: true,
      result: serializeBrowserActionResult(
        await this.sessionManager.browserAssertText(sessionId, args)
      )
    };
  }

  async browserScreenshot(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = browserScreenshotBodySchema.parse(body);
    return {
      ok: true,
      screenshot: serializeScreenshot(
        await this.sessionManager.browserScreenshot(sessionId, {
          pageId: args.pageId,
          label: args.label,
          fullPage: args.fullPage
        })
      )
    };
  }

  async browserClose(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = browserCloseBodySchema.parse(body);
    await this.sessionManager.closeBrowser(sessionId, args.pageId);
    return {
      ok: true,
      sessionId,
      pageId: args.pageId
    };
  }

  async tauriOpen(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = tauriOpenBodySchema.parse(body);
    const app = await this.sessionManager.openTauriApp(sessionId, {
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
      ok: true,
      experimental: true,
      mode: app.mode,
      app: serializeTauriAppRef(app),
      warnings: app.warnings
    };
  }

  async tauriClick(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = tauriClickBodySchema.parse(body);
    const result = await this.sessionManager.tauriClick(sessionId, args);
    return {
      ok: true,
      experimental: true,
      mode: result.mode,
      result: serializeTauriActionResult(result),
      warnings: result.warnings
    };
  }

  async tauriFill(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = tauriFillBodySchema.parse(body);

    try {
      const result = await this.sessionManager.tauriFill(sessionId, args);
      return {
        ok: true,
        experimental: true,
        mode: result.mode,
        result: serializeTauriActionResult(result),
        warnings: result.warnings
      };
    } catch (error) {
      if (args.secret) {
        throw new HttpError(500, "INTERNAL_ERROR", redactErrorMessage(error, args.value));
      }
      throw error;
    }
  }

  async tauriAssertText(
    sessionId: string,
    body: unknown
  ): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = tauriAssertTextBodySchema.parse(body);
    const result = await this.sessionManager.tauriAssertText(sessionId, args);
    return {
      ok: true,
      experimental: true,
      mode: result.mode,
      result: serializeTauriActionResult(result),
      warnings: result.warnings
    };
  }

  async tauriScreenshot(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = tauriScreenshotBodySchema.parse(body);
    return {
      ok: true,
      experimental: true,
      screenshot: serializeScreenshot(
        await this.sessionManager.tauriScreenshot(sessionId, {
          appId: args.appId,
          label: args.label
        })
      )
    };
  }

  async tauriClose(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = tauriCloseBodySchema.parse(body);
    await this.sessionManager.closeTauriApp(sessionId, args.appId);
    return {
      ok: true,
      experimental: true,
      sessionId,
      appId: args.appId
    };
  }

  async electronOpen(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = electronOpenBodySchema.parse(body);
    const app = await this.sessionManager.openElectronApp(sessionId, {
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
      ok: true,
      experimental: true,
      mode: app.mode,
      app: serializeElectronAppRef(app),
      warnings: app.warnings
    };
  }

  async electronClick(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = electronClickBodySchema.parse(body);
    const result = await this.sessionManager.electronClick(sessionId, args);
    return {
      ok: true,
      experimental: true,
      mode: result.mode,
      result: serializeElectronActionResult(result),
      warnings: result.warnings
    };
  }

  async electronFill(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = electronFillBodySchema.parse(body);

    try {
      const result = await this.sessionManager.electronFill(sessionId, args);
      return {
        ok: true,
        experimental: true,
        mode: result.mode,
        result: serializeElectronActionResult(result),
        warnings: result.warnings
      };
    } catch (error) {
      if (args.secret) {
        throw new HttpError(500, "INTERNAL_ERROR", redactErrorMessage(error, args.value));
      }
      throw error;
    }
  }

  async electronPress(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = electronPressBodySchema.parse(body);
    const result = await this.sessionManager.electronPress(sessionId, args);
    return {
      ok: true,
      experimental: true,
      mode: result.mode,
      result: serializeElectronActionResult(result),
      warnings: result.warnings
    };
  }

  async electronAssertText(
    sessionId: string,
    body: unknown
  ): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = electronAssertTextBodySchema.parse(body);
    const result = await this.sessionManager.electronAssertText(sessionId, args);
    return {
      ok: true,
      experimental: true,
      mode: result.mode,
      result: serializeElectronActionResult(result),
      warnings: result.warnings
    };
  }

  async electronScreenshot(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = electronScreenshotBodySchema.parse(body);
    return {
      ok: true,
      experimental: true,
      screenshot: serializeScreenshot(
        await this.sessionManager.electronScreenshot(sessionId, {
          appId: args.appId,
          label: args.label,
          fullPage: args.fullPage
        })
      )
    };
  }

  async electronClose(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = electronCloseBodySchema.parse(body);
    await this.sessionManager.closeElectronApp(sessionId, args.appId);
    return {
      ok: true,
      experimental: true,
      sessionId,
      appId: args.appId
    };
  }

  listLiveObservers(sessionId: string): Record<string, unknown> {
    this.requireSession(sessionId);
    return {
      ok: true,
      observers: this.sessionManager.listLiveObservers(sessionId).map(serializeLiveObserverRef)
    };
  }

  async startLiveObserver(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = startLiveObserverBodySchema.parse(body);
    const observer = await this.sessionManager.startLiveObserver(sessionId, args);
    return {
      ok: true,
      observer: serializeLiveObserverRef(observer)
    };
  }

  async stopLiveObserver(
    sessionId: string,
    observerId: string
  ): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const result = await this.sessionManager.stopLiveObserver(sessionId, observerId);
    return {
      ok: true,
      result
    };
  }

  async driverRoute(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = driverRouteBodySchema.parse(body);
    const decision = await this.sessionManager.routeDriver(sessionId, args);
    return {
      ok: true,
      decision: serializeDriverRouteDecision(decision)
    };
  }

  async appOpen(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = appOpenBodySchema.parse(body);
    const app = await this.sessionManager.openApp(sessionId, args);
    return {
      ok: true,
      app: serializeAppRef(app),
      selectedDriver: app.selectedDriver,
      semantic: app.semantic,
      fallbackUsed: app.fallbackUsed,
      warnings: app.warnings
    };
  }

  async appClick(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = appClickBodySchema.parse(body);
    const result = await this.sessionManager.appClick(sessionId, args);
    return {
      ok: true,
      result: serializeAppActionResult(result),
      selectedDriver: result.selectedDriver,
      semantic: result.semantic,
      fallbackUsed: result.fallbackUsed,
      warnings: result.warnings
    };
  }

  async appFill(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = appFillBodySchema.parse(body);
    try {
      const result = await this.sessionManager.appFill(sessionId, args);
      return {
        ok: true,
        result: serializeAppActionResult(result),
        selectedDriver: result.selectedDriver,
        semantic: result.semantic,
        fallbackUsed: result.fallbackUsed,
        warnings: result.warnings
      };
    } catch (error) {
      if (args.secret) {
        throw new HttpError(500, "INTERNAL_ERROR", redactErrorMessage(error, args.value));
      }
      throw error;
    }
  }

  async appPress(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = appPressBodySchema.parse(body);
    const result = await this.sessionManager.appPress(sessionId, args);
    return {
      ok: true,
      result: serializeAppActionResult(result),
      selectedDriver: result.selectedDriver,
      semantic: result.semantic,
      fallbackUsed: result.fallbackUsed,
      warnings: result.warnings
    };
  }

  async appAssertText(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = appAssertTextBodySchema.parse(body);
    const result = await this.sessionManager.appAssertText(sessionId, args);
    return {
      ok: true,
      result: serializeAppActionResult(result),
      selectedDriver: result.selectedDriver,
      semantic: result.semantic,
      fallbackUsed: result.fallbackUsed,
      warnings: result.warnings
    };
  }

  async appScreenshot(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = appScreenshotBodySchema.parse(body);
    return {
      ok: true,
      screenshot: serializeScreenshot(
        await this.sessionManager.appScreenshot(sessionId, args)
      )
    };
  }

  async appClose(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = appCloseBodySchema.parse(body);
    await this.sessionManager.closeApp(sessionId, args.appId);
    return {
      ok: true,
      sessionId,
      appId: args.appId,
      success: true
    };
  }

  async visualCompare(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = visualCompareBodySchema.parse(body);
    return {
      ok: true,
      result: serializeVisualCompareResult(
        await this.sessionManager.visualCompare(sessionId, args)
      )
    };
  }

  async visualAssertChanged(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = visualAssertChangedBodySchema.parse(body);
    return {
      ok: true,
      result: serializeVisualCompareResult(
        await this.sessionManager.visualAssertChanged(sessionId, args)
      )
    };
  }

  async visualAssertSimilar(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = visualAssertSimilarBodySchema.parse(body);
    return {
      ok: true,
      result: serializeVisualCompareResult(
        await this.sessionManager.visualAssertSimilar(sessionId, args)
      )
    };
  }

  async saveVisualBaseline(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = saveVisualBaselineBodySchema.parse(body);
    return {
      ok: true,
      baseline: serializeVisualBaseline(
        await this.sessionManager.saveVisualBaseline(sessionId, args)
      )
    };
  }

  async listVisualBaselines(
    sessionId: string,
    query: unknown = {}
  ): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = listVisualBaselinesQuerySchema.parse(query);
    return {
      ok: true,
      baselines: (await this.sessionManager.listVisualBaselines(sessionId, args)).map(
        serializeVisualBaseline
      )
    };
  }

  async compareVisualBaseline(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = compareVisualBaselineBodySchema.parse(body);
    return {
      ok: true,
      result: serializeVisualCompareResult(
        await this.sessionManager.compareVisualBaseline(sessionId, args)
      )
    };
  }

  async visualAssertAnnotationChanged(
    sessionId: string,
    body: unknown
  ): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = visualAssertAnnotationChangedBodySchema.parse(body);
    return {
      ok: true,
      result: serializeVisualCompareResult(
        await this.sessionManager.visualAssertAnnotationChanged(sessionId, args)
      )
    };
  }

  async visualAssertAnnotationSimilar(
    sessionId: string,
    body: unknown
  ): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = visualAssertAnnotationSimilarBodySchema.parse(body);
    return {
      ok: true,
      result: serializeVisualCompareResult(
        await this.sessionManager.visualAssertAnnotationSimilar(sessionId, args)
      )
    };
  }

  async visualAssertChangeContained(
    sessionId: string,
    body: unknown
  ): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = visualAssertChangeContainedBodySchema.parse(body);
    return {
      ok: true,
      result: serializeVisualCompareResult(
        await this.sessionManager.visualAssertChangeContained(sessionId, args)
      )
    };
  }

  async listVisualAssertions(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    return {
      ok: true,
      assertions: (await this.sessionManager.listVisualAssertions(sessionId)).map(
        serializeVisualCompareResult
      )
    };
  }

  async getVisualDiffFile(
    sessionId: string,
    fileName: string
  ): Promise<{ readonly path: string; readonly body: Buffer }> {
    this.requireSession(sessionId);
    const safeFileName = pngFileNameSchema.parse(fileName);
    const path = this.sessionManager.getVisualDiffFilePath(sessionId, safeFileName);
    try {
      return {
        path,
        body: await readFile(path)
      };
    } catch {
      throw new HttpError(404, "VISUAL_DIFF_NOT_FOUND", `Visual diff not found: ${safeFileName}`);
    }
  }

  async getEvidenceReport(sessionId: string): Promise<Record<string, unknown>> {
    const session = this.requireSession(sessionId);
    const path = join(session.evidencePath, "report.md");

    try {
      return {
        ok: true,
        sessionId,
        path,
        text: await readFile(path, "utf8")
      };
    } catch {
      throw new HttpError(
        404,
        "EVIDENCE_REPORT_NOT_FOUND",
        `Evidence report is not available for session ${sessionId}. Stop the session first to generate report.md.`
      );
    }
  }

  async listScreenshots(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    return {
      ok: true,
      screenshots: (await this.sessionManager.listScreenshots(sessionId)).map(
        serializeScreenshotArtifact
      )
    };
  }

  async getScreenshotFile(
    sessionId: string,
    fileName: string
  ): Promise<{ readonly path: string; readonly body: Buffer }> {
    this.requireSession(sessionId);
    const safeFileName = pngFileNameSchema.parse(fileName);
    const path = this.sessionManager.getScreenshotFilePath(sessionId, safeFileName);
    try {
      return {
        path,
        body: await readFile(path)
      };
    } catch {
      throw new HttpError(404, "SCREENSHOT_NOT_FOUND", `Screenshot not found: ${safeFileName}`);
    }
  }

  async listAnnotations(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    return {
      ok: true,
      annotations: (await this.sessionManager.listAnnotations(sessionId)).map(serializeAnnotation)
    };
  }

  async createAnnotation(sessionId: string, body: unknown): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    const args = createAnnotationBodySchema.parse(body);
    return {
      ok: true,
      annotation: serializeAnnotation(
        await this.sessionManager.createAnnotation(sessionId, args)
      )
    };
  }

  async getAnnotationFile(
    sessionId: string,
    fileName: string
  ): Promise<{ readonly path: string; readonly body: Buffer }> {
    this.requireSession(sessionId);
    const safeFileName = pngFileNameSchema.parse(fileName);
    const path = this.sessionManager.getAnnotationFilePath(sessionId, safeFileName);
    try {
      return {
        path,
        body: await readFile(path)
      };
    } catch {
      throw new HttpError(404, "ANNOTATION_FILE_NOT_FOUND", `Annotation file not found: ${safeFileName}`);
    }
  }

  async getVisualHandoff(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSession(sessionId);
    return {
      ok: true,
      ...serializeVisualHandoff(await this.sessionManager.getVisualHandoff(sessionId))
    };
  }

  getAnnotationUi(sessionId: string, screenshotFileName?: string): string {
    this.requireSession(sessionId);
    const safeFileName =
      screenshotFileName && screenshotFileName.length > 0
        ? pngFileNameSchema.parse(screenshotFileName)
        : undefined;
    return renderAnnotationUi(sessionId, safeFileName);
  }

  private requireSession(sessionId: string): DesktopSession {
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const session = this.sessionManager.getSession(parsedSessionId);
    if (!session) {
      throw new HttpError(
        404,
        "SESSION_NOT_FOUND",
        `Desktop session not found: ${parsedSessionId}`
      );
    }
    return session;
  }
}
