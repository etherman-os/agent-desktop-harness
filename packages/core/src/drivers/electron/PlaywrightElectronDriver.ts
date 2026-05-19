import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { basename, resolve } from "node:path";
import {
  _electron,
  type ElectronApplication,
  type Locator,
  type Page
} from "playwright-core";
import type {
  ElectronActionResult,
  ElectronActionTarget,
  ElectronAppRef,
  ElectronAssertTextOptions,
  ElectronClickOptions,
  ElectronDriver,
  ElectronDriverStatus,
  ElectronFillOptions,
  ElectronOpenOptions,
  ElectronPressOptions,
  ElectronScreenshotOptions
} from "./electronTypes.js";
import { getElectronDriverStatus } from "./electronStatus.js";
import type { ElectronStatusOptions } from "./electronStatus.js";
import type {
  DesktopSession,
  ScreenshotResult,
  SessionId
} from "../../types.js";
import { ProcessError } from "../../errors.js";
import {
  createSanitizedEnvironment,
  findExecutableOnPath,
  waitForSpawn
} from "../../utils/command.js";
import { fileSize } from "../../utils/fs.js";
import { isoNow, now } from "../../utils/time.js";
import { terminateProcessTree } from "../../session/processTree.js";
import {
  compactDetails,
  formatBrowserTarget,
  resolveBrowserTarget
} from "../browser/browserSelectors.js";

interface ManagedElectronApp {
  readonly sessionId: SessionId;
  readonly appId: string;
  readonly mode: "playwright-electron" | "x11-fallback";
  readonly createdAt: string;
  readonly electronApp?: ElectronApplication;
  readonly appProcess?: ChildProcess;
  readonly page?: Page;
  readonly warnings: readonly string[];
}

export interface PlaywrightElectronDriverOptions extends ElectronStatusOptions {}

export class PlaywrightElectronDriver implements ElectronDriver {
  private readonly env: NodeJS.ProcessEnv;
  private readonly findExecutable: typeof findExecutableOnPath;
  private readonly apps = new Map<string, ManagedElectronApp>();
  private readonly sessionApps = new Map<SessionId, Set<string>>();
  private readonly lastAppBySession = new Map<SessionId, string>();

  constructor(options: PlaywrightElectronDriverOptions = {}) {
    this.env = options.env ?? process.env;
    this.findExecutable = options.findExecutable ?? findExecutableOnPath;
  }

  async getStatus(): Promise<ElectronDriverStatus> {
    return await getElectronDriverStatus({
      env: this.env,
      findExecutable: this.findExecutable
    });
  }

  async open(
    session: DesktopSession,
    options: ElectronOpenOptions
  ): Promise<ElectronAppRef> {
    validateOpenOptions(options);
    const status = await this.getStatus();
    const launch = await this.resolvePlaywrightLaunch(options);

    if (status.available && launch) {
      try {
        return await this.openPlaywrightElectron(session, options, status, launch);
      } catch (error) {
        if (options.command) {
          return await this.openFallback(session, options, [
            `Playwright Electron failed: ${error instanceof Error ? error.message : String(error)}`,
            "Use desktop_* X11 fallback tools for this session."
          ]);
        }
        throw error;
      }
    }

    if (!options.command) {
      throw new ProcessError(
        "openElectronApp requires command or executablePath/appPath when Playwright Electron launch is unavailable."
      );
    }

    const warnings = [
      ...status.warnings,
      ...status.errors,
      launch
        ? undefined
        : "No Electron executable was found or the provided command is not an Electron executable.",
      "Electron Playwright semantic mode is unavailable; use desktop_* X11 fallback tools."
    ].filter((value): value is string => value !== undefined);
    return await this.openFallback(session, options, warnings);
  }

  async click(
    session: DesktopSession,
    options: ElectronClickOptions
  ): Promise<ElectronActionResult> {
    const managed = this.requireApp(session.id, options.appId);
    if (managed.mode !== "playwright-electron" || !managed.page) {
      return unavailableResult(session, managed, "electron.click", {
        target: targetDetails(options),
        label: options.label
      });
    }

    const locator = await requireLocator(managed.page, options);
    await locator.first().click({ timeout: options.timeoutMs ?? 5000 });
    return successResult(session, managed, "electron.click", {
      target: formatBrowserTarget(options),
      label: options.label
    });
  }

