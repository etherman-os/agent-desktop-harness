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
}): boolean =>
  hasBrowserTarget(value) ||
  (value.x !== undefined && value.y !== undefined);

export const policySchema = z
  .object({
    allowedCommands: z.array(nonEmptyString).optional(),
    allowUnlistedCommandsForLocalDevelopment: z.boolean().optional()
  })
  .strict();

export const startSessionSchema = z
  .object({
    name: z.string().optional(),
    width: positiveInteger.optional(),
    height: positiveInteger.optional(),
    depth: positiveInteger.optional(),
    workspaceDir: nonEmptyString.optional(),
    policy: policySchema.optional()
  })
  .strict();

export const noArgsSchema = z.object({}).strict();

export const sessionIdSchema = z
  .object({
    sessionId: nonEmptyString
  })
  .strict();

export const launchAppSchema = z
  .object({
    sessionId: nonEmptyString,
    command: nonEmptyString,
    args: z.array(z.string()).optional(),
    cwd: nonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    label: z.string().optional()
  })
  .strict();

export const screenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    label: z.string().optional()
  })
  .strict();

export const browserOpenSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const browserClickSchema = z
  .object({
    sessionId: nonEmptyString,
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    timeoutMs: positiveInteger.optional()
  })
  .strict()
  .refine(hasBrowserTarget, "browser click requires selector, testId, role, label, placeholder, or text.");

export const browserFillSchema = z
  .object({
    sessionId: nonEmptyString,
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    value: z.string(),
    secret: z.boolean().optional(),
    timeoutMs: positiveInteger.optional()
  })
  .strict()
  .refine(hasBrowserTarget, "browser fill requires selector, testId, role, label, placeholder, or text.");

export const browserPressSchema = z
  .object({
    sessionId: nonEmptyString,
    ...browserTargetSchema,
    pageId: nonEmptyString.optional(),
    key: nonEmptyString,
    timeoutMs: positiveInteger.optional()
  })
  .strict();

export const browserAssertTextSchema = z
  .object({
    sessionId: nonEmptyString,
    pageId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const browserScreenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    pageId: nonEmptyString.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional()
  })
  .strict();

export const browserCloseSchema = z
  .object({
    sessionId: nonEmptyString,
    pageId: nonEmptyString.optional()
  })
  .strict();

export const tauriOpenSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const tauriClickSchema = z
  .object({
    sessionId: nonEmptyString,
    ...tauriTargetSchema,
    appId: nonEmptyString.optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasBrowserTarget, "tauri click requires selector, testId, role, label, placeholder, or text.");

export const tauriFillSchema = z
  .object({
    sessionId: nonEmptyString,
    ...tauriTargetSchema,
    appId: nonEmptyString.optional(),
    value: z.string(),
    secret: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasBrowserTarget, "tauri fill requires selector, testId, role, label, placeholder, or text.");

export const tauriAssertTextSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const tauriScreenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    label: z.string().optional()
  })
  .strict();

export const tauriCloseSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional()
  })
  .strict();

export const electronOpenSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const electronClickSchema = z
  .object({
    sessionId: nonEmptyString,
    ...electronTargetSchema,
    appId: nonEmptyString.optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasBrowserTarget, "electron click requires selector, testId, role, label, placeholder, or text.");

export const electronFillSchema = z
  .object({
    sessionId: nonEmptyString,
    ...electronTargetSchema,
    appId: nonEmptyString.optional(),
    value: z.string(),
    secret: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasBrowserTarget, "electron fill requires selector, testId, role, label, placeholder, or text.");

export const electronPressSchema = z
  .object({
    sessionId: nonEmptyString,
    ...electronTargetSchema,
    appId: nonEmptyString.optional(),
    key: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const electronAssertTextSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const electronScreenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional()
  })
  .strict();

export const electronCloseSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional()
  })
  .strict();

export const driverRouteSchema = z
  .object({
    sessionId: nonEmptyString,
    appKind: appKindSchema,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    requireSemantic: z.boolean().optional()
  })
  .strict();

