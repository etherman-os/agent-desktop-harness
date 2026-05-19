import type {
  DesktopSession,
  ScreenshotResult,
  SessionId
} from "../../types.js";

export type TauriDriverMode = "webdriver" | "x11-fallback";

export interface TauriDriverStatus {
  readonly available: boolean;
  readonly tauriDriverPath?: string;
  readonly webKitWebDriverPath?: string;
  readonly cargoPath?: string;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface TauriOpenOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly label?: string;
  readonly webdriverPort?: number;
  readonly nativePort?: number;
  readonly timeoutMs?: number;
  readonly windowTitleIncludes?: string;
  readonly applicationPath?: string;
}

export interface TauriAppRef {
  readonly sessionId: SessionId;
  readonly appId: string;
  readonly webdriverUrl?: string;
  readonly processId?: number;
  readonly createdAt: string;
  readonly mode: TauriDriverMode;
  readonly warnings?: readonly string[];
}

export interface TauriActionTarget {
  readonly selector?: string;
  readonly text?: string;
  readonly role?: string;
  readonly name?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly testId?: string;
}

export interface TauriClickOptions extends TauriActionTarget {
  readonly appId?: string;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface TauriFillOptions extends TauriActionTarget {
  readonly appId?: string;
  readonly value: string;
  readonly secret?: boolean;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface TauriAssertTextOptions {
  readonly appId?: string;
  readonly text: string;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface TauriScreenshotOptions {
  readonly appId?: string;
  readonly label?: string;
}

export interface TauriActionResult {
  readonly sessionId: SessionId;
  readonly appId?: string;
  readonly actionType: string;
  readonly success: boolean;
  readonly mode: TauriDriverMode;
  readonly createdAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly warnings?: readonly string[];
}

export interface TauriDriver {
  getStatus(): Promise<TauriDriverStatus>;
  open(session: DesktopSession, options: TauriOpenOptions): Promise<TauriAppRef>;
  click(session: DesktopSession, options: TauriClickOptions): Promise<TauriActionResult>;
  fill(session: DesktopSession, options: TauriFillOptions): Promise<TauriActionResult>;
  assertText(
    session: DesktopSession,
    options: TauriAssertTextOptions
  ): Promise<TauriActionResult>;
  screenshot(
    session: DesktopSession,
    filePath: string,
    sequence: number,
    options: TauriScreenshotOptions
  ): Promise<ScreenshotResult | undefined>;
  close(session: DesktopSession, appId?: string): Promise<void>;
  closeAll(sessionId: SessionId): Promise<void>;
}
