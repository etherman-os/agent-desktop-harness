import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { isAbsolute, resolve } from "node:path";
import { ProcessError } from "../../errors.js";
import { terminateProcessTree } from "../../session/processTree.js";
import type { DesktopSession, ScreenshotResult, SessionId } from "../../types.js";
import {
  createSanitizedEnvironment,
  findExecutableOnPath,
  waitForSpawn,
} from "../../utils/command.js";
import { fileSize } from "../../utils/fs.js";
import { isoNow, now } from "../../utils/time.js";
import type { TauriStatusOptions } from "./tauriStatus.js";
import { getTauriDriverStatus } from "./tauriStatus.js";
import type {
  TauriActionResult,
  TauriActionTarget,
  TauriAppRef,
  TauriAssertTextOptions,
  TauriClickOptions,
  TauriDriver,
  TauriDriverStatus,
  TauriFillOptions,
  TauriOpenOptions,
  TauriScreenshotOptions,
} from "./tauriTypes.js";

interface ManagedTauriApp {
  readonly sessionId: SessionId;
  readonly appId: string;
  readonly mode: "webdriver" | "x11-fallback";
  readonly createdAt: string;
  readonly webdriverUrl?: string;
  readonly webdriverSessionId?: string;
  readonly tauriDriverProcess?: ChildProcess;
  readonly appProcess?: ChildProcess;
  readonly warnings: readonly string[];
}

interface WebDriverElementRef {
  readonly elementId: string;
}

const W3C_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
const DEFAULT_WEBDRIVER_PORT = 4444;

export interface TauriWebDriverDriverOptions extends TauriStatusOptions {
  readonly fetch?: typeof fetch;
}

export class TauriWebDriverDriver implements TauriDriver {
  private readonly env: NodeJS.ProcessEnv;
  private readonly findExecutable: typeof findExecutableOnPath;
  private readonly platform: NodeJS.Platform;
  private readonly fetchLike: typeof fetch;
  private readonly apps = new Map<string, ManagedTauriApp>();
  private readonly sessionApps = new Map<SessionId, Set<string>>();
  private readonly lastAppBySession = new Map<SessionId, string>();

  constructor(options: TauriWebDriverDriverOptions = {}) {
    this.env = options.env ?? process.env;
    this.findExecutable = options.findExecutable ?? findExecutableOnPath;
    this.platform = options.platform ?? process.platform;
    this.fetchLike = options.fetch ?? fetch;
  }

  async getStatus(): Promise<TauriDriverStatus> {
    return await getTauriDriverStatus({
      env: this.env,
      platform: this.platform,
      findExecutable: this.findExecutable,
    });
  }

  async open(session: DesktopSession, options: TauriOpenOptions): Promise<TauriAppRef> {
    validateOpenOptions(options);
    const status = await this.getStatus();
    const applicationPath = await this.resolveApplicationPath(options);

    if (status.available && applicationPath) {
      try {
        return await this.openWebDriver(session, options, status, applicationPath);
      } catch (error) {
        const fallback = await this.openFallback(session, options, [
          `Tauri WebDriver failed: ${error instanceof Error ? error.message : String(error)}`,
          "Use desktop_* X11 fallback tools for this session.",
        ]);
        return fallback;
      }
    }

    const warnings = [
      ...status.warnings,
      ...status.errors,
      applicationPath
        ? undefined
        : "No built Tauri application path was provided or inferred; tauri-driver requires a built app binary.",
      "Tauri WebDriver semantic mode is unavailable; use desktop_* X11 fallback tools.",
    ].filter((value): value is string => value !== undefined);
    return await this.openFallback(session, options, warnings);
  }

  async click(session: DesktopSession, options: TauriClickOptions): Promise<TauriActionResult> {
    const managed = this.requireApp(session.id, options.appId);
    if (managed.mode !== "webdriver" || !managed.webdriverSessionId || !managed.webdriverUrl) {
      return unavailableResult(session, managed, "tauri.click", {
        target: targetDetails(options),
        label: options.label,
      });
    }

    const element = await this.findElement(managed, options, options.timeoutMs);
    await this.webdriverRequest(
      managed,
      "POST",
      `/session/${managed.webdriverSessionId}/element/${element.elementId}/click`,
      {},
    );
    return successResult(session, managed, "tauri.click", {
      target: targetDetails(options),
      label: options.label,
    });
  }

