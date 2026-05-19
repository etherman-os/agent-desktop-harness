import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();
const finiteNumber = z.number().finite();
const pngFileName = nonEmptyString.refine(
  (value) =>
    value === value.split(/[\\/]/).pop() &&
    !value.includes("/") &&
    !value.includes("\\") &&
    value.toLowerCase().endsWith(".png"),
  "file name must be a PNG file name without path separators"
);
const browserTargetSchema = {
  selector: nonEmptyString.optional(),
  text: nonEmptyString.optional(),
  role: nonEmptyString.optional(),
  name: nonEmptyString.optional(),
  label: nonEmptyString.optional(),
  placeholder: nonEmptyString.optional(),
  testId: nonEmptyString.optional()
} as const;
const tauriTargetSchema = browserTargetSchema;
const electronTargetSchema = browserTargetSchema;
const appKindSchema = z.enum(["browser", "tauri", "electron", "native", "unknown"]);
const routedDriverSchema = z.enum([
  "browser-playwright",
  "tauri-webdriver",
  "electron-playwright",
  "x11-fallback"
]);
const appTargetSchema = {
  ...browserTargetSchema,
  x: finiteNumber.optional(),
  y: finiteNumber.optional(),
  button: z.enum(["left", "right", "middle"]).optional()
} as const;
const ratio = z.number().finite().min(0).max(1);
const imageRegionSchema = z
  .object({
    x: nonNegativeInteger,
    y: nonNegativeInteger,
    width: positiveInteger,
    height: positiveInteger
  })
  .strict();
const metadataSchema = z.record(z.string(), z.unknown());

const hasBrowserTarget = (value: {
  readonly selector?: string;
  readonly text?: string;
  readonly role?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly testId?: string;
}): boolean =>
  value.selector !== undefined ||
  value.text !== undefined ||
  value.role !== undefined ||
  value.label !== undefined ||
  value.placeholder !== undefined ||
  value.testId !== undefined;

const hasAppTarget = (value: {
  readonly selector?: string;
  readonly text?: string;
  readonly role?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly testId?: string;
  readonly x?: number;
  readonly y?: number;
}): boolean => hasBrowserTarget(value) || (value.x !== undefined && value.y !== undefined);

export const sessionIdSchema = nonEmptyString;

export const policySchema = z
  .object({
    allowedCommands: z.array(nonEmptyString).optional(),
    allowUnlistedCommandsForLocalDevelopment: z.boolean().optional()
  })
  .strict();

export const createSessionBodySchema = z
  .object({
    name: z.string().optional(),
    width: positiveInteger.optional(),
    height: positiveInteger.optional(),
    depth: positiveInteger.optional(),
    workspaceDir: nonEmptyString.optional(),
    policy: policySchema.optional()
  })
  .strict();

export const launchBodySchema = z
  .object({
    command: nonEmptyString,
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    label: z.string().optional()
  })
  .strict();

export const screenshotBodySchema = z
  .object({
    label: z.string().optional()
  })
  .strict();

export const browserOpenBodySchema = z
  .object({
    url: z.string().url(),
    browserExecutablePath: nonEmptyString.optional(),
    browserName: z.enum(["chromium", "chrome", "firefox"]).optional(),
    viewport: z
      .object({
        width: positiveInteger,
        height: positiveInteger
      })
      .strict()
      .optional(),
    userDataDir: nonEmptyString.optional(),
    label: z.string().optional(),
    timeoutMs: positiveInteger.optional()
  })
  .strict();

export const browserClickBodySchema = z
  .object({
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    timeoutMs: positiveInteger.optional()
  })
  .strict()
  .refine(hasBrowserTarget, "browser click requires selector, testId, role, label, placeholder, or text.");

export const browserFillBodySchema = z
  .object({
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    value: z.string(),
    secret: z.boolean().optional(),
    timeoutMs: positiveInteger.optional()
  })
  .strict()
  .refine(hasBrowserTarget, "browser fill requires selector, testId, role, label, placeholder, or text.");

export const browserPressBodySchema = z
  .object({
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    key: nonEmptyString,
    timeoutMs: positiveInteger.optional()
  })
  .strict();

