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
  FindWindowOptions,
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
  WaitForWindowOptions,
  VisualHandoff,
  WindowActionResult,
  WindowFilter,
  WindowInfo
} from "./types.js";
export type {
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
} from "./drivers/browser/browserTypes.js";
export type {
  TauriActionResult,
  TauriActionTarget,
  TauriAppRef,
  TauriAssertTextOptions,
  TauriClickOptions,
  TauriDriver,
  TauriDriverMode,
  TauriDriverStatus,
  TauriFillOptions,
  TauriOpenOptions,
  TauriScreenshotOptions
} from "./drivers/tauri/tauriTypes.js";
export type {
  ElectronActionResult,
  ElectronActionTarget,
  ElectronAppRef,
  ElectronAssertTextOptions,
  ElectronClickOptions,
  ElectronDriver,
  ElectronDriverMode,
  ElectronDriverStatus,
  ElectronFillOptions,
  ElectronOpenOptions,
  ElectronPressOptions,
  ElectronScreenshotOptions
} from "./drivers/electron/electronTypes.js";

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
  parsePngBase64,
  sanitizeBaselinePart
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
  PlaywrightBrowserDriver,
  browserLaunchArgs,
  inferBrowserName
} from "./drivers/browser/PlaywrightBrowserDriver.js";
export {
  TauriWebDriverDriver,
  reserveWebDriverPort
} from "./drivers/tauri/TauriWebDriverDriver.js";
export { getTauriDriverStatus } from "./drivers/tauri/tauriStatus.js";
export { PlaywrightElectronDriver } from "./drivers/electron/PlaywrightElectronDriver.js";
export { getElectronDriverStatus } from "./drivers/electron/electronStatus.js";
export {
  makeDriverRouterStatus,
  selectDriver,
  isSemanticDriver
} from "./drivers/router/DriverRouter.js";
export { VisualQaService } from "./visual/VisualQaService.js";
export { LiveObserverService } from "./observer/LiveObserverService.js";
export {
  NoVncObserver,
  allocateTcpPort,
  buildNoVncProxyArgs,
  buildWebsockifyArgs,
  buildX11VncArgs,
  makeNoVncUrl,
  normalizeObserverHost,
  redactObserverStartDetails
} from "./observer/NoVncObserver.js";
export {
  findNoVncWebRoot,
  findObserverDependencyPaths,
  getLiveObserverStatus
} from "./observer/observerStatus.js";
export { checkRegionOverlaps } from "./visual/geometry.js";
export {
  clampImageRegion,
  comparePngImages,
  comparePngImagesWithContainment,
  normalizeImageRegion,
  readPngSize
} from "./visual/imageDiff.js";
export type {
  AnnotationRegionOptions,
  AnnotationRegionResult,
  CompareVisualBaselineOptions,
  ImageContainmentDiffOptions,
  ImageContainmentDiffResult,
  ImageDiffOptions,
  ImageDiffResult,
  ImageRegion,
  ListVisualBaselinesOptions,
  RectangleOverlapResult,
  SaveVisualBaselineOptions,
  VisualAssertAnnotationChangedOptions,
  VisualAssertAnnotationSimilarOptions,
  VisualAssertChangedOptions,
  VisualAssertChangeContainedOptions,
  VisualAssertSimilarOptions,
  VisualAssertionKind,
  VisualBaselineRef,
  VisualChangeContainmentResult,
  VisualCheckRegionOverlapOptions,
  VisualCompareOptions,
  VisualCompareResult
} from "./visual/visualTypes.js";
export type {
  LiveObserverRef,
  LiveObserverStatus,
  ObserverDependencyPaths,
  StartLiveObserverOptions,
  StopLiveObserverResult
} from "./observer/observerTypes.js";
export type {
  AppActionResult,
  AppActionTarget,
  AppAssertTextOptions,
  AppClickOptions,
  AppFillOptions,
  AppKind,
  AppOpenOptions,
  AppPressOptions,
  AppRef,
  AppScreenshotOptions,
  DriverRouteDecision,
  DriverRouteRequest,
  DriverRouterStatus,
  DriverSelectionMode,
  RoutedAppRecord,
  RoutedDriverKind
} from "./drivers/router/DriverRouter.js";
export {
  compactDetails,
  formatBrowserTarget,
  hasBrowserTarget,
  makeBrowserFillDetails,
  resolveBrowserTarget
} from "./drivers/browser/browserSelectors.js";
export {
  WmctrlWindowBackend,
  findMatchingWindow,
  parseWmctrlLine,
  parseWmctrlWindowList
} from "./window/WmctrlWindowBackend.js";
export {
  filterWindows,
  findBestWindow,
  isDevtoolsWindow
} from "./window/windowFilters.js";

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