  async fill(session: DesktopSession, options: TauriFillOptions): Promise<TauriActionResult> {
    const managed = this.requireApp(session.id, options.appId);
    if (managed.mode !== "webdriver" || !managed.webdriverSessionId || !managed.webdriverUrl) {
      return unavailableResult(session, managed, "tauri.fill", {
        target: targetDetails(options),
        redacted: options.secret === true,
        valueLength: options.value.length,
        value: options.secret === true ? undefined : truncateForLog(options.value),
        truncated: options.secret === true ? undefined : options.value.length > 256,
        label: options.label,
      });
    }

    const element = await this.findElement(managed, options, options.timeoutMs);
    await this.webdriverRequest(
      managed,
      "POST",
      `/session/${managed.webdriverSessionId}/element/${element.elementId}/clear`,
      {},
    ).catch(() => undefined);
    await this.webdriverRequest(
      managed,
      "POST",
      `/session/${managed.webdriverSessionId}/element/${element.elementId}/value`,
      {
        text: options.value,
        value: [...options.value],
      },
    );
    return successResult(session, managed, "tauri.fill", {
      target: targetDetails(options),
      redacted: options.secret === true,
      valueLength: options.value.length,
      value: options.secret === true ? undefined : truncateForLog(options.value),
      truncated: options.secret === true ? undefined : options.value.length > 256,
      label: options.label,
    });
  }

  async assertText(
    session: DesktopSession,
    options: TauriAssertTextOptions,
  ): Promise<TauriActionResult> {
    const managed = this.requireApp(session.id, options.appId);
    if (options.text.trim().length === 0) {
      throw new ProcessError("tauriAssertText requires non-empty text.");
    }
    if (managed.mode !== "webdriver" || !managed.webdriverSessionId || !managed.webdriverUrl) {
      return unavailableResult(session, managed, "tauri.assert_text", {
        text: options.text,
        label: options.label,
      });
    }

    await this.findElement(managed, { text: options.text }, options.timeoutMs);
    return successResult(session, managed, "tauri.assert_text", {
      text: options.text,
      label: options.label,
    });
  }