  async fill(
    session: DesktopSession,
    options: ElectronFillOptions
  ): Promise<ElectronActionResult> {
    const managed = this.requireApp(session.id, options.appId);
    const details = {
      target: targetDetails(options),
      redacted: options.secret === true,
      valueLength: options.value.length,
      value: options.secret === true ? undefined : truncateForLog(options.value),
      truncated: options.secret === true ? undefined : options.value.length > 256,
      label: options.label
    };
    if (managed.mode !== "playwright-electron" || !managed.page) {
      return unavailableResult(session, managed, "electron.fill", details);
    }

    const locator = await requireLocator(managed.page, options);
    await locator.first().fill(options.value, { timeout: options.timeoutMs ?? 5000 });
    return successResult(session, managed, "electron.fill", details);
  }

  async press(
    session: DesktopSession,
    options: ElectronPressOptions
  ): Promise<ElectronActionResult> {
    if (options.key.trim().length === 0) {
      throw new ProcessError("electronPress requires a non-empty key.");
    }

    const managed = this.requireApp(session.id, options.appId);
    if (managed.mode !== "playwright-electron" || !managed.page) {
      return unavailableResult(session, managed, "electron.press", {
        key: options.key,
        target: hasAnyTarget(options) ? targetDetails(options) : undefined,
        label: options.label
      });
    }

    if (hasAnyTarget(options)) {
      const locator = await requireLocator(managed.page, options);
      await locator.first().press(options.key, { timeout: options.timeoutMs ?? 5000 });
    } else {
      await managed.page.keyboard.press(options.key);
    }

    return successResult(session, managed, "electron.press", {
      key: options.key,
      target: hasAnyTarget(options) ? targetDetails(options) : undefined,
      label: options.label
    });
  }

  async assertText(
    session: DesktopSession,
    options: ElectronAssertTextOptions
  ): Promise<ElectronActionResult> {
    if (options.text.trim().length === 0) {
      throw new ProcessError("electronAssertText requires non-empty text.");
    }

    const managed = this.requireApp(session.id, options.appId);
    if (managed.mode !== "playwright-electron" || !managed.page) {
      return unavailableResult(session, managed, "electron.assert_text", {
        text: options.text,
        label: options.label
      });
    }

    await managed.page
      .getByText(options.text)
      .first()
      .waitFor({ state: "visible", timeout: options.timeoutMs ?? 5000 });
    return successResult(session, managed, "electron.assert_text", {
      text: options.text,
      label: options.label
    });
  }

  async screenshot(
    session: DesktopSession,
    filePath: string,
    sequence: number,
    options: ElectronScreenshotOptions
  ): Promise<ScreenshotResult | undefined> {
    const managed = this.requireApp(session.id, options.appId);
    if (managed.mode !== "playwright-electron" || !managed.page) {
      return undefined;
    }

    await managed.page.bringToFront().catch(() => undefined);
    await managed.page.screenshot({
      path: filePath,
      fullPage: options.fullPage ?? false,
      type: "png"
    });
    const size = await fileSize(filePath);
    if (size <= 0) {
      throw new ProcessError(`Electron screenshot file was created but is empty: ${filePath}`);
    }

    const viewport = managed.page.viewportSize();
    const createdAt = now();
    return {
      artifactId: `screenshot-${String(sequence).padStart(4, "0")}`,
      sessionId: session.id,
      path: filePath,
      width: viewport?.width ?? session.width,
      height: viewport?.height ?? session.height,
      capturedAt: createdAt,
      createdAt,
      display: session.display,
      sequence,
      label: options.label
    };
  }

  async close(session: DesktopSession, appId?: string): Promise<void> {
    if (appId) {
      await this.closeApp(appId);
      return;
    }

    await this.closeAll(session.id);
  }

