import type { DesktopSession, ScreenshotResult, SessionId } from "../../types.js";

export type BrowserName = "chromium" | "chrome" | "firefox";

export interface BrowserOpenOptions {
  readonly url: string;
  readonly browserExecutablePath?: string;
  readonly browserName?: BrowserName;
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
  readonly userDataDir?: string;
  readonly label?: string;
  readonly timeoutMs?: number;
}

export interface BrowserPageRef {
  readonly sessionId: SessionId;
  readonly pageId: string;
  readonly url: string;
  readonly title?: string;
  readonly createdAt: string;
}

export interface BrowserActionResult {
  readonly sessionId: SessionId;
  readonly pageId: string;
  readonly actionType: string;
  readonly success: boolean;
  readonly createdAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface BrowserSelectorTarget {
  readonly selector?: string;
  readonly text?: string;
  readonly role?: string;
  readonly name?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly testId?: string;
}

export interface BrowserClickOptions extends BrowserSelectorTarget {
  readonly pageId?: string;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface BrowserFillOptions extends BrowserSelectorTarget {
  readonly pageId?: string;
  readonly value: string;
  readonly secret?: boolean;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface BrowserPressOptions extends BrowserSelectorTarget {
  readonly pageId?: string;
  readonly key: string;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface BrowserAssertTextOptions {
  readonly pageId?: string;
  readonly text: string;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface BrowserScreenshotOptions {
  readonly pageId?: string;
  readonly label?: string;
  readonly fullPage?: boolean;
}

export interface BrowserDriver {
  open(session: DesktopSession, options: BrowserOpenOptions): Promise<BrowserPageRef>;
  click(session: DesktopSession, options: BrowserClickOptions): Promise<BrowserActionResult>;
  fill(session: DesktopSession, options: BrowserFillOptions): Promise<BrowserActionResult>;
  press(session: DesktopSession, options: BrowserPressOptions): Promise<BrowserActionResult>;
  assertText(
    session: DesktopSession,
    options: BrowserAssertTextOptions,
  ): Promise<BrowserActionResult>;
  screenshot(
    session: DesktopSession,
    filePath: string,
    sequence: number,
    options: BrowserScreenshotOptions,
  ): Promise<ScreenshotResult>;
  close(session: DesktopSession, pageId?: string): Promise<void>;
  closeAll(sessionId: SessionId): Promise<void>;
}