  async screenshot(
    session: DesktopSession,
    filePath: string,
    sequence: number,
    options: TauriScreenshotOptions,
  ): Promise<ScreenshotResult | undefined> {
    const managed = this.requireApp(session.id, options.appId);
    if (managed.mode !== "webdriver" || !managed.webdriverSessionId || !managed.webdriverUrl) {
      return undefined;
    }

    const response = await this.webdriverRequest<string>(
      managed,
      "GET",
      `/session/${managed.webdriverSessionId}/screenshot`,
    );
    await writeFile(filePath, Buffer.from(response, "base64"));
    const size = await fileSize(filePath);
    if (size <= 0) {
      throw new ProcessError(`Tauri WebDriver screenshot was empty: ${filePath}`);
    }

    const createdAt = now();
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
      label: options.label,
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
      throw new ProcessError(`Tauri cleanup failed: ${errors.join("; ")}`);
    }
  }

  private async openWebDriver(
    session: DesktopSession,
    options: TauriOpenOptions,
    status: TauriDriverStatus,
    applicationPath: string,
  ): Promise<TauriAppRef> {
    const port = await reserveWebDriverPort(options.webdriverPort);
    const webdriverUrl = `http://127.0.0.1:${port}`;
    const tauriDriverProcess = spawn(
      status.tauriDriverPath ?? "tauri-driver",
      ["--port", String(port)],
      {
        cwd: resolve(options.cwd ?? session.workspacePath),
        detached: true,
        env: createSanitizedEnvironment({
          ...session.config.env,
          DISPLAY: session.display,
          AGENT_DESKTOP_HARNESS_SESSION_ID: session.id,
        }),
        shell: false,
        stdio: "ignore",
      },
    );
    await waitForSpawn(tauriDriverProcess, "tauri-driver");

    const managed: ManagedTauriApp = {
      sessionId: session.id,
      appId: randomUUID(),
      mode: "webdriver",
      createdAt: isoNow(),
      webdriverUrl,
      tauriDriverProcess,
      warnings: status.warnings,
    };

    try {
      await waitForWebDriverStatus(webdriverUrl, this.fetchLike, options.timeoutMs ?? 10_000);
      const sessionId = await this.createWebDriverSession(webdriverUrl, applicationPath);
      const finalManaged = {
        ...managed,
        webdriverSessionId: sessionId,
      };
      this.rememberApp(finalManaged);
      return {
        sessionId: session.id,
        appId: finalManaged.appId,
        webdriverUrl,
        createdAt: finalManaged.createdAt,
        mode: "webdriver",
        warnings: finalManaged.warnings,
      };
    } catch (error) {
      await terminateProcessTree(tauriDriverProcess).catch(() => undefined);
      throw error;
    }
  }

  private async openFallback(
    session: DesktopSession,
    options: TauriOpenOptions,
    warnings: readonly string[],
  ): Promise<TauriAppRef> {
    const cwd = resolve(options.cwd ?? session.workspacePath);
    const child = spawn(options.command, [...options.args], {
      cwd,
      detached: true,
      env: createSanitizedEnvironment({
        ...session.config.env,
        ...options.env,
        DISPLAY: session.display,
        AGENT_DESKTOP_HARNESS_SESSION_ID: session.id,
      }),
      shell: false,
      stdio: "ignore",
    });
    await waitForSpawn(child, options.command);

    const managed: ManagedTauriApp = {
      sessionId: session.id,
      appId: randomUUID(),
      mode: "x11-fallback",
      createdAt: isoNow(),
      appProcess: child,
      warnings,
    };
    this.rememberApp(managed);

    return {
      sessionId: session.id,
      appId: managed.appId,
      processId: child.pid,
      createdAt: managed.createdAt,
      mode: "x11-fallback",
      warnings,
    };
  }

  private rememberApp(managed: ManagedTauriApp): void {
    this.apps.set(managed.appId, managed);
    const appIds = this.sessionApps.get(managed.sessionId) ?? new Set<string>();
    appIds.add(managed.appId);
    this.sessionApps.set(managed.sessionId, appIds);
    this.lastAppBySession.set(managed.sessionId, managed.appId);
  }

  private requireApp(sessionId: SessionId, appId?: string): ManagedTauriApp {
    const resolvedAppId = appId ?? this.lastAppBySession.get(sessionId);
    if (!resolvedAppId) {
      throw new ProcessError(`No Tauri app is open for session ${sessionId}.`);
    }

    const app = this.apps.get(resolvedAppId);
    if (!app || app.sessionId !== sessionId) {
      throw new ProcessError(`Tauri app was not found: ${resolvedAppId}`);
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

    if (managed.webdriverSessionId && managed.webdriverUrl) {
      await this.webdriverRequest(
        managed,
        "DELETE",
        `/session/${managed.webdriverSessionId}`,
      ).catch(() => undefined);
    }
    await terminateProcessTree(managed.appProcess).catch(() => undefined);
    await terminateProcessTree(managed.tauriDriverProcess).catch(() => undefined);
  }

  private async resolveApplicationPath(options: TauriOpenOptions): Promise<string | undefined> {
    const candidate = options.applicationPath?.trim();
    if (candidate) {
      const resolved = await this.findExecutable(candidate, this.env, options.cwd);
      return (
        resolved ??
        (isAbsolute(candidate) ? candidate : resolve(options.cwd ?? process.cwd(), candidate))
      );
    }

    if (options.args.length === 0) {
      return await this.findExecutable(options.command, this.env, options.cwd);
    }

    return undefined;
  }

  private async createWebDriverSession(
    webdriverUrl: string,
    applicationPath: string,
  ): Promise<string> {
    const body = {
      capabilities: {
        alwaysMatch: {
          "tauri:options": {
            application: applicationPath,
          },
        },
      },
    };
    const response = await webdriverHttpRequest<{
      readonly sessionId?: string;
      readonly capabilities?: Record<string, unknown>;
    }>(this.fetchLike, webdriverUrl, "POST", "/session", body);
    if (!response.sessionId) {
      throw new ProcessError("tauri-driver did not return a WebDriver session id.");
    }
    return response.sessionId;
  }

  private async findElement(
    managed: ManagedTauriApp,
    target: TauriActionTarget,
    timeoutMs = 5000,
  ): Promise<WebDriverElementRef> {
    if (!managed.webdriverSessionId) {
      throw new ProcessError("Tauri WebDriver session is not open.");
    }

    const locator = webdriverLocatorForTarget(target);
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() <= deadline) {
      try {
        const value = await this.webdriverRequest<Record<string, string>>(
          managed,
          "POST",
          `/session/${managed.webdriverSessionId}/element`,
          locator,
        );
        const elementId = value[W3C_ELEMENT_KEY] ?? value.ELEMENT;
        if (elementId) {
          return { elementId };
        }
      } catch (error) {
        lastError = error;
      }
      await delay(200);
    }

    throw new ProcessError(
      `Tauri WebDriver locator did not match any elements: ${JSON.stringify(locator)}${
        lastError instanceof Error ? ` (${lastError.message})` : ""
      }`,
    );
  }

  private async webdriverRequest<T>(
    managed: ManagedTauriApp,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!managed.webdriverUrl) {
      throw new ProcessError("Tauri WebDriver URL is not available.");
    }
    return await webdriverHttpRequest<T>(this.fetchLike, managed.webdriverUrl, method, path, body);
  }
}

export async function reserveWebDriverPort(preferredPort?: number): Promise<number> {
  if (
    preferredPort !== undefined &&
    (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535)
  ) {
    throw new ProcessError(`Invalid WebDriver port: ${preferredPort}`);
  }

  const server = createServer();
  const port = preferredPort ?? 0;
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  const address = server.address();
  const resolvedPort =
    typeof address === "object" && address !== null ? address.port : DEFAULT_WEBDRIVER_PORT;
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolveClose();
    });
  });
  return resolvedPort;
}