  async closeAll(sessionId: SessionId): Promise<void> {
    const appIds = [...(this.sessionApps.get(sessionId) ?? [])];
    const errors: string[] = [];
    for (const appId of appIds) {
      try {
        await this.closeApp(appId);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    this.sessionApps.delete(sessionId);
    this.lastAppBySession.delete(sessionId);
    if (errors.length > 0) {
      throw new ProcessError(`Electron cleanup failed: ${errors.join("; ")}`);
    }
  }

  private async openPlaywrightElectron(
    session: DesktopSession,
    options: ElectronOpenOptions,
    status: ElectronDriverStatus,
    launch: ElectronLaunchConfig
  ): Promise<ElectronAppRef> {
    const createdAt = isoNow();
    const warnings = electronLaunchWarnings(status, launch);
    const electronApp = await _electron.launch({
      executablePath: launch.executablePath,
      args: withElectronDefaultArgs(launch.args),
      cwd: resolve(options.cwd ?? session.workspacePath),
      timeout: options.timeoutMs ?? 30_000,
      env: toPlaywrightEnv(
        createSanitizedEnvironment({
          ...session.config.env,
          ...options.env,
          DISPLAY: session.display,
          AGENT_DESKTOP_HARNESS_SESSION_ID: session.id
        })
      )
    });

    try {
      const page = await selectElectronWindow(electronApp, options);
      await page.bringToFront().catch(() => undefined);
      await page.waitForLoadState("domcontentloaded", {
        timeout: options.timeoutMs ?? 30_000
      }).catch(() => undefined);
      const managed: ManagedElectronApp = {
        sessionId: session.id,
        appId: randomUUID(),
        mode: "playwright-electron",
        createdAt,
        electronApp,
        page,
        warnings
      };
      this.rememberApp(managed);
      const processId = electronApp.process()?.pid;
      return {
        sessionId: session.id,
        appId: managed.appId,
        createdAt,
        mode: "playwright-electron",
        processId,
        windowTitle: await page.title().catch(() => undefined),
        warnings: managed.warnings
      };
    } catch (error) {
      await electronApp.close().catch(() => undefined);
      throw error;
    }
  }

  private async openFallback(
    session: DesktopSession,
    options: ElectronOpenOptions,
    warnings: readonly string[]
  ): Promise<ElectronAppRef> {
    if (!options.command) {
      throw new ProcessError("Electron X11 fallback requires command.");
    }

    const child = spawn(options.command, [...(options.args ?? [])], {
      cwd: resolve(options.cwd ?? session.workspacePath),
      detached: true,
      env: createSanitizedEnvironment({
        ...session.config.env,
        ...options.env,
        DISPLAY: session.display,
        AGENT_DESKTOP_HARNESS_SESSION_ID: session.id
      }),
      shell: false,
      stdio: "ignore"
    });
    await waitForSpawn(child, options.command);

    const managed: ManagedElectronApp = {
      sessionId: session.id,
      appId: randomUUID(),
      mode: "x11-fallback",
      createdAt: isoNow(),
      appProcess: child,
      warnings
    };
    this.rememberApp(managed);
    return {
      sessionId: session.id,
      appId: managed.appId,
      createdAt: managed.createdAt,
      mode: "x11-fallback",
      processId: child.pid,
      warnings
    };
  }

  private async resolvePlaywrightLaunch(
    options: ElectronOpenOptions
  ): Promise<ElectronLaunchConfig | undefined> {
    const executablePath = await this.resolveElectronExecutable(options);
    if (!executablePath) {
      return undefined;
    }

    const args = options.args && options.args.length > 0
      ? [...options.args]
      : options.appPath
        ? [options.appPath]
        : [];

    return {
      executablePath,
      args
    };
  }

  private async resolveElectronExecutable(
    options: ElectronOpenOptions
  ): Promise<string | undefined> {
    if (options.executablePath) {
      return await this.findExecutable(options.executablePath, this.env, options.cwd);
    }
    if (options.command) {
      const resolved = await this.findExecutable(options.command, this.env, options.cwd);
      if (resolved && isElectronExecutable(resolved)) {
        return resolved;
      }
      return undefined;
    }
    return await this.findExecutable("electron", this.env, options.cwd);
  }

  private rememberApp(managed: ManagedElectronApp): void {
    this.apps.set(managed.appId, managed);
    const appIds = this.sessionApps.get(managed.sessionId) ?? new Set<string>();
    appIds.add(managed.appId);
    this.sessionApps.set(managed.sessionId, appIds);
    this.lastAppBySession.set(managed.sessionId, managed.appId);
  }

  private requireApp(sessionId: SessionId, appId?: string): ManagedElectronApp {
    const resolvedAppId = appId ?? this.lastAppBySession.get(sessionId);
    if (!resolvedAppId) {
      throw new ProcessError(`No Electron app is open for session ${sessionId}.`);
    }

    const app = this.apps.get(resolvedAppId);
    if (!app || app.sessionId !== sessionId) {
      throw new ProcessError(`Electron app was not found: ${resolvedAppId}`);
    }
    return app;
  }

  private async closeApp(appId: string): Promise<void> {
    const managed = this.apps.get(appId);
    if (!managed) {
      return;
    }

    this.apps.delete(appId);
    const appIds = this.sessionApps.get(managed.sessionId);
    appIds?.delete(appId);
    if (appIds && appIds.size === 0) {
      this.sessionApps.delete(managed.sessionId);
    }
    if (this.lastAppBySession.get(managed.sessionId) === appId) {
      const replacement = [...(appIds ?? [])].at(-1);
      if (replacement) {
        this.lastAppBySession.set(managed.sessionId, replacement);
      } else {
        this.lastAppBySession.delete(managed.sessionId);
      }
    }

    await managed.electronApp?.close().catch(() => undefined);
    await terminateProcessTree(managed.appProcess).catch(() => undefined);
  }
}

interface ElectronLaunchConfig {
  readonly executablePath: string;
  readonly args: readonly string[];
}

async function selectElectronWindow(
  electronApp: ElectronApplication,
  options: ElectronOpenOptions
): Promise<Page> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;
  let fallback = await electronApp.firstWindow({ timeout: timeoutMs });

  while (Date.now() <= deadline) {
    const windows = electronApp.windows();
    for (const page of windows.length > 0 ? windows : [fallback]) {
      const title = await page.title().catch(() => "");
      if (options.excludeDevtools === true && isDevtoolsTitle(title)) {
        continue;
      }
      if (options.windowTitleIncludes && !title.includes(options.windowTitleIncludes)) {
        fallback = page;
        continue;
      }
      return page;
    }
    await delay(200);
  }

  return fallback;
}

async function requireLocator(
  page: Page,
  target: ElectronActionTarget
): Promise<Locator> {
  const resolved = resolveBrowserTarget(target);
  const locator = locatorForTarget(page, resolved);
  const count = await locator.count().catch(() => 0);
  if (count < 1) {
    throw new ProcessError(
      `Electron locator did not match any elements: ${JSON.stringify(resolved)}`
    );
  }
  return locator;
}

function locatorForTarget(
  page: Page,
  resolved: ReturnType<typeof resolveBrowserTarget>
): Locator {
  switch (resolved.kind) {
    case "selector":
      return page.locator(resolved.value);
    case "testId":
      return page.getByTestId(resolved.value);
    case "role":
      return page.getByRole(resolved.value as never, {
        name: resolved.name
      });
    case "label":
      return page.getByLabel(resolved.value);
    case "placeholder":
      return page.getByPlaceholder(resolved.value);
    case "text":
      return page.getByText(resolved.value);
  }
}

function validateOpenOptions(options: ElectronOpenOptions): void {
  if (options.command !== undefined && options.command.trim().length === 0) {
    throw new ProcessError("openElectronApp command cannot be empty.");
  }
  if (options.executablePath !== undefined && options.executablePath.trim().length === 0) {
    throw new ProcessError("openElectronApp executablePath cannot be empty.");
  }
  if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
    throw new ProcessError("openElectronApp timeoutMs must be positive.");
  }
}