export const observerStartSchema = z
  .object({
    sessionId: nonEmptyString,
    host: nonEmptyString.optional(),
    vncPort: positiveInteger.optional(),
    webPort: positiveInteger.optional(),
    viewOnly: z.boolean().optional(),
    password: z.string().optional(),
    label: z.string().optional()
  })
  .strict();

export const observerListSchema = z
  .object({
    sessionId: nonEmptyString.optional()
  })
  .strict();

export const observerStopSchema = z
  .object({
    sessionId: nonEmptyString,
    observerId: nonEmptyString.optional()
  })
  .strict();

export const appOpenSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const appClickSchema = z
  .object({
    sessionId: nonEmptyString,
    ...appTargetSchema,
    appId: nonEmptyString.optional(),
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict()
  .refine(hasAppTarget, "app click requires a semantic target or x/y coordinates.");

export const appFillSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const appPressSchema = z
  .object({
    sessionId: nonEmptyString,
    ...appTargetSchema,
    appId: nonEmptyString.optional(),
    key: nonEmptyString,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const appAssertTextSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    text: nonEmptyString,
    preferredDriver: routedDriverSchema.optional(),
    allowFallback: z.boolean().optional(),
    timeoutMs: positiveInteger.optional(),
    label: z.string().optional()
  })
  .strict();

export const appScreenshotSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional(),
    preferredDriver: routedDriverSchema.optional(),
    label: z.string().optional(),
    fullPage: z.boolean().optional()
  })
  .strict();

export const appCloseSchema = z
  .object({
    sessionId: nonEmptyString,
    appId: nonEmptyString.optional()
  })
  .strict();

export const visualCompareSchema = z
  .object({
    sessionId: nonEmptyString,
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    threshold: ratio.optional(),
    maxDiffPixelRatio: ratio.optional(),
    createDiffImage: z.boolean().optional()
  })
  .strict();

export const visualAssertChangedSchema = z
  .object({
    sessionId: nonEmptyString,
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    minDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional()
  })
  .strict();

export const visualAssertSimilarSchema = z
  .object({
    sessionId: nonEmptyString,
    beforePath: nonEmptyString,
    afterPath: nonEmptyString,
    label: z.string().optional(),
    region: imageRegionSchema.optional(),
    maxDiffPixelRatio: ratio.optional(),
    threshold: ratio.optional(),
    createDiffImage: z.boolean().optional()
  })
  .strict();

export const visualSaveBaselineSchema = z
  .object({
    sessionId: nonEmptyString,
    screenshotPath: nonEmptyString,
    name: nonEmptyString,
    suite: nonEmptyString.optional(),
    overwrite: z.boolean().optional(),
    metadata: metadataSchema.optional()
  })
  .strict();

export const visualListBaselinesSchema = z
  .object({
    sessionId: nonEmptyString,
    suite: nonEmptyString.optional()
  })
  .strict();

export const visualCompareBaselineSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const visualAssertAnnotationChangedSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const visualAssertAnnotationSimilarSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const visualAssertChangeContainedSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const clickSchema = z
  .object({
    sessionId: nonEmptyString,
    x: finiteNumber,
    y: finiteNumber,
    button: z.enum(["left", "right", "middle"]).optional(),
    label: z.string().optional()
  })
  .strict();

export const typeTextSchema = z
  .object({
    sessionId: nonEmptyString,
    text: z.string(),
    secret: z.boolean().optional(),
    label: z.string().optional()
  })
  .strict();

export const hotkeySchema = z
  .object({
    sessionId: nonEmptyString,
    keys: z.array(nonEmptyString).min(1),
    label: z.string().optional()
  })
  .strict();

export const scrollSchema = z
  .object({
    sessionId: nonEmptyString,
    direction: z.enum(["up", "down", "left", "right"]),
    amount: positiveInteger.optional(),
    x: finiteNumber.optional(),
    y: finiteNumber.optional(),
    label: z.string().optional()
  })
  .strict();