function validateOpenOptions(options: TauriOpenOptions): void {
  if (options.command.trim().length === 0) {
    throw new ProcessError("openTauriApp requires a non-empty command.");
  }
  if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
    throw new ProcessError("openTauriApp timeoutMs must be positive.");
  }
  if (
    options.nativePort !== undefined &&
    (!Number.isInteger(options.nativePort) || options.nativePort < 1 || options.nativePort > 65535)
  ) {
    throw new ProcessError(`Invalid native port: ${options.nativePort}`);
  }
}

function webdriverLocatorForTarget(target: TauriActionTarget): { using: string; value: string } {
  if (isNonEmpty(target.selector)) {
    return { using: "css selector", value: target.selector };
  }
  if (isNonEmpty(target.testId)) {
    return { using: "css selector", value: `[data-testid="${cssString(target.testId)}"]` };
  }
  if (isNonEmpty(target.role)) {
    if (target.role === "button" && isNonEmpty(target.name)) {
      return {
        using: "xpath",
        value: `//button[normalize-space(.)=${xpathLiteral(target.name)}] | //*[@role=${xpathLiteral(target.role)} and normalize-space(.)=${xpathLiteral(target.name)}]`,
      };
    }
    if (isNonEmpty(target.name)) {
      return {
        using: "xpath",
        value: `//*[@role=${xpathLiteral(target.role)} and normalize-space(.)=${xpathLiteral(target.name)}]`,
      };
    }
    return { using: "xpath", value: `//*[@role=${xpathLiteral(target.role)}]` };
  }
  if (isNonEmpty(target.label)) {
    return {
      using: "xpath",
      value: `//*[@aria-label=${xpathLiteral(target.label)}] | //label[normalize-space(.)=${xpathLiteral(target.label)}]/following::input[1] | //label[normalize-space(.)=${xpathLiteral(target.label)}]/following::textarea[1]`,
    };
  }
  if (isNonEmpty(target.placeholder)) {
    return { using: "css selector", value: `[placeholder="${cssString(target.placeholder)}"]` };
  }
  if (isNonEmpty(target.text)) {
    return {
      using: "xpath",
      value: `//*[normalize-space(.)=${xpathLiteral(target.text)}]`,
    };
  }

  throw new ProcessError(
    "Tauri action requires selector, testId, role, label, placeholder, or text.",
  );
}

async function webdriverHttpRequest<T>(
  fetchLike: typeof fetch,
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetchLike(`${baseUrl}${path}`, {
    method,
    headers:
      body === undefined
        ? undefined
        : {
            "content-type": "application/json",
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text.length > 0 ? (JSON.parse(text) as { value?: unknown }) : {};
  if (!response.ok) {
    const value = parsed.value;
    const message =
      typeof value === "object" && value !== null && "message" in value
        ? String((value as { message?: unknown }).message)
        : text || `HTTP ${response.status}`;
    throw new ProcessError(`Tauri WebDriver request failed: ${message}`);
  }
  return (parsed as { value?: T }).value as T;
}

async function waitForWebDriverStatus(
  webdriverUrl: string,
  fetchLike: typeof fetch,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() <= deadline) {
    try {
      await webdriverHttpRequest(fetchLike, webdriverUrl, "GET", "/status");
      return;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new ProcessError(
    `tauri-driver did not become ready within ${timeoutMs}ms${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`,
  );
}

function successResult(
  session: DesktopSession,
  app: ManagedTauriApp,
  actionType: string,
  details: Readonly<Record<string, unknown>>,
): TauriActionResult {
  return {
    sessionId: session.id,
    appId: app.appId,
    actionType,
    success: true,
    mode: app.mode,
    createdAt: isoNow(),
    details: compactDetails(details),
    warnings: app.warnings,
  };
}

function unavailableResult(
  session: DesktopSession,
  app: ManagedTauriApp,
  actionType: string,
  details: Readonly<Record<string, unknown>>,
): TauriActionResult {
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
      guidance: "Tauri WebDriver semantic mode is unavailable; use desktop_* X11 fallback tools.",
    }),
    warnings: app.warnings,
  };
}

function targetDetails(target: TauriActionTarget): Readonly<Record<string, unknown>> {
  return compactDetails({
    selector: target.selector,
    text: target.text,
    role: target.role,
    name: target.name,
    targetLabel: target.label,
    placeholder: target.placeholder,
    testId: target.testId,
  });
}

function compactDetails(
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  return `concat(${value
    .split("'")
    .map((part) => `'${part}'`)
    .join(', ""\'"", ')})`;
}

function truncateForLog(value: string): string {
  return value.length > 256 ? `${value.slice(0, 256)}...` : value;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
