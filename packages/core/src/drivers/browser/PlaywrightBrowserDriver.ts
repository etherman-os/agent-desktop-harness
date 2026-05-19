import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import {
  chromium,
  firefox,
  type Browser,
  type BrowserContext,
  type BrowserType,
  type Locator,
  type Page
} from "playwright-core";
import type {
  BrowserActionResult,
  BrowserAssertTextOptions,
  BrowserClickOptions,
  BrowserDriver,
  BrowserFillOptions,
  BrowserName,
  BrowserOpenOptions,
  BrowserPageRef,
  BrowserPressOptions,
  BrowserScreenshotOptions,
  BrowserSelectorTarget
} from "./browserTypes.js";
import {
  compactDetails,
  formatBrowserTarget,
  makeBrowserFillDetails,
  resolveBrowserTarget
} from "./browserSelectors.js";
import type {
  DesktopSession,
  ScreenshotResult,
  SessionId
} from "../../types.js";
import { ProcessError } from "../../errors.js";
import {
  createSanitizedEnvironment,
  findExecutableOnPath
} from "../../utils/command.js";
import { fileSize } from "../../utils/fs.js";
import { isoNow, now } from "../../utils/time.js";

export interface PlaywrightBrowserDriverOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly findExecutable?: typeof findExecutableOnPath;
}

interface ManagedBrowserPage {
  readonly sessionId: SessionId;
  readonly pageId: string;
  readonly context: BrowserContext;
  readonly browser?: Browser;
  readonly page: Page;
  readonly createdAt: string;
}

export interface DetectedBrowserExecutable {
  readonly path: string;
  readonly name: BrowserName;
  readonly source: "env" | "path" | "option";
}

const BROWSER_CANDIDATES: readonly {
  readonly command: string;
  readonly name: BrowserName;
}[] = [
  { command: "chromium", name: "chromium" },
  { command: "chromium-browser", name: "chromium" },
  { command: "google-chrome", name: "chrome" },
  { command: "google-chrome-stable", name: "chrome" },
  { command: "firefox", name: "firefox" }
];

export class PlaywrightBrowserDriver implements BrowserDriver {
  private readonly env: NodeJS.ProcessEnv;
  private readonly findExecutable: typeof findExecutableOnPath;
  private readonly pages = new Map<string, ManagedBrowserPage>();
  private readonly sessionPages = new Map<SessionId, Set<string>>();
  private readonly lastPageBySession = new Map<SessionId, string>();

  constructor(options: PlaywrightBrowserDriverOptions = {}) {
    this.env = options.env ?? process.env;
    this.findExecutable = options.findExecutable ?? findExecutableOnPath;
  }

  async open(
    session: DesktopSession,
    options: BrowserOpenOptions
  ): Promise<BrowserPageRef> {
    validateOpenOptions(options);
    const executable = await this.resolveExecutable(options);
    const browserType = getBrowserType(executable.name);
    const viewport = options.viewport ?? {
      width: session.width,
      height: session.height
    };
    const launchOptions = {
      executablePath: executable.path,
      headless: false,
      args: browserLaunchArgs(executable.name, viewport),
      env: createSanitizedEnvironment({
        DISPLAY: session.display,
        AGENT_DESKTOP_HARNESS_SESSION_ID: session.id
      })
    };

    const pageId = randomUUID();
    let browser: Browser | undefined;
    let context: BrowserContext;

    if (options.userDataDir) {
      context = await browserType.launchPersistentContext(options.userDataDir, {
        ...launchOptions,
        viewport
      });
    } else {
      browser = await browserType.launch(launchOptions);
      context = await browser.newContext({ viewport });
    }

    const page = await context.newPage();
    await page.goto(options.url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs ?? 30_000
    });
    await page.waitForLoadState("load", { timeout: options.timeoutMs ?? 30_000 }).catch(() => undefined);
    await page.bringToFront().catch(() => undefined);
    const createdAt = isoNow();
    const managed: ManagedBrowserPage = {
      sessionId: session.id,
      pageId,
      context,
      browser,
      page,
      createdAt
    };
    this.pages.set(pageId, managed);
    const pageIds = this.sessionPages.get(session.id) ?? new Set<string>();
    pageIds.add(pageId);
    this.sessionPages.set(session.id, pageIds);
    this.lastPageBySession.set(session.id, pageId);