function withElectronDefaultArgs(args: readonly string[]): string[] {
  return args.includes("--no-sandbox") ? [...args] : ["--no-sandbox", ...args];
}

function isElectronExecutable(path: string): boolean {
  const name = basename(path).toLowerCase();
  return name === "electron" || name === "electron.exe" || name.includes("electron");
}

function successResult(
  session: DesktopSession,
  app: ManagedElectronApp,
  actionType: string,
  details: Readonly<Record<string, unknown>>
): ElectronActionResult {
  return {
    sessionId: session.id,
    appId: app.appId,
    actionType,
    success: true,
    mode: app.mode,
    createdAt: isoNow(),
    details: compactDetails(details),
    warnings: app.warnings
  };
}

function unavailableResult(
  session: DesktopSession,
  app: ManagedElectronApp,
  actionType: string,
  details: Readonly<Record<string, unknown>>
): ElectronActionResult {
  return {
    sessionId: session.id,
    appId: app.appId,
    actionType,
    success: false,
    mode: "x11-fallback",
    createdAt: isoNow(),
    details: compactDetails({
      ...details,
      unavailable: true,
      guidance: "Electron Playwright semantic mode is unavailable; use desktop_* X11 fallback tools."
    }),
    warnings: app.warnings
  };
}

function targetDetails(target: ElectronActionTarget): Readonly<Record<string, unknown>> {
  return compactDetails({
    selector: target.selector,
    text: target.text,
    role: target.role,
    name: target.name,
    targetLabel: target.label,
    placeholder: target.placeholder,
    testId: target.testId
  });
}

function hasAnyTarget(options: ElectronActionTarget): boolean {
  return (
    options.selector !== undefined ||
    options.testId !== undefined ||
    options.role !== undefined ||
    options.label !== undefined ||
    options.placeholder !== undefined ||
    options.text !== undefined
  );
}

function isDevtoolsTitle(title: string): boolean {
  return /DevTools|Developer Tools|Inspect/i.test(title);
}

function truncateForLog(value: string): string {
  return value.length > 256 ? `${value.slice(0, 256)}...` : value;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function toPlaywrightEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

function electronLaunchWarnings(
  status: ElectronDriverStatus,
  launch: ElectronLaunchConfig
): readonly string[] {
  if (!launch.executablePath) {
    return status.warnings;
  }

  return status.warnings.filter(
    (warning) => !warning.includes("No electron binary was found")
  );
}
