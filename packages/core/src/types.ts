export type SessionId = string;

export type DriverKind = "browser" | "tauri" | "electron" | "native" | "unknown";

export interface DisplayNumberRange {
  readonly min: number;
  readonly max: number;
}

export interface SessionDisplayConfig {
  readonly width?: number;
  readonly height?: number;
  readonly depth?: number;
  readonly scaleFactor?: number;
  readonly displayNumberRange?: DisplayNumberRange;
}

export interface SessionConfig {
  readonly name?: string;
  readonly workspacePath: string;
  readonly evidenceRootPath?: string;
  readonly command?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly display?: SessionDisplayConfig;
  readonly policy?: HarnessPolicy;
}

export interface SessionProcessIds {
  readonly xvfb?: number;
  readonly windowManager?: number;
  readonly apps: readonly number[];
}

export interface DesktopSession {
  readonly id: SessionId;
  readonly config: SessionConfig;
  readonly driverKind: DriverKind;
  readonly status: "starting" | "running" | "stopping" | "stopped" | "failed";
  readonly createdAt: Date;
  readonly stoppedAt?: Date;
  readonly workspacePath: string;
  readonly evidencePath: string;
  readonly display: string;
  readonly displayNumber: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly processIds: SessionProcessIds;
  readonly warnings: readonly string[];
}

export interface ScreenshotResult {
  readonly artifactId: string;
  readonly sessionId: SessionId;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly capturedAt: Date;
  readonly createdAt: Date;
  readonly display: string;
  readonly sequence: number;
  readonly label?: string;
}

export interface ScreenshotArtifact {
  readonly sessionId: SessionId;
  readonly fileName: string;
  readonly path: string;
  readonly sequence?: number;
  readonly label?: string;
  readonly createdAt?: string;
}

export type AnnotationShapeType = "rectangle" | "arrow" | "note";

export interface ScreenshotAnnotation {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly screenshotPath: string;
  readonly screenshotFileName: string;
  readonly type: AnnotationShapeType;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly x2?: number;
  readonly y2?: number;
  readonly note: string;
  readonly color?: string;
  readonly cropPath?: string;
  readonly createdAt: string;
}

export interface CreateAnnotationInput {
  readonly screenshotFileName: string;
  readonly type: AnnotationShapeType;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly x2?: number;
  readonly y2?: number;
  readonly note: string;
  readonly color?: string;
  readonly cropPngBase64?: string;
}

export interface VisualHandoff {
  readonly sessionId: SessionId;
  readonly path: string;
  readonly text: string;
  readonly annotations: readonly ScreenshotAnnotation[];
}

export type InputAction =
  | {
      readonly kind: "mouse-click";
      readonly x: number;
      readonly y: number;
      readonly button?: "left" | "middle" | "right";
    }
  | {
      readonly kind: "mouse-move";
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "key-press";
      readonly key: string;
      readonly modifiers?: readonly string[];
    }
  | {
      readonly kind: "text";
      readonly value: string;
    };