export const focusWindowSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const waitForStableScreenSchema = z
  .object({
    sessionId: nonEmptyString,
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

export const waitForWindowSchema = z
  .object({
    sessionId: nonEmptyString,
    titleIncludes: nonEmptyString.optional(),
    titleExcludes: z.array(nonEmptyString).optional(),
    pid: positiveInteger.optional(),
    timeoutMs: positiveInteger.optional(),
    intervalMs: positiveInteger.optional(),
    preferLargest: z.boolean().optional(),
    excludeDevtools: z.boolean().optional()
  })
  .strict();

export const createAnnotationSchema = z
  .object({
    sessionId: nonEmptyString,
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

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type LaunchAppInput = z.infer<typeof launchAppSchema>;
export type ScreenshotInput = z.infer<typeof screenshotSchema>;
export type BrowserOpenInput = z.infer<typeof browserOpenSchema>;
export type BrowserClickInput = z.infer<typeof browserClickSchema>;
export type BrowserFillInput = z.infer<typeof browserFillSchema>;
export type BrowserPressInput = z.infer<typeof browserPressSchema>;
export type BrowserAssertTextInput = z.infer<typeof browserAssertTextSchema>;
export type BrowserScreenshotInput = z.infer<typeof browserScreenshotSchema>;
export type BrowserCloseInput = z.infer<typeof browserCloseSchema>;
export type TauriOpenInput = z.infer<typeof tauriOpenSchema>;
export type TauriClickInput = z.infer<typeof tauriClickSchema>;
export type TauriFillInput = z.infer<typeof tauriFillSchema>;
export type TauriAssertTextInput = z.infer<typeof tauriAssertTextSchema>;
export type TauriScreenshotInput = z.infer<typeof tauriScreenshotSchema>;
export type TauriCloseInput = z.infer<typeof tauriCloseSchema>;
export type ElectronOpenInput = z.infer<typeof electronOpenSchema>;
export type ElectronClickInput = z.infer<typeof electronClickSchema>;
export type ElectronFillInput = z.infer<typeof electronFillSchema>;
export type ElectronPressInput = z.infer<typeof electronPressSchema>;
export type ElectronAssertTextInput = z.infer<typeof electronAssertTextSchema>;
export type ElectronScreenshotInput = z.infer<typeof electronScreenshotSchema>;
export type ElectronCloseInput = z.infer<typeof electronCloseSchema>;
export type DriverRouteInput = z.infer<typeof driverRouteSchema>;
export type ObserverStartInput = z.infer<typeof observerStartSchema>;
export type ObserverListInput = z.infer<typeof observerListSchema>;
export type ObserverStopInput = z.infer<typeof observerStopSchema>;
export type AppOpenInput = z.infer<typeof appOpenSchema>;
export type AppClickInput = z.infer<typeof appClickSchema>;
export type AppFillInput = z.infer<typeof appFillSchema>;
export type AppPressInput = z.infer<typeof appPressSchema>;
export type AppAssertTextInput = z.infer<typeof appAssertTextSchema>;
export type AppScreenshotInput = z.infer<typeof appScreenshotSchema>;
export type AppCloseInput = z.infer<typeof appCloseSchema>;
export type VisualCompareInput = z.infer<typeof visualCompareSchema>;
export type VisualAssertChangedInput = z.infer<typeof visualAssertChangedSchema>;
export type VisualAssertSimilarInput = z.infer<typeof visualAssertSimilarSchema>;
export type VisualSaveBaselineInput = z.infer<typeof visualSaveBaselineSchema>;
export type VisualListBaselinesInput = z.infer<typeof visualListBaselinesSchema>;
export type VisualCompareBaselineInput = z.infer<typeof visualCompareBaselineSchema>;
export type VisualAssertAnnotationChangedInput = z.infer<typeof visualAssertAnnotationChangedSchema>;
export type VisualAssertAnnotationSimilarInput = z.infer<typeof visualAssertAnnotationSimilarSchema>;
export type VisualAssertChangeContainedInput = z.infer<typeof visualAssertChangeContainedSchema>;
export type ClickInput = z.infer<typeof clickSchema>;
export type TypeTextInput = z.infer<typeof typeTextSchema>;
export type HotkeyInput = z.infer<typeof hotkeySchema>;
export type ScrollInput = z.infer<typeof scrollSchema>;
export type FocusWindowInput = z.infer<typeof focusWindowSchema>;
export type WaitForStableScreenInput = z.infer<typeof waitForStableScreenSchema>;
export type WaitForWindowInput = z.infer<typeof waitForWindowSchema>;
export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;