    return {
      sessionId: session.id,
      pageId,
      url: page.url(),
      title: await page.title(),
      createdAt
    };
  }

  async click(
    session: DesktopSession,
    options: BrowserClickOptions
  ): Promise<BrowserActionResult> {
    const managed = this.requirePage(session.id, options.pageId);
    const locator = await this.requireLocator(managed.page, options);
    await locator.first().click({ timeout: options.timeoutMs ?? 5000 });
    return makeBrowserActionResult(session, managed.pageId, "browser.click", {
      target: formatBrowserTarget(options),
      label: options.label
    });
  }

  async fill(
    session: DesktopSession,
    options: BrowserFillOptions
  ): Promise<BrowserActionResult> {
    const managed = this.requirePage(session.id, options.pageId);
    const locator = await this.requireLocator(managed.page, options);
    await locator.first().fill(options.value, { timeout: options.timeoutMs ?? 5000 });
    return makeBrowserActionResult(
      session,
      managed.pageId,
      "browser.fill",
      makeBrowserFillDetails(options)
    );
  }

  async press(
    session: DesktopSession,
    options: BrowserPressOptions
  ): Promise<BrowserActionResult> {
    if (options.key.trim().length === 0) {
      throw new ProcessError("browserPress requires a non-empty key.");
    }

    const managed = this.requirePage(session.id, options.pageId);
    if (hasAnyTarget(options)) {
      const locator = await this.requireLocator(managed.page, options);
      await locator.first().press(options.key, { timeout: options.timeoutMs ?? 5000 });
    } else {
      await managed.page.keyboard.press(options.key);
    }

    return makeBrowserActionResult(session, managed.pageId, "browser.press", {
      key: options.key,
      target: hasAnyTarget(options) ? formatBrowserTarget(options) : undefined,
      label: options.label
    });
  }

  async assertText(
    session: DesktopSession,
    options: BrowserAssertTextOptions
  ): Promise<BrowserActionResult> {
    if (options.text.trim().length === 0) {
      throw new ProcessError("browserAssertText requires non-empty text.");
    }

    const managed = this.requirePage(session.id, options.pageId);
    await managed.page
      .getByText(options.text)
      .first()
      .waitFor({ state: "visible", timeout: options.timeoutMs ?? 5000 });

    return makeBrowserActionResult(session, managed.pageId, "browser.assert_text", {
      text: options.text,
      label: options.label
    });
  }

  async screenshot(
    session: DesktopSession,
    filePath: string,
    sequence: number,
    options: BrowserScreenshotOptions
  ): Promise<ScreenshotResult> {
    const managed = this.requirePage(session.id, options.pageId);
    await takePageScreenshotWithRetries(managed.page, filePath, options);

    const size = await fileSize(filePath);
    if (size <= 0) {
      throw new ProcessError(`Browser screenshot file was created but is empty: ${filePath}`);
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

  async close(session: DesktopSession, pageId?: string): Promise<void> {
    if (pageId) {
      await this.closePage(pageId);
      return;
    }

    await this.closeAll(session.id);
  }

  async closeAll(sessionId: SessionId): Promise<void> {
    const pageIds = [...(this.sessionPages.get(sessionId) ?? [])];
    const errors: string[] = [];
    for (const pageId of pageIds) {
      try {
        await this.closePage(pageId);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    this.sessionPages.delete(sessionId);
    this.lastPageBySession.delete(sessionId);
    if (errors.length > 0) {
      throw new ProcessError(`Browser cleanup failed: ${errors.join("; ")}`);
    }
  }

  private async resolveExecutable(
    options: BrowserOpenOptions
  ): Promise<DetectedBrowserExecutable> {
    if (options.browserExecutablePath) {
      const resolved = await this.findExecutable(
        options.browserExecutablePath,
        this.env
      );
      if (!resolved) {
        throw new ProcessError(
          `Browser executable was not found or is not executable: ${options.browserExecutablePath}`
        );
      }
      return {
        path: resolved,
        name: options.browserName ?? inferBrowserName(resolved),
        source: "option"
      };
    }

    const override = this.env.AGENT_DESKTOP_HARNESS_BROWSER?.trim();
    if (override) {
      const resolved = await this.findExecutable(override, this.env);
      if (!resolved) {
        throw new ProcessError(
          `AGENT_DESKTOP_HARNESS_BROWSER is set but is not executable: ${override}`
        );
      }
      return {
        path: resolved,
        name: options.browserName ?? inferBrowserName(resolved),
        source: "env"
      };
    }

    const requestedBrowserName = options.browserName;
    const candidates = requestedBrowserName
      ? BROWSER_CANDIDATES.filter((candidate) =>
          browserNameMatches(candidate.name, requestedBrowserName)
        )
      : BROWSER_CANDIDATES;
    for (const candidate of candidates) {
      const resolved = await this.findExecutable(candidate.command, this.env);
      if (resolved) {
        return {
          path: resolved,
          name: candidate.name,
          source: "path"
        };
      }
    }

    throw new ProcessError(
      "No supported browser executable was found. Install Chromium/Chrome or set AGENT_DESKTOP_HARNESS_BROWSER."
    );
  }

  private requirePage(sessionId: SessionId, pageId?: string): ManagedBrowserPage {
    const resolvedPageId = pageId ?? this.lastPageBySession.get(sessionId);
    if (!resolvedPageId) {
      throw new ProcessError(`No browser page is open for session ${sessionId}.`);
    }

    const page = this.pages.get(resolvedPageId);
    if (!page || page.sessionId !== sessionId) {
      throw new ProcessError(`Browser page was not found: ${resolvedPageId}`);
    }
    return page;
  }

  private async requireLocator(
    page: Page,
    target: BrowserSelectorTarget
  ): Promise<Locator> {
    const resolved = resolveBrowserTarget(target);
    const locator = locatorForTarget(page, resolved);
    const count = await locator.count().catch(() => 0);
    if (count < 1) {
      throw new ProcessError(
        `Browser locator did not match any elements: ${JSON.stringify(resolved)}`
      );
    }
    return locator;
  }

  private async closePage(pageId: string): Promise<void> {
    const managed = this.pages.get(pageId);
    if (!managed) {
      return;
    }

    this.pages.delete(pageId);
    const pageIds = this.sessionPages.get(managed.sessionId);
    pageIds?.delete(pageId);
    if (pageIds && pageIds.size === 0) {
      this.sessionPages.delete(managed.sessionId);
    }
    if (this.lastPageBySession.get(managed.sessionId) === pageId) {
      const replacement = [...(pageIds ?? [])].at(-1);
      if (replacement) {
        this.lastPageBySession.set(managed.sessionId, replacement);
      } else {
        this.lastPageBySession.delete(managed.sessionId);
      }
    }

    await managed.context.close();
    await managed.browser?.close().catch(() => undefined);
  }
}

export function browserLaunchArgs(
  browserName: BrowserName,
  viewport?: { readonly width: number; readonly height: number }
): string[] {
  if (browserName === "firefox") {
    return [];
  }

  const args = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--no-first-run",
    "--disable-default-apps",
    "--ozone-platform=x11",
    "--window-position=0,0"
  ];
  if (viewport) {
    args.push(`--window-size=${viewport.width},${viewport.height}`);
  }
  return args;
}

export function inferBrowserName(commandOrPath: string): BrowserName {
  const name = basename(commandOrPath).toLowerCase();
  if (name.includes("firefox")) {
    return "firefox";
  }
  if (name.includes("chrome")) {
    return "chrome";
  }
  return "chromium";
}

export async function createTemporaryBrowserUserDataDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "agent-desktop-harness-pw-"));
}