export const browserAssertTextBodySchema = z
  .object({
    pageId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const browserScreenshotBodySchema = z
  .object({
    pageId: nonEmptyString.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional()
  })
  .strict();

export const browserCloseBodySchema = z
  .object({
    pageId: nonEmptyString.optional()
  })
  .strict();

export const tauriOpenBodySchema = z
  .object({
    command: nonEmptyString,
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    label: z.string().optional(),
    webdriverPort: positiveInteger.optional(),
    nativePort: positiveInteger.optional(),
    timeoutMs: positiveInteger.optional(),
    windowTitleIncludes: nonEmptyString.optional(),
    applicationPath: nonEmptyString.optional()
  })
  .strict();

export const tauriClickBodySchema = z
  .object({
    ...tauriTargetSchema,
    appId: nonEmptyString.optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasBrowserTarget, "tauri click requires selector, testId, role, label, placeholder, or text.");

export const tauriFillBodySchema = z
  .object({
    ...tauriTargetSchema,
    appId: nonEmptyString.optional(),
    value: z.string(),
    secret: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasBrowserTarget, "tauri fill requires selector, testId, role, label, placeholder, or text.");

export const tauriAssertTextBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const tauriScreenshotBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    label: z.string().optional()
  })
  .strict();

export const tauriCloseBodySchema = z
  .object({
    appId: nonEmptyString.optional()
  })
  .strict();

export const electronOpenBodySchema = z
  .object({
    command: nonEmptyString.optional(),
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    executablePath: nonEmptyString.optional(),
    appPath: nonEmptyString.optional(),
    label: z.string().optional(),
    timeoutMs: positiveInteger.optional(),
    windowTitleIncludes: nonEmptyString.optional(),
    excludeDevtools: z.boolean().optional()
  })
  .strict()
  .refine(
    (value) =>
      value.command !== undefined ||
      value.executablePath !== undefined ||
      value.appPath !== undefined,
    "electron open requires command, executablePath, or appPath"
  );

export const electronClickBodySchema = z
  .object({
    ...electronTargetSchema,
    appId: nonEmptyString.optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasBrowserTarget, "electron click requires selector, testId, role, label, placeholder, or text.");

export const electronFillBodySchema = z
  .object({
    ...electronTargetSchema,
    appId: nonEmptyString.optional(),
    value: z.string(),
    secret: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasBrowserTarget, "electron fill requires selector, testId, role, label, placeholder, or text.");

export const electronPressBodySchema = z
  .object({
    ...electronTargetSchema,
    appId: nonEmptyString.optional(),
    key: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const electronAssertTextBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const electronScreenshotBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional()
  })
  .strict();

export const electronCloseBodySchema = z
  .object({
    appId: nonEmptyString.optional()
  })
  .strict();

export const driverRouteBodySchema = z
  .object({
    appKind: appKindSchema,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    requireSemantic: z.boolean().optional()
  })
  .strict();

export const startLiveObserverBodySchema = z
  .object({
    host: nonEmptyString.optional(),
    vncPort: positiveInteger.optional(),
    webPort: positiveInteger.optional(),
    viewOnly: z.boolean().optional(),
    password: z.string().optional(),
    label: z.string().optional()
  })
  .strict();

export const appOpenBodySchema = z
  .object({
    appKind: appKindSchema,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    requireSemantic: z.boolean().optional(),
    url: z.string().url().optional(),
    browserExecutablePath: nonEmptyString.optional(),
    browserName: z.enum(["chromium", "chrome", "firefox"]).optional(),
    viewport: z
      .object({
        width: positiveInteger,
        height: positiveInteger
      })
      .strict()
      .optional(),
    command: nonEmptyString.optional(),
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    appPath: nonEmptyString.optional(),
    executablePath: nonEmptyString.optional(),
    label: z.string().optional(),
    timeoutMs: positiveInteger.optional(),
    windowTitleIncludes: nonEmptyString.optional(),
    excludeDevtools: z.boolean().optional()
  })
  .strict();

export const appClickBodySchema = z
  .object({
    ...appTargetSchema,
    appId: nonEmptyString.optional(),
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasAppTarget, "app click requires a semantic target or x/y coordinates.");

export const appFillBodySchema = z
  .object({
    ...appTargetSchema,
    appId: nonEmptyString.optional(),
    value: z.string(),
    secret: z.boolean().optional(),
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasAppTarget, "app fill requires a semantic target or x/y coordinates.");

export const appPressBodySchema = z
  .object({
    ...appTargetSchema,
    appId: nonEmptyString.optional(),
    key: nonEmptyString,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const appAssertTextBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const appScreenshotBodySchema = z
  .object({
    appId: nonEmptyString.optional(),
    preferredDriver: routedDriverSchema.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional()
  })
  .strict();

export const appCloseBodySchema = z
  .object({
    appId: nonEmptyString.optional()
  })
  .strict();

export const visualCompareBodySchema = z
  .object({
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    threshold: ratio.optional(),
    maxDiffPixelRatio: ratio.optional(),
    createDiffImage: z.boolean().optional()
  })
  .strict();

export const visualAssertChangedBodySchema = z
  .object({
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    minDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional()
  })
  .strict();

export const visualAssertSimilarBodySchema = z
  .object({
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    maxDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional()
  })
  .strict();

export const saveVisualBaselineBodySchema = z
  .object({
    screenshotPath: nonEmptyString,
    name: nonEmptyString,
    suite: nonEmptyString.optional(),
    overwrite: z.boolean().optional(),
    metadata: metadataSchema.optional()
  })
  .strict();

export const listVisualBaselinesQuerySchema = z
  .object({
    suite: nonEmptyString.optional()
  })
  .strict();

export const compareVisualBaselineBodySchema = z
  .object({
    screenshotPath: nonEmptyString,
    baselineName: nonEmptyString,
    suite: nonEmptyString.optional(),
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    threshold: ratio.optional(),
    maxDiffPixelRatio: ratio.optional(),
    createDiffImage: z.boolean().optional()
  })
  .strict();

export const visualAssertAnnotationChangedBodySchema = z
  .object({
    annotationId: nonEmptyString,
    beforePath: nonEmptyString.optional(),
    afterPath: nonEmptyString,
    padding: nonNegativeInteger.optional(),
    minDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional(),
    label: z.string().optional()
  })
  .strict();

export const visualAssertAnnotationSimilarBodySchema = z
  .object({
    annotationId: nonEmptyString,
    beforePath: nonEmptyString.optional(),
    afterPath: nonEmptyString,
    padding: nonNegativeInteger.optional(),
    maxDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional(),
    label: z.string().optional()
  })
  .strict();

export const visualAssertChangeContainedBodySchema = z
  .object({
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    allowedRegions: z.array(imageRegionSchema).min(1),
    threshold: ratio.optional(),
    maxOutsideDiffPixelRatio: ratio.optional(),
    minInsideDiffPixelRatio: ratio.optional(),
    createDiffImage: z.boolean().optional()
  })
  .strict();

export const clickBodySchema = z
  .object({
    x: finiteNumber,
    y: finiteNumber,
    button: z.enum(["left", "right", "middle"]).optional(),
    label: z.string().optional()
  })
  .strict();

export const typeTextBodySchema = z
  .object({
    text: z.string(),
    secret: z.boolean().optional(),
    label: z.string().optional()
  })
  .strict();

export const hotkeyBodySchema = z
  .object({
    keys: z.array(nonEmptyString).min(1),
    label: z.string().optional()
  })
  .strict();

export const scrollBodySchema = z
  .object({
    direction: z.enum(["up", "down", "left", "right"]),
    amount: positiveInteger.optional(),
    x: finiteNumber.optional(),
    y: finiteNumber.optional(),
    label: z.string().optional()
  })
  .strict();

export const focusWindowBodySchema = z
  .object({
    id: nonEmptyString.optional(),
    title: nonEmptyString.optional(),
    titleIncludes: nonEmptyString.optional(),
    titleExcludes: z.array(nonEmptyString).optional(),
    pid: positiveInteger.optional(),
    preferLargest: z.boolean().optional(),
    excludeDevtools: z.boolean().optional()
  })
  .strict()
  .refine(
    (value) =>
      value.id !== undefined ||
      value.title !== undefined ||
      value.titleIncludes !== undefined ||
      value.pid !== undefined,
    "focusWindow requires id, pid, title, or titleIncludes."
  );

export const waitForStableScreenBodySchema = z
  .object({
    timeoutMs: positiveInteger.optional(),
    intervalMs: positiveInteger.optional(),
    stableChecks: positiveInteger.optional(),
    label: z.string().optional(),
    mode: z.enum(["hash", "fileSize", "tolerant"]).optional(),
    fileSizeToleranceBytes: nonNegativeInteger.optional(),
    maxRetainedScreenshots: positiveInteger.optional(),
    retainOnlyLast: z.boolean().optional()
  })
  .strict();

export const waitForWindowBodySchema = z
  .object({
    titleIncludes: nonEmptyString.optional(),
    titleExcludes: z.array(nonEmptyString).optional(),
    pid: positiveInteger.optional(),
    timeoutMs: positiveInteger.optional(),
    intervalMs: positiveInteger.optional(),
    preferLargest: z.boolean().optional(),
    excludeDevtools: z.boolean().optional()
  })
  .strict();

export const pngFileNameSchema = pngFileName;

export const createAnnotationBodySchema = z
  .object({
    screenshotFileName: pngFileName,
    type: z.enum(["rectangle", "arrow", "note"]),
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber.optional(),
    height: finiteNumber.optional(),
    x2: finiteNumber.optional(),
    y2: finiteNumber.optional(),
    note: nonEmptyString,
    color: z.string().optional(),
    cropPngBase64: z.string().optional()
  })
  .strict()
  .refine(
    (value) =>
      value.type !== "rectangle" ||
      (value.width !== undefined &&
        value.height !== undefined &&
        value.width > 0 &&
        value.height > 0),
    "rectangle annotations require positive width and height"
  )
  .refine(
    (value) =>
      value.type !== "arrow" ||
      (value.x2 !== undefined &&
        value.y2 !== undefined &&
        Number.isFinite(value.x2) &&
        Number.isFinite(value.y2)),
    "arrow annotations require x2 and y2"
  );

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type LaunchBody = z.infer<typeof launchBodySchema>;
export type ScreenshotBody = z.infer<typeof screenshotBodySchema>;
export type BrowserOpenBody = z.infer<typeof browserOpenBodySchema>;
export type BrowserClickBody = z.infer<typeof browserClickBodySchema>;
export type BrowserFillBody = z.infer<typeof browserFillBodySchema>;
export type BrowserPressBody = z.infer<typeof browserPressBodySchema>;
export type BrowserAssertTextBody = z.infer<typeof browserAssertTextBodySchema>;
export type BrowserScreenshotBody = z.infer<typeof browserScreenshotBodySchema>;
export type BrowserCloseBody = z.infer<typeof browserCloseBodySchema>;
export type TauriOpenBody = z.infer<typeof tauriOpenBodySchema>;
export type TauriClickBody = z.infer<typeof tauriClickBodySchema>;
export type TauriFillBody = z.infer<typeof tauriFillBodySchema>;
export type TauriAssertTextBody = z.infer<typeof tauriAssertTextBodySchema>;
export type TauriScreenshotBody = z.infer<typeof tauriScreenshotBodySchema>;
export type TauriCloseBody = z.infer<typeof tauriCloseBodySchema>;
export type ElectronOpenBody = z.infer<typeof electronOpenBodySchema>;
export type ElectronClickBody = z.infer<typeof electronClickBodySchema>;
export type ElectronFillBody = z.infer<typeof electronFillBodySchema>;
export type ElectronPressBody = z.infer<typeof electronPressBodySchema>;
export type ElectronAssertTextBody = z.infer<typeof electronAssertTextBodySchema>;
export type ElectronScreenshotBody = z.infer<typeof electronScreenshotBodySchema>;
export type ElectronCloseBody = z.infer<typeof electronCloseBodySchema>;
export type DriverRouteBody = z.infer<typeof driverRouteBodySchema>;
export type StartLiveObserverBody = z.infer<typeof startLiveObserverBodySchema>;
export type AppOpenBody = z.infer<typeof appOpenBodySchema>;
export type AppClickBody = z.infer<typeof appClickBodySchema>;
export type AppFillBody = z.infer<typeof appFillBodySchema>;
export type AppPressBody = z.infer<typeof appPressBodySchema>;
export type AppAssertTextBody = z.infer<typeof appAssertTextBodySchema>;
export type AppScreenshotBody = z.infer<typeof appScreenshotBodySchema>;
export type AppCloseBody = z.infer<typeof appCloseBodySchema>;
export type VisualCompareBody = z.infer<typeof visualCompareBodySchema>;
export type VisualAssertChangedBody = z.infer<typeof visualAssertChangedBodySchema>;
export type VisualAssertSimilarBody = z.infer<typeof visualAssertSimilarBodySchema>;
export type SaveVisualBaselineBody = z.infer<typeof saveVisualBaselineBodySchema>;
export type ListVisualBaselinesQuery = z.infer<typeof listVisualBaselinesQuerySchema>;
export type CompareVisualBaselineBody = z.infer<typeof compareVisualBaselineBodySchema>;
export type VisualAssertAnnotationChangedBody = z.infer<typeof visualAssertAnnotationChangedBodySchema>;
export type VisualAssertAnnotationSimilarBody = z.infer<typeof visualAssertAnnotationSimilarBodySchema>;
export type VisualAssertChangeContainedBody = z.infer<typeof visualAssertChangeContainedBodySchema>;
export type ClickBody = z.infer<typeof clickBodySchema>;
export type TypeTextBody = z.infer<typeof typeTextBodySchema>;
export type HotkeyBody = z.infer<typeof hotkeyBodySchema>;
export type ScrollBody = z.infer<typeof scrollBodySchema>;
export type FocusWindowBody = z.infer<typeof focusWindowBodySchema>;
export type WaitForStableScreenBody = z.infer<typeof waitForStableScreenBodySchema>;
export type WaitForWindowBody = z.infer<typeof waitForWindowBodySchema>;
export type CreateAnnotationBody = z.infer<typeof createAnnotationBodySchema>;
