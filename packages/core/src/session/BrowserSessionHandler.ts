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
import { ProcessError } from "../errors.js";
import type { ActionLogRecord, DesktopSession, ScreenshotResult, SessionId } from "../types.js";
import type { SessionRegistry } from "./SessionRegistry.js";

export class BrowserSessionHandler {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly browserDriver: BrowserDriver,
  ) {}

  async open(sessionId: SessionId, options: BrowserOpenOptions): Promise<BrowserPageRef> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const page = await this.browserDriver.open(session, options);
      const updatedSession = this.registry.updateManagedSession(managed, { driverKind: "browser" });
      await this.registry.evidenceStore.writeSession(updatedSession);
      await this.registry.appendAction(updatedSession, "browser.open", "ok", {
        pageId: page.pageId,
        url: page.url,
        title: page.title,
        viewport: options.viewport,
        browserName: options.browserName,
        browserExecutablePath: options.browserExecutablePath,
        label: options.label,
      });
      return page;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "browser.open",
        {
          url: options.url,
          viewport: options.viewport,
          browserName: options.browserName,
          browserExecutablePath: options.browserExecutablePath,
          label: options.label,
        },
        error,
      );
      throw error;
    }
  }

  async click(sessionId: SessionId, options: BrowserClickOptions): Promise<BrowserActionResult> {
    return await this.performAction(
      sessionId,
      "browser.click",
      {
        ...browserTargetDetails(options),
        pageId: options.pageId,
        timeoutMs: options.timeoutMs,
        label: options.label,
      },
      async (session) => await this.browserDriver.click(session, options),
    );
  }

  async fill(sessionId: SessionId, options: BrowserFillOptions): Promise<BrowserActionResult> {
    return await this.performAction(
      sessionId,
      "browser.fill",
      {
        ...browserTargetDetails(options),
        pageId: options.pageId,
        timeoutMs: options.timeoutMs,
        redacted: options.secret === true,
        valueLength: options.value.length,
        value: options.secret === true ? undefined : truncateForLog(options.value),
        truncated: options.secret === true ? undefined : options.value.length > 256,
        label: options.label,
      },
      async (session) => await this.browserDriver.fill(session, options),
      options.secret === true ? options.value : undefined,
    );
  }

  async press(sessionId: SessionId, options: BrowserPressOptions): Promise<BrowserActionResult> {
    return await this.performAction(
      sessionId,
      "browser.press",
      {
        ...browserTargetDetails(options),
        pageId: options.pageId,
        key: options.key,
        timeoutMs: options.timeoutMs,
        label: options.label,
      },
      async (session) => await this.browserDriver.press(session, options),
    );
  }

  async assertText(
    sessionId: SessionId,
    options: BrowserAssertTextOptions,
  ): Promise<BrowserActionResult> {
    return await this.performAction(
      sessionId,
      "browser.assert_text",
      {
        pageId: options.pageId,
        text: options.text,
        timeoutMs: options.timeoutMs,
        label: options.label,
      },
      async (session) => await this.browserDriver.assertText(session, options),
    );
  }

  async screenshot(
    sessionId: SessionId,
    options: BrowserScreenshotOptions = {},
  ): Promise<ScreenshotResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    const sequence = managed.screenshotSequence + 1;
    const filePath = this.registry.evidenceStore.getScreenshotPath(session, sequence, {
      label: options.label,
    });

    try {
      const result = await this.browserDriver.screenshot(session, filePath, sequence, options);
      managed.screenshotSequence = sequence;
      await this.registry.appendAction(session, "screenshot.captured", "ok", {
        path: result.path,
        display: result.display,
        sequence: result.sequence,
        label: result.label,
        source: "browser",
        pageId: options.pageId,
        fullPage: options.fullPage === true,
      });
      await this.registry.appendAction(session, "browser.screenshot", "ok", {
        path: result.path,
        sequence: result.sequence,
        label: result.label,
        pageId: options.pageId,
        fullPage: options.fullPage === true,
      });
      return result;
    } catch (error) {
      await this.registry.appendFailure(
        session,
        "browser.screenshot",
        {
          sequence,
          label: options.label,
          pageId: options.pageId,
          fullPage: options.fullPage === true,
        },
        error,
      );
      throw error;
    }
  }

  async close(sessionId: SessionId, pageId?: string): Promise<void> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      await this.browserDriver.close(session, pageId);
      await this.registry.appendAction(session, "browser.close", "ok", { pageId });
    } catch (error) {
      await this.registry.appendFailure(session, "browser.close", { pageId }, error);
      throw error;
    }
  }

  private async performAction(
    sessionId: SessionId,
    type: Extract<ActionLogRecord["type"], `browser.${string}`>,
    details: Readonly<Record<string, unknown>>,
    action: (session: DesktopSession) => Promise<BrowserActionResult>,
    secretValue?: string,
  ): Promise<BrowserActionResult> {
    const managed = this.registry.requireManagedSession(sessionId);
    const session = managed.session;
    this.registry.ensureRunning(session);

    try {
      const result = await action(session);
      await this.registry.appendAction(session, type, "ok", details);
      return result;
    } catch (error) {
      const safeError = secretValue ? redactErrorMessage(error, secretValue) : error;
      await this.registry.appendFailure(session, type, details, safeError);
      throw safeError;
    }
  }
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