function validateOpenOptions(options: BrowserOpenOptions): void {
  try {
    const url = new URL(options.url);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "file:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new ProcessError("browserOpen requires a valid http, https, or file URL.");
  }

  if (options.viewport) {
    if (
      !Number.isInteger(options.viewport.width) ||
      !Number.isInteger(options.viewport.height) ||
      options.viewport.width < 1 ||
      options.viewport.height < 1
    ) {
      throw new ProcessError("Browser viewport width and height must be positive integers.");
    }
  }
}

function getBrowserType(browserName: BrowserName): BrowserType {
  return browserName === "firefox" ? firefox : chromium;
}

function browserNameMatches(candidate: BrowserName, requested: BrowserName): boolean {
  if (requested === "chrome") {
    return candidate === "chrome";
  }
  if (requested === "chromium") {
    return candidate === "chromium" || candidate === "chrome";
  }
  return candidate === requested;
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

function makeBrowserActionResult(
  session: DesktopSession,
  pageId: string,
  actionType: string,
  details: Readonly<Record<string, unknown>>
): BrowserActionResult {
  return {
    sessionId: session.id,
    pageId,
    actionType,
    success: true,
    createdAt: isoNow(),
    details: compactDetails(details)
  };
}

function hasAnyTarget(options: BrowserSelectorTarget): boolean {
  return (
    options.selector !== undefined ||
    options.testId !== undefined ||
    options.role !== undefined ||
    options.label !== undefined ||
    options.placeholder !== undefined ||
    options.text !== undefined
  );
}

async function takePageScreenshotWithRetries(
  page: Page,
  filePath: string,
  options: BrowserScreenshotOptions
): Promise<void> {
  const attempts = 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.waitForLoadState("load", { timeout: 1000 }).catch(() => undefined);
      await page.bringToFront().catch(() => undefined);
      if (attempt > 1) {
        await page.waitForTimeout(250 * attempt);
      }
      await page.screenshot({
        path: filePath,
        fullPage: options.fullPage ?? false,
        type: "png"
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