export interface EvidenceArtifact {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly kind:
    | "screenshot"
    | "action-log"
    | "metadata"
    | "report"
    | "annotation"
    | "visual-handoff";
  readonly path: string;
  readonly createdAt: Date;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface HarnessPolicy {
  readonly allowedCommands?: readonly string[];
  readonly workspaceRoot?: string;
  readonly allowUnlistedCommandsForLocalDevelopment?: boolean;
  readonly allowRealDesktopControl?: false;
  readonly redactSecrets?: readonly {
    readonly name: string;
    readonly pattern: string;
  }[];
  readonly requireApprovalFor?: readonly string[];
}

export interface LaunchConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface LaunchResult {
  readonly sessionId: SessionId;
  readonly processId: number;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly display: string;
  readonly startedAt: Date;
}

export interface ScreenshotOptions {
  readonly label?: string;
  readonly transient?: boolean;
}

export type ActionLogType =
  | "session.created"
  | "display.started"
  | "window_manager.started"
  | "app.launched"
  | "screenshot.captured"
  | "session.stopped"
  | "input.click"
  | "input.double_click"
  | "input.type_text"
  | "input.hotkey"
  | "input.scroll"
  | "window.list"
  | "window.focus"
  | "window.find"
  | "window.focus_best"
  | "window.wait_for_window"
  | "screen.wait_for_stable"
  | "browser.open"
  | "browser.click"
  | "browser.fill"
  | "browser.press"
  | "browser.assert_text"
  | "browser.screenshot"
  | "browser.close"
  | "tauri.open"
  | "tauri.click"
  | "tauri.fill"
  | "tauri.assert_text"
  | "tauri.screenshot"
  | "tauri.close"
  | "electron.open"
  | "electron.click"
  | "electron.fill"
  | "electron.press"
  | "electron.assert_text"
  | "electron.screenshot"
  | "electron.close"
  | "driver.route"
  | "app.open"
  | "app.click"
  | "app.fill"
  | "app.press"
  | "app.assert_text"
  | "app.screenshot"
  | "app.close"
  | "visual.compare"
  | "visual.assert_changed"
  | "visual.assert_similar"
  | "visual.baseline_saved"
  | "visual.compare_baseline"
  | "visual.assert_annotation_changed"
  | "visual.assert_annotation_similar"
  | "visual.assert_change_contained"
  | "observer.start"
  | "observer.stop"
  | "annotation.created"
  | "error";

export interface ActionLogRecord {
  readonly timestamp: string;
  readonly sessionId: SessionId;
  readonly type: ActionLogType;
  readonly status: "ok" | "failed";
  readonly details?: Readonly<Record<string, unknown>>;
  readonly errorMessage?: string;
}

export interface ClickAction {
  readonly x: number;
  readonly y: number;
  readonly button?: "left" | "right" | "middle";
  readonly label?: string;
}

export interface TypeTextAction {
  readonly text: string;
  readonly secret?: boolean;
  readonly label?: string;
}

export interface HotkeyAction {
  readonly keys: readonly string[];
  readonly label?: string;
}

export interface ScrollAction {
  readonly direction: "up" | "down" | "left" | "right";
  readonly amount?: number;
  readonly x?: number;
  readonly y?: number;
  readonly label?: string;
}

export interface InputActionResult {
  readonly sessionId: SessionId;
  readonly actionType: string;
  readonly createdAt: string;
  readonly success: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface WindowInfo {
  readonly id: string;
  readonly title: string;
  readonly desktop?: string;
  readonly pid?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly raw?: string;
}

export interface WindowFilter {
  readonly titleIncludes?: string;
  readonly titleExcludes?: readonly string[];
  readonly pid?: number;
  readonly preferLargest?: boolean;
  readonly excludeDevtools?: boolean;
}

export interface FindWindowOptions extends WindowFilter {
  readonly required?: boolean;
}

export interface FocusWindowTarget {
  readonly id?: string;
  readonly title?: string;
  readonly titleIncludes?: string;
  readonly titleExcludes?: readonly string[];
  readonly pid?: number;
  readonly preferLargest?: boolean;
  readonly excludeDevtools?: boolean;
}

export interface WindowActionResult {
  readonly sessionId: SessionId;
  readonly success: boolean;
  readonly window?: WindowInfo;
  readonly createdAt: string;
}

export interface WaitForStableScreenOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  readonly stableChecks?: number;
  readonly label?: string;
  readonly mode?: "hash" | "fileSize" | "tolerant";
  readonly fileSizeToleranceBytes?: number;
  readonly maxRetainedScreenshots?: number;
  readonly retainOnlyLast?: boolean;
}

export interface WaitForStableScreenResult {
  readonly sessionId: SessionId;
  readonly stable: boolean;
  readonly checks: number;
  readonly elapsedMs: number;
  readonly mode?: "hash" | "fileSize" | "tolerant";
  readonly retainedScreenshots?: readonly ScreenshotResult[];
  readonly discardedScreenshotCount?: number;
  readonly lastScreenshot?: ScreenshotResult;
  readonly reason?: string;
}

export interface WaitForWindowOptions extends WindowFilter {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}
