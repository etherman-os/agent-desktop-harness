import type { ScreenshotResult, SessionId } from "../../types.js";

export type AppKind = "browser" | "tauri" | "electron" | "native" | "unknown";

export type RoutedDriverKind =
  | "browser-playwright"
  | "tauri-webdriver"
  | "electron-playwright"
  | "x11-fallback";

export type DriverSelectionMode = "auto" | "explicit";

export interface DriverRouterStatus {
  readonly browser: {
    readonly available: boolean;
    readonly driver: "browser-playwright";
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly tauri: {
    readonly available: boolean;
    readonly driver: "tauri-webdriver";
    readonly experimental: true;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly electron: {
    readonly available: boolean;
    readonly driver: "electron-playwright";
    readonly experimental: true;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly x11Fallback: {
    readonly available: boolean;
    readonly driver: "x11-fallback";
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
}

export interface DriverRouteRequest {
  readonly appKind: AppKind;
  readonly preferredDriver?: RoutedDriverKind;
  readonly allowFallback?: boolean;
  readonly requireSemantic?: boolean;
}

export interface DriverRouteDecision {
  readonly appKind: AppKind;
  readonly selectedDriver: RoutedDriverKind;
  readonly selectionMode: DriverSelectionMode;
  readonly semantic: boolean;
  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface AppOpenOptions {
  readonly appKind: AppKind;
  readonly preferredDriver?: RoutedDriverKind;
  readonly allowFallback?: boolean;
  readonly requireSemantic?: boolean;
  readonly url?: string;
  readonly browserExecutablePath?: string;
  readonly browserName?: "chromium" | "chrome" | "firefox";
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly appPath?: string;
  readonly executablePath?: string;
  readonly label?: string;
  readonly timeoutMs?: number;
  readonly windowTitleIncludes?: string;
  readonly excludeDevtools?: boolean;
}

export interface AppRef {
  readonly sessionId: SessionId;
  readonly appId: string;
  readonly appKind: AppKind;
  readonly selectedDriver: RoutedDriverKind;
  readonly semantic: boolean;
  readonly fallbackUsed: boolean;
  readonly createdAt: string;
  readonly processId?: number;
  readonly warnings: readonly string[];
}

export interface AppActionTarget {
  readonly selector?: string;
  readonly text?: string;
  readonly role?: string;
  readonly name?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly testId?: string;
  readonly x?: number;
  readonly y?: number;
  readonly button?: "left" | "right" | "middle";
}

export interface AppClickOptions extends AppActionTarget {
  readonly appId?: string;
  readonly preferredDriver?: RoutedDriverKind;
  readonly allowFallback?: boolean;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface AppFillOptions extends AppActionTarget {
  readonly appId?: string;
  readonly value: string;
  readonly secret?: boolean;
  readonly preferredDriver?: RoutedDriverKind;
  readonly allowFallback?: boolean;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface AppPressOptions extends AppActionTarget {
  readonly appId?: string;
  readonly key: string;
  readonly preferredDriver?: RoutedDriverKind;
  readonly allowFallback?: boolean;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface AppAssertTextOptions {
  readonly appId?: string;
  readonly text: string;
  readonly preferredDriver?: RoutedDriverKind;
  readonly allowFallback?: boolean;
  readonly timeoutMs?: number;
  readonly label?: string;
}

export interface AppScreenshotOptions {
  readonly appId?: string;
  readonly preferredDriver?: RoutedDriverKind;
  readonly label?: string;
  readonly fullPage?: boolean;
}

export interface AppActionResult {
  readonly sessionId: SessionId;
  readonly appId?: string;
  readonly appKind?: AppKind;
  readonly selectedDriver: RoutedDriverKind;
  readonly semantic: boolean;
  readonly fallbackUsed: boolean;
  readonly actionType: string;
  readonly success: boolean;
  readonly createdAt: string;
  readonly warnings: readonly string[];
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface RoutedAppRecord extends AppRef {
  readonly underlyingId?: string;
  readonly underlyingKind?: "browser" | "tauri" | "electron" | "x11";
}

export interface AppScreenshotResult extends ScreenshotResult {
  readonly selectedDriver?: RoutedDriverKind;
}
