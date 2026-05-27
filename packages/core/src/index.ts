export { XvfbDisplay } from "./display/XvfbDisplay.js";
export {
  compactDetails,
  formatBrowserTarget,
  hasBrowserTarget,
  makeBrowserFillDetails,
  resolveBrowserTarget,
} from "./drivers/browser/browserSelectors.js";
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
  BrowserSelectorTarget,
} from "./drivers/browser/browserTypes.js";
export {
  browserLaunchArgs,
  inferBrowserName,
  PlaywrightBrowserDriver,
} from "./drivers/browser/PlaywrightBrowserDriver.js";
export { getElectronDriverStatus } from "./drivers/electron/electronStatus.js";
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
  ElectronScreenshotOptions,
} from "./drivers/electron/electronTypes.js";
export { PlaywrightElectronDriver } from "./drivers/electron/PlaywrightElectronDriver.js";
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
  RoutedDriverKind,
} from "./drivers/router/DriverRouter.js";
export {
  isSemanticDriver,
  makeDriverRouterStatus,
  selectDriver,
} from "./drivers/router/DriverRouter.js";
export {
  reserveWebDriverPort,
  TauriWebDriverDriver,
} from "./drivers/tauri/TauriWebDriverDriver.js";
export { getTauriDriverStatus } from "./drivers/tauri/tauriStatus.js";
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
  TauriScreenshotOptions,
} from "./drivers/tauri/tauriTypes.js";
export type {
  Driver,
  DriverProbeResult,
  DriverRouter,
} from "./drivers/types.js";
export {
  HarnessError,
  MissingDependencyError,
  PolicyError,
  ProcessError,
  SessionNotFoundError,
} from "./errors.js";
export {
  assertSafePngFileName,
  EvidenceStore,
  isSafePngFileName,
  parsePngBase64,
  sanitizeBaselinePart,
} from "./evidence/EvidenceStore.js";
export type {
  EvidenceRecorder,
  EvidenceReport,
} from "./evidence/types.js";
export { InputService } from "./input/InputService.js";
export type { InputBackend } from "./input/types.js";
export {
  makeTypeTextDetails,
  normalizeHotkeyKeys,
  normalizeScrollAmount,
  scrollDirectionToButton,
  toXdotoolButton,
  XdotoolInputBackend,
} from "./input/XdotoolInputBackend.js";
export { LiveObserverService } from "./observer/LiveObserverService.js";
export {
  allocateTcpPort,
  buildNoVncProxyArgs,
  buildWebsockifyArgs,
  buildX11VncArgs,
  makeNoVncUrl,
  NoVncObserver,
  normalizeObserverHost,
  redactObserverStartDetails,
} from "./observer/NoVncObserver.js";
export {
  findNoVncWebRoot,
  findObserverDependencyPaths,
  getLiveObserverStatus,
} from "./observer/observerStatus.js";
export type {
  LiveObserverRef,
  LiveObserverStatus,
  ObserverDependencyPaths,
  StartLiveObserverOptions,
  StopLiveObserverResult,
} from "./observer/observerTypes.js";
export { PolicyValidator } from "./policy/PolicyValidator.js";
export type {
  CommandAllowlistEntry,
  PolicyDecision,
  PolicyEvaluator,
} from "./policy/types.js";
export { ScreenshotService } from "./screenshot/ScreenshotService.js";
export type {
  AllocatedDisplay,
  DisplayAllocatorOptions,
} from "./session/displayAllocator.js";
export { DisplayAllocator } from "./session/displayAllocator.js";
export { SessionManager } from "./session/SessionManager.js";
export type {
  DisplayBackend,
  ScreenshotBackend,
  SessionInputBackend,
  SessionManagerPort,
} from "./session/types.js";
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
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotOptions,
  ScreenshotResult,
  ScrollAction,
  SessionConfig,
  SessionDisplayConfig,
  SessionId,
  SessionProcessIds,
  TypeTextAction,
  VisualHandoff,
  WaitForStableScreenOptions,
  WaitForStableScreenResult,
  WaitForWindowOptions,
  WindowActionResult,
  WindowFilter,
  WindowInfo,
} from "./types.js";
export { checkRegionOverlaps } from "./visual/geometry.js";
export {
  clampImageRegion,
  comparePngImages,
  comparePngImagesWithContainment,
  normalizeImageRegion,
  readPngSize,
} from "./visual/imageDiff.js";
export { VisualQaService } from "./visual/VisualQaService.js";
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
  VisualAssertChangeContainedOptions,
  VisualAssertChangedOptions,
  VisualAssertionKind,
  VisualAssertSimilarOptions,
  VisualBaselineRef,
  VisualChangeContainmentResult,
  VisualCheckRegionOverlapOptions,
  VisualCompareOptions,
  VisualCompareResult,
} from "./visual/visualTypes.js";
export type { WindowBackend } from "./window/types.js";
export { WindowService } from "./window/WindowService.js";
export {
  findMatchingWindow,
  parseWmctrlLine,
  parseWmctrlWindowList,
  WmctrlWindowBackend,
} from "./window/WmctrlWindowBackend.js";
export {
  filterWindows,
  findBestWindow,
  isDevtoolsWindow,
} from "./window/windowFilters.js";
