import type {
  DesktopSession,
  ScreenshotResult,
  SessionId
} from "../../types.js";

export type ElectronDriverMode = "playwright-electron" | "x11-fallback";

export interface ElectronDriverStatus {
  readonly available: boolean;
  readonly playwrightAvailable: boolean;
  readonly electronBinaryPath?: string;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface ElectronOpenOptions {
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly executablePath?: string;
  readonly appPath?: string;
  readonly label?: string;
  readonly timeoutMs?: number;
  readonly windowTitleIncludes?: string;
  readonly excludeDevtools?: boolean;
}

export interface ElectronAppRef {
  readonly sessionId: SessionId;
  readonly appId: string;
  readonly createdAt: string;
  readonly mode: ElectronDriverMode;
  readonly processId?: number;
  readonly windowTitle?: string;
  readonly warnings?: readonly string[];
}

export interface ElectronActionTarget {
  readonly selector?: string;
  readonly text?: string;
  readonly role?: string;
  readonly name?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly testId?: string;
}

export interface ElectronClickOptions extends ElectronActionTarget {
  readonly appId?: string;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface ElectronFillOptions extends ElectronActionTarget {
  readonly appId?: string;
  readonly value: string;
  readonly secret?: boolean;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface ElectronPressOptions extends ElectronActionTarget {
  readonly appId?: string;
  readonly key: string;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface ElectronAssertTextOptions {
  readonly appId?: string;
  readonly text: string;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface ElectronScreenshotOptions {
  readonly appId?: string;
  readonly label?: string;
  readonly fullPage?: boolean;
}

export interface ElectronActionResult {
  readonly sessionId: SessionId;
  readonly appId?: string;
  readonly actionType: string;
  readonly success: boolean;
  readonly mode: ElectronDriverMode;
  readonly createdAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly warnings?: readonly string[];
}

export interface ElectronDriver {
  getStatus(): Promise<ElectronDriverStatus>;
  open(session: DesktopSession, options: ElectronOpenOptions): Promise<ElectronAppRef>;
  click(session: DesktopSession, options: ElectronClickOptions): Promise<ElectronActionResult>;
  fill(session: DesktopSession, options: ElectronFillOptions): Promise<ElectronActionResult>;
  press(session: DesktopSession, options: ElectronPressOptions): Promise<ElectronActionResult>;
  assertText(
    session: DesktopSession,
    options: ElectronAssertTextOptions
  ): Promise<ElectronActionResult>;
  screenshot(
    session: DesktopSession,
    filePath: string,
    sequence: number,
    options: ElectronScreenshotOptions
  ): Promise<ScreenshotResult | undefined>;
  close(session: DesktopSession, appId?: string): Promise<void>;
  closeAll(sessionId: SessionId): Promise<void>;
}
