export type {
  ActionLogRecord,
  ActionLogType,
  AnnotationShapeType,
  ClickAction,
  CreateAnnotationInput,
  DesktopSession,
  DisplayNumberRange,
  DriverKind,
  EvidenceArtifact,
  FocusWindowTarget,
  HarnessPolicy,
  HotkeyAction,
  InputAction,
  InputActionResult,
  LaunchConfig,
  LaunchResult,
  ScrollAction,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotResult,
  ScreenshotOptions,
  SessionConfig,
  SessionDisplayConfig,
  SessionId,
  SessionProcessIds,
  TypeTextAction,
  WaitForStableScreenOptions,
  WaitForStableScreenResult,
  VisualHandoff,
  WindowActionResult,
  WindowInfo
} from "./types.js";

export {
  HarnessError,
  MissingDependencyError,
  PolicyError,
  ProcessError,
  SessionNotFoundError
} from "./errors.js";

export { SessionManager } from "./session/SessionManager.js";
export { DisplayAllocator } from "./session/displayAllocator.js";
export { XvfbDisplay } from "./display/XvfbDisplay.js";
export {
  EvidenceStore,
  assertSafePngFileName,
  isSafePngFileName,
  parsePngBase64
} from "./evidence/EvidenceStore.js";
export { InputService } from "./input/InputService.js";
export {
  XdotoolInputBackend,
  makeTypeTextDetails,
  normalizeHotkeyKeys,
  normalizeScrollAmount,
  scrollDirectionToButton,
  toXdotoolButton
} from "./input/XdotoolInputBackend.js";
export { PolicyValidator } from "./policy/PolicyValidator.js";
export { ScreenshotService } from "./screenshot/ScreenshotService.js";
export { WindowService } from "./window/WindowService.js";
export {
  WmctrlWindowBackend,
  findMatchingWindow,
  parseWmctrlLine,
  parseWmctrlWindowList
} from "./window/WmctrlWindowBackend.js";

export type {
  AllocatedDisplay,
  DisplayAllocatorOptions
} from "./session/displayAllocator.js";

export type {
  DisplayBackend,
  ScreenshotBackend,
  SessionInputBackend,
  SessionManagerPort
} from "./session/types.js";

export type { InputBackend } from "./input/types.js";
export type { WindowBackend } from "./window/types.js";

export type {
  EvidenceRecorder,
  EvidenceReport
} from "./evidence/types.js";

export type {
  CommandAllowlistEntry,
  PolicyDecision,
  PolicyEvaluator
} from "./policy/types.js";

export type {
  Driver,
  DriverProbeResult,
  DriverRouter
} from "./drivers/types.js";
