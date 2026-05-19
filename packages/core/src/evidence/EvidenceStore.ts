import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { copyFile, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import type {
  ActionLogRecord,
  CreateAnnotationInput,
  DesktopSession,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotOptions,
  ScreenshotResult,
  VisualHandoff
} from "../types.js";
import type {
  ListVisualBaselinesOptions,
  SaveVisualBaselineOptions,
  VisualBaselineRef,
  VisualCompareResult
} from "../visual/visualTypes.js";
import { readPngSize } from "../visual/imageDiff.js";
import { ProcessError } from "../errors.js";
import {
  appendJsonLine,
  ensureDirectory,
  isPathInside,
  pathExists,
  touchFile,
  writeJsonAtomic,
  writeTextAtomic
} from "../utils/fs.js";
import { isoNow } from "../utils/time.js";

export interface EvidencePaths {
  readonly sessionPath: string;
  readonly sessionJsonPath: string;
  readonly actionsJsonlPath: string;
  readonly screenshotsPath: string;
  readonly transientPath: string;
  readonly annotationsPath: string;
  readonly annotationsJsonlPath: string;
  readonly visualDiffsPath: string;
  readonly visualAssertionsJsonlPath: string;
  readonly reportPath: string;
  readonly visualHandoffPath: string;
}

export interface BaselinePaths {
  readonly rootPath: string;
  readonly baselinesPath: string;
  readonly baselinesJsonlPath: string;
}

const MAX_CROP_BYTES = 10 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class EvidenceStore {
  getSessionPath(workspacePath: string, sessionId: string, evidenceRootPath?: string): string {
    const rootPath = evidenceRootPath ?? join(workspacePath, ".desktop-harness");
    return join(rootPath, "sessions", sessionId);
  }

  getPaths(workspacePath: string, sessionId: string, evidenceRootPath?: string): EvidencePaths {
    const sessionPath = this.getSessionPath(workspacePath, sessionId, evidenceRootPath);
    return {
      sessionPath,
      sessionJsonPath: join(sessionPath, "session.json"),
      actionsJsonlPath: join(sessionPath, "actions.jsonl"),
      screenshotsPath: join(sessionPath, "screenshots"),
      transientPath: join(sessionPath, "transient"),
      annotationsPath: join(sessionPath, "annotations"),
      annotationsJsonlPath: join(sessionPath, "annotations.jsonl"),
      visualDiffsPath: join(sessionPath, "visual-diffs"),
      visualAssertionsJsonlPath: join(sessionPath, "visual-assertions.jsonl"),
      reportPath: join(sessionPath, "report.md"),
      visualHandoffPath: join(sessionPath, "visual-handoff.md")
    };
  }

  getBaselinePaths(workspacePath: string, evidenceRootPath?: string): BaselinePaths {
    const rootPath = evidenceRootPath ?? join(workspacePath, ".desktop-harness");
    return {
      rootPath,
      baselinesPath: join(rootPath, "baselines"),
      baselinesJsonlPath: join(rootPath, "baselines", "baselines.jsonl")
    };
  }

  async createSession(session: DesktopSession): Promise<void> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    await ensureDirectory(paths.screenshotsPath);
    await ensureDirectory(paths.transientPath);
    await ensureDirectory(paths.annotationsPath);
    await ensureDirectory(paths.visualDiffsPath);
    await touchFile(paths.actionsJsonlPath);
    await touchFile(paths.annotationsJsonlPath);
    await touchFile(paths.visualAssertionsJsonlPath);
    await this.writeSession(session);
  }

  async writeSession(session: DesktopSession): Promise<void> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    await writeJsonAtomic(paths.sessionJsonPath, serializeSession(session));
  }

  async appendAction(session: DesktopSession, record: ActionLogRecord): Promise<void> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    await appendJsonLine(paths.actionsJsonlPath, record);
  }

  getScreenshotPath(
    session: DesktopSession,
    sequence: number,
    options: ScreenshotOptions = {}
  ): string {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    const label = sanitizeFileLabel(options.label ?? "screenshot");
    const fileName = `${String(sequence).padStart(4, "0")}-${label}.png`;
    return join(options.transient === true ? paths.transientPath : paths.screenshotsPath, fileName);
  }

  async moveScreenshotToTransient(
    session: DesktopSession,
    screenshot: ScreenshotResult
  ): Promise<ScreenshotResult> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    const fileName = basename(screenshot.path);
    assertSafePngFileName(fileName, "screenshot file name");
    assertPathInside(
      paths.screenshotsPath,
      screenshot.path,
      "Screenshot path is outside the retained screenshots directory."
    );
    await ensureDirectory(paths.transientPath);
    const transientPath = join(paths.transientPath, fileName);
    assertPathInside(paths.transientPath, transientPath, "Transient screenshot path is outside the session evidence directory.");
    await rename(screenshot.path, transientPath);
    return {
      ...screenshot,
      path: transientPath
    };
  }

  async listScreenshots(session: DesktopSession): Promise<ScreenshotArtifact[]> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    const actions = await readActionRecords(paths.actionsJsonlPath);
    const actionByPath = new Map<string, ActionLogRecord>();
    for (const action of actions) {
      if (action.type !== "screenshot.captured" || action.status !== "ok") {
        continue;
      }
      const path = action.details?.path;
      if (typeof path === "string") {
        actionByPath.set(path, action);
      }
    }

    let fileNames: string[];
    try {
      fileNames = (await readdir(paths.screenshotsPath))
        .filter((fileName) => isSafePngFileName(fileName))
        .sort();
    } catch {
      return [];
    }

    const artifacts: ScreenshotArtifact[] = [];
    for (const fileName of fileNames) {
      const path = join(paths.screenshotsPath, fileName);
      const fileStat = await stat(path);
      const action = actionByPath.get(path);
      const parsed = parseScreenshotFileName(fileName);
      artifacts.push({
        sessionId: session.id,
        fileName,
        path,
        sequence: toOptionalNumber(action?.details?.sequence) ?? parsed.sequence,
        label: toOptionalString(action?.details?.label) ?? parsed.label,
        createdAt: action?.timestamp ?? fileStat.mtime.toISOString()
      });
    }

    return artifacts;
  }

  getScreenshotFilePath(session: DesktopSession, fileName: string): string {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    assertSafePngFileName(fileName, "screenshot file name");
    const path = join(paths.screenshotsPath, fileName);
    assertPathInside(paths.screenshotsPath, path, "Screenshot path is outside the session evidence directory.");
    return path;
  }

  getAnnotationFilePath(session: DesktopSession, fileName: string): string {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    assertSafePngFileName(fileName, "annotation file name");
    const path = join(paths.annotationsPath, fileName);
    assertPathInside(paths.annotationsPath, path, "Annotation path is outside the session evidence directory.");
    return path;
  }

  resolveEvidencePath(session: DesktopSession, inputPath: string): string {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    const trimmed = inputPath.trim();
    if (trimmed.length === 0) {
      throw new ProcessError("Evidence path cannot be empty.");
    }
    if (!trimmed.toLowerCase().endsWith(".png")) {
      throw new ProcessError("Visual QA paths must point to PNG files.");
    }
    const resolvedPath = isAbsolute(trimmed)
      ? resolve(trimmed)
      : resolve(paths.sessionPath, trimmed);
    assertPathInside(
      paths.sessionPath,
      resolvedPath,
      "Visual QA path is outside the session evidence directory."
    );
    return resolvedPath;
  }

  toEvidenceRelativePath(session: DesktopSession, path: string): string {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    return toEvidenceRelativePath(paths.sessionPath, path);
  }

  async getNextVisualDiffPath(session: DesktopSession, label = "visual-diff"): Promise<string> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    await ensureDirectory(paths.visualDiffsPath);
    const sequence = (await this.listVisualAssertions(session)).length + 1;
    const fileName = `diff_${String(sequence).padStart(3, "0")}-${sanitizeFileLabel(label)}.png`;
    const path = join(paths.visualDiffsPath, fileName);
    assertPathInside(paths.visualDiffsPath, path, "Visual diff path is outside the session evidence directory.");
    return path;
  }

  getVisualDiffFilePath(session: DesktopSession, fileName: string): string {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    assertSafePngFileName(fileName, "visual diff file name");
    const path = join(paths.visualDiffsPath, fileName);
    assertPathInside(paths.visualDiffsPath, path, "Visual diff path is outside the session evidence directory.");
    return path;
  }

  async appendVisualAssertion(
    session: DesktopSession,
    result: VisualCompareResult
  ): Promise<void> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    await touchFile(paths.visualAssertionsJsonlPath);
    await appendJsonLine(paths.visualAssertionsJsonlPath, result);
    await this.regenerateVisualHandoff(session);
  }

  async listVisualAssertions(session: DesktopSession): Promise<VisualCompareResult[]> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    try {
      const contents = await readFile(paths.visualAssertionsJsonlPath, "utf8");
      return contents
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as VisualCompareResult);
    } catch {
      return [];
    }
  }

  async saveVisualBaseline(
    session: DesktopSession,
    options: SaveVisualBaselineOptions
  ): Promise<VisualBaselineRef> {
    const sourceScreenshotPath = this.resolveEvidencePath(session, options.screenshotPath);
    const baselineName = sanitizeBaselinePart(options.name, "baseline name");
    const suite = sanitizeBaselinePart(options.suite ?? "default", "baseline suite");
    const baselinePaths = this.getBaselinePaths(
      session.workspacePath,
      session.config.evidenceRootPath
    );
    const suitePath = join(baselinePaths.baselinesPath, suite);
    const baselinePath = join(suitePath, `${baselineName}.png`);
    assertPathInside(
      baselinePaths.baselinesPath,
      baselinePath,
      "Visual baseline path is outside the baseline directory."
    );

    const existing = await this.findVisualBaseline(session, baselineName, suite);
    if (existing && options.overwrite !== true) {
      throw new ProcessError(`Visual baseline already exists: ${suite}/${baselineName}`);
    }

    await ensureDirectory(suitePath);
    await touchFile(baselinePaths.baselinesJsonlPath);
    await copyFile(sourceScreenshotPath, baselinePath);
    const size = await readPngSize(baselinePath);
    const now = isoNow();
    const baseline: VisualBaselineRef = {
      name: baselineName,
      suite,
      path: baselinePath,
      sourceScreenshotPath,
      width: size.width,
      height: size.height,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing ? now : undefined,
      metadata: options.metadata
    };
    await appendJsonLine(baselinePaths.baselinesJsonlPath, baseline);
    return baseline;
  }

  async listVisualBaselines(
    session: DesktopSession,
    options: ListVisualBaselinesOptions = {}
  ): Promise<VisualBaselineRef[]> {
    const baselinePaths = this.getBaselinePaths(
      session.workspacePath,
      session.config.evidenceRootPath
    );
    const requestedSuite = options.suite
      ? sanitizeBaselinePart(options.suite, "baseline suite")
      : undefined;
    try {
      const contents = await readFile(baselinePaths.baselinesJsonlPath, "utf8");
      const latestByKey = new Map<string, VisualBaselineRef>();
      for (const line of contents.split("\n")) {
        if (line.trim().length === 0) {
          continue;
        }
        const baseline = JSON.parse(line) as VisualBaselineRef;
        const suite = baseline.suite ?? "default";
        if (requestedSuite && suite !== requestedSuite) {
          continue;
        }
        latestByKey.set(`${suite}/${baseline.name}`, baseline);
      }
      return [...latestByKey.values()].sort((left, right) =>
        `${left.suite ?? "default"}/${left.name}`.localeCompare(`${right.suite ?? "default"}/${right.name}`)
      );
    } catch {
      return [];
    }
  }

  async findVisualBaseline(
    session: DesktopSession,
    name: string,
    suite = "default"
  ): Promise<VisualBaselineRef | undefined> {
    const baselineName = sanitizeBaselinePart(name, "baseline name");
    const baselineSuite = sanitizeBaselinePart(suite, "baseline suite");
    const baselines = await this.listVisualBaselines(session, {
      suite: baselineSuite
    });
    return baselines.find((baseline) => baseline.name === baselineName);
  }

  async createAnnotation(
    session: DesktopSession,
    input: CreateAnnotationInput
  ): Promise<ScreenshotAnnotation> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    validateAnnotationInput(input);

    const screenshotPath = this.getScreenshotFilePath(session, input.screenshotFileName);
    if (!(await pathExists(screenshotPath))) {
      throw new ProcessError(`Screenshot not found: ${input.screenshotFileName}`);
    }

    await ensureDirectory(paths.annotationsPath);
    await touchFile(paths.annotationsJsonlPath);

    const id = nextAnnotationId(await this.listAnnotations(session));
    let cropPath: string | undefined;
    if (input.cropPngBase64) {
      const cropBuffer = parsePngBase64(input.cropPngBase64);
      cropPath = join(paths.annotationsPath, `${id}-crop.png`);
      assertPathInside(paths.annotationsPath, cropPath, "Crop path is outside the session evidence directory.");
      await writeFile(cropPath, cropBuffer);
    }

    const annotation: ScreenshotAnnotation = {
      id,
      sessionId: session.id,
      screenshotPath,
      screenshotFileName: input.screenshotFileName,
      type: input.type,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      x2: input.x2,
      y2: input.y2,
      note: input.note.trim(),
      color: input.color,
      cropPath,
      createdAt: isoNow()
    };

    await appendJsonLine(paths.annotationsJsonlPath, annotation);
    await this.regenerateVisualHandoff(session);
    return annotation;
  }

  async listAnnotations(session: DesktopSession): Promise<ScreenshotAnnotation[]> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    try {
      const contents = await readFile(paths.annotationsJsonlPath, "utf8");
      return contents
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as ScreenshotAnnotation);
    } catch {
      return [];
    }
  }

  async getVisualHandoff(session: DesktopSession): Promise<VisualHandoff> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    if (!(await pathExists(paths.visualHandoffPath))) {
      return await this.regenerateVisualHandoff(session);
    }

    return {
      sessionId: session.id,
      path: paths.visualHandoffPath,
      text: await readFile(paths.visualHandoffPath, "utf8"),
      annotations: await this.listAnnotations(session)
    };
  }

  async regenerateVisualHandoff(session: DesktopSession): Promise<VisualHandoff> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    const annotations = await this.listAnnotations(session);
    const visualAssertions = await this.listVisualAssertions(session);
    const text = renderVisualHandoff(session, paths.sessionPath, annotations, visualAssertions);
    await writeTextAtomic(paths.visualHandoffPath, text);
    return {
      sessionId: session.id,
      path: paths.visualHandoffPath,
      text,
      annotations
    };
  }

  async writeReport(session: DesktopSession): Promise<void> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    const actions = await readActionRecords(paths.actionsJsonlPath);
    const screenshots = await this.listScreenshots(session);
    const inputActions = actions.filter((action) => action.type.startsWith("input."));
    const windowActions = actions.filter((action) => action.type.startsWith("window."));
    const commandLaunches = actions.filter(
      (action) => action.type === "app.launched" && action.status === "ok"
    );
    const stableActions = actions.filter(
      (action) => action.type === "screen.wait_for_stable" && action.status === "ok"
    );
    const visualAssertions = await this.listVisualAssertions(session);
    const annotationCount = (await this.listAnnotations(session)).length;
    const hasVisualHandoff = await pathExists(paths.visualHandoffPath);
    const lines = [
      `# Desktop Session ${session.id}`,
      "",
      "## Session Summary",
      "",
      `- Status: ${session.status}`,
      `- Display: ${session.display}`,
      `- Resolution: ${session.width}x${session.height}x${session.depth}`,
      `- Workspace: ${session.workspacePath}`,
      `- Evidence: ${session.evidencePath}`,
      `- Created: ${session.createdAt.toISOString()}`,
      `- Stopped: ${session.stoppedAt?.toISOString() ?? "not stopped"}`,
      `- Cleanup: ${formatCleanupStatus(session)}`,
      `- Xvfb PID: ${session.processIds.xvfb ?? "unknown"}`,
      `- Window manager PID: ${session.processIds.windowManager ?? "none"}`,
      `- App PIDs: ${session.processIds.apps.length > 0 ? session.processIds.apps.join(", ") : "none"}`,
      "",
      "## Warnings",
      "",
      ...(session.warnings.length > 0
        ? session.warnings.map((warning) => `- ${warning}`)
        : ["- None"]),
      "",
      "## Actions",
      "",
      `- Total action records: ${actions.length}`,
      `- Command launches: ${commandLaunches.length}`,
      `- Input actions: ${inputActions.length}`,
      `- Window actions: ${windowActions.length}`,
      `- Retained screenshots: ${screenshots.length}`,
      `- Stable-screen waits: ${stableActions.length}`,
      `- Visual QA assertions: ${visualAssertions.length}`,
      `- Visual handoff: ${hasVisualHandoff ? paths.visualHandoffPath : "none"}`,
      "",
      "## Command Launches",
      "",
      ...(commandLaunches.length > 0
        ? commandLaunches.map(formatCommandLaunch)
        : ["- None"]),
      "",
      "## Screenshots",
      "",
      ...(screenshots.length > 0
        ? screenshots.map((screenshot) => `- ${toEvidenceRelativePath(paths.sessionPath, screenshot.path)}`)
        : ["- None"]),
      "",
      "## Stable Screen",
      "",
      ...(stableActions.length > 0
        ? stableActions.map((action) => formatStableScreenAction(paths.sessionPath, action))
        : ["- None"]),
      "",
      "## Visual QA",
      "",
      ...(visualAssertions.length > 0
        ? visualAssertions.map((assertion) => formatVisualAssertion(paths.sessionPath, assertion))
        : ["- None"]),
      "",
      "## Annotation Handoff",
      "",
      `- Annotation count: ${annotationCount}`,
      `- Visual handoff: ${hasVisualHandoff ? toEvidenceRelativePath(paths.sessionPath, paths.visualHandoffPath) : "none"}`,
      "",
      "## Cleanup",
      "",
      `- Final status: ${session.status}`,
      `- Stopped at: ${session.stoppedAt?.toISOString() ?? "not stopped"}`,
      ...(session.warnings.length > 0
        ? session.warnings.map((warning) => `- Warning: ${warning}`)
        : ["- None"]),
      ""
    ];

    await writeTextAtomic(paths.reportPath, lines.join("\n"));
  }
}

export function assertSafePngFileName(fileName: string, label = "file name"): void {
  if (!isSafePngFileName(fileName)) {
    throw new ProcessError(`Invalid ${label}: ${fileName}`);
  }
}

export function isSafePngFileName(fileName: string): boolean {
  return (
    fileName.length > 0 &&
    fileName === basename(fileName) &&
    !fileName.includes("/") &&
    !fileName.includes("\\") &&
    fileName.toLowerCase().endsWith(".png")
  );
}

export function sanitizeBaselinePart(value: string, label: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    throw new ProcessError(`Visual ${label} cannot be empty.`);
  }
  const sanitized = trimmed
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (
    sanitized.length === 0 ||
    sanitized === "." ||
    sanitized === ".." ||
    sanitized.includes("/") ||
    sanitized.includes("\\")
  ) {
    throw new ProcessError(`Invalid visual ${label}: ${value}`);
  }
  return sanitized;
}

export function parsePngBase64(value: string): Buffer {
  const trimmed = value.trim();
  let base64 = trimmed;

  if (trimmed.startsWith("data:")) {
    const prefix = "data:image/png;base64,";
    if (!trimmed.toLowerCase().startsWith(prefix)) {
      throw new ProcessError("cropPngBase64 must be a PNG data URL.");
    }
    base64 = trimmed.slice(prefix.length);
  }

  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    throw new ProcessError("cropPngBase64 must contain valid base64 data.");
  }

  const buffer = Buffer.from(base64.replace(/\s+/g, ""), "base64");
  if (buffer.length === 0) {
    throw new ProcessError("cropPngBase64 cannot be empty.");
  }
  if (buffer.length > MAX_CROP_BYTES) {
    throw new ProcessError("cropPngBase64 is too large.");
  }
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new ProcessError("cropPngBase64 must decode to a PNG image.");
  }

  return buffer;
}

function formatCleanupStatus(session: DesktopSession): string {
  if (session.status === "stopped" && session.stoppedAt) {
    return "completed";
  }
  if (session.status === "failed") {
    return "failed";
  }
  return "not completed";
}

function formatCommandLaunch(action: ActionLogRecord): string {
  const details = action.details ?? {};
  const command = toOptionalString(details.command) ?? "unknown";
  const args = Array.isArray(details.args)
    ? details.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  const cwd = toOptionalString(details.cwd);
  const pid = toOptionalNumber(details.pid);
  return `- ${command}${args.length > 0 ? ` ${args.join(" ")}` : ""} (pid: ${pid ?? "unknown"}, cwd: ${cwd ?? "unknown"})`;
}

function formatStableScreenAction(sessionPath: string, action: ActionLogRecord): string {
  const details = action.details ?? {};
  const retainedScreenshots = Array.isArray(details.retainedScreenshots)
    ? details.retainedScreenshots.filter((path): path is string => typeof path === "string")
    : [];
  const lastScreenshot = toOptionalString(details.lastScreenshot);
  return [
    `- stable=${String(details.stable)}`,
    `checks=${String(details.checks ?? "unknown")}`,
    `elapsedMs=${String(details.elapsedMs ?? "unknown")}`,
    `mode=${String(details.mode ?? "hash")}`,
    `discarded=${String(details.discardedScreenshotCount ?? 0)}`,
    lastScreenshot ? `last=${toEvidenceRelativePath(sessionPath, lastScreenshot)}` : "last=none",
    retainedScreenshots.length > 0
      ? `retained=${retainedScreenshots.map((path) => toEvidenceRelativePath(sessionPath, path)).join(",")}`
      : "retained=none",
    details.reason ? `reason=${String(details.reason)}` : undefined
  ]
    .filter(Boolean)
    .join("; ");
}

function formatVisualAssertion(
  sessionPath: string,
  assertion: VisualCompareResult
): string {
  return [
    `- ${assertion.kind ?? "compare"}`,
    assertion.label ? `label=${assertion.label}` : undefined,
    assertion.baselineName ? `baseline=${assertion.baselineSuite ?? "default"}/${assertion.baselineName}` : undefined,
    assertion.annotationId ? `annotation=${assertion.annotationId}` : undefined,
    `diffPixelRatio=${assertion.diffPixelRatio.toFixed(6)}`,
    `diffPixels=${assertion.diffPixels}/${assertion.comparedPixels}`,
    assertion.passed === undefined ? undefined : `passed=${String(assertion.passed)}`,
    assertion.containmentPassed === undefined ? undefined : `containmentPassed=${String(assertion.containmentPassed)}`,
    assertion.insideDiffPixelRatio === undefined ? undefined : `insideDiffPixelRatio=${assertion.insideDiffPixelRatio.toFixed(6)}`,
    assertion.outsideDiffPixelRatio === undefined ? undefined : `outsideDiffPixelRatio=${assertion.outsideDiffPixelRatio.toFixed(6)}`,
    assertion.region
      ? `region=x:${assertion.region.x},y:${assertion.region.y},w:${assertion.region.width},h:${assertion.region.height}`
      : "region=full",
    assertion.allowedRegions && assertion.allowedRegions.length > 0
      ? `allowedRegions=${assertion.allowedRegions.map((region) => `x:${region.x},y:${region.y},w:${region.width},h:${region.height}`).join("|")}`
      : undefined,
    `before=${toEvidenceRelativePath(sessionPath, assertion.beforePath)}`,
    `after=${toEvidenceRelativePath(sessionPath, assertion.afterPath)}`,
    assertion.diffPath ? `diff=${toEvidenceRelativePath(sessionPath, assertion.diffPath)}` : "diff=none"
  ]
    .filter(Boolean)
    .join("; ");
}

function serializeSession(session: DesktopSession): Record<string, unknown> {
  return {
    id: session.id,
    name: session.config.name,
    status: session.status,
    display: session.display,
    displayNumber: session.displayNumber,
    createdAt: session.createdAt.toISOString(),
    stoppedAt: session.stoppedAt?.toISOString(),
    width: session.width,
    height: session.height,
    depth: session.depth,
    workspacePath: session.workspacePath,
    evidencePath: session.evidencePath,
    processIds: session.processIds,
    warnings: session.warnings,
    driverKind: session.driverKind
  };
}

function sanitizeFileLabel(label: string): string {
  const sanitized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized.length > 0 ? sanitized.slice(0, 80) : "screenshot";
}

async function readActionRecords(path: string): Promise<ActionLogRecord[]> {
  try {
    const contents = await readFile(path, "utf8");
    return contents
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as ActionLogRecord);
  } catch {
    return [];
  }
}

function assertPathInside(parentPath: string, childPath: string, message: string): void {
  if (!isPathInside(parentPath, childPath)) {
    throw new ProcessError(message);
  }
}

function validateAnnotationInput(input: CreateAnnotationInput): void {
  assertSafePngFileName(input.screenshotFileName, "screenshot file name");
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    throw new ProcessError("Annotation x and y must be finite numbers.");
  }
  if (input.note.trim().length === 0) {
    throw new ProcessError("Annotation note is required.");
  }

  if (input.type === "rectangle") {
    if (
      input.width === undefined ||
      input.height === undefined ||
      !Number.isFinite(input.width) ||
      !Number.isFinite(input.height) ||
      input.width <= 0 ||
      input.height <= 0
    ) {
      throw new ProcessError("Rectangle annotations require positive width and height.");
    }
    return;
  }

  if (input.type === "arrow") {
    if (
      input.x2 === undefined ||
      input.y2 === undefined ||
      !Number.isFinite(input.x2) ||
      !Number.isFinite(input.y2)
    ) {
      throw new ProcessError("Arrow annotations require x2 and y2.");
    }
  }
}

function nextAnnotationId(annotations: readonly ScreenshotAnnotation[]): string {
  const next = annotations.reduce((max, annotation) => {
    const match = /^ann_(\d+)$/.exec(annotation.id);
    if (!match) {
      return max;
    }
    return Math.max(max, Number.parseInt(match[1], 10));
  }, 0) + 1;
  return `ann_${String(next).padStart(3, "0")}`;
}

function renderVisualHandoff(
  session: DesktopSession,
  sessionPath: string,
  annotations: readonly ScreenshotAnnotation[],
  visualAssertions: readonly VisualCompareResult[]
): string {
  const lines = [
    "# Visual Handoff",
    "",
    `Session: ${session.id}`,
    "",
    "## Summary",
    "",
    annotations.length === 1
      ? "The human marked 1 area on the screenshot."
      : `The human marked ${annotations.length} areas on screenshots.`,
    "",
    "## Recommended agent next steps",
    "",
    "1. Inspect the screenshot and crop.",
    "2. Locate the relevant UI component/style.",
    "3. Make a minimal targeted fix.",
    "4. Rerun the GUI in Agent Desktop Harness.",
    "5. Capture a new screenshot.",
    "6. Compare before/after evidence.",
    ""
  ];

  if (annotations.length === 0) {
    lines.push("No annotations have been saved yet.", "");
  }

  for (const annotation of annotations) {
    lines.push(
      `## Annotation ${annotation.id}`,
      "",
      "Screenshot:",
      `\`${toEvidenceRelativePath(sessionPath, annotation.screenshotPath)}\``,
      "",
      "Crop:",
      annotation.cropPath
        ? `\`${toEvidenceRelativePath(sessionPath, annotation.cropPath)}\``
        : "Crop not available.",
      "",
      "Shape:",
      annotation.type,
      "",
      "Coordinates:",
      formatCoordinates(annotation),
      "",
      "Human note:",
      annotation.note,
      "",
      "Agent instruction:",
      "Inspect the screenshot and crop. Fix the UI/game issue described by the human note. Prefer a minimal targeted change. After fixing, rerun the app and capture new evidence.",
      ""
    );
  }

  if (annotations.length > 0 && visualAssertions.length > 0) {
    lines.push("## Visual QA", "");
    for (const assertion of visualAssertions) {
      lines.push(formatVisualAssertion(sessionPath, assertion), "");
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatCoordinates(annotation: ScreenshotAnnotation): string {
  if (annotation.type === "rectangle") {
    return `x=${annotation.x}, y=${annotation.y}, width=${annotation.width}, height=${annotation.height}`;
  }
  if (annotation.type === "arrow") {
    return `x=${annotation.x}, y=${annotation.y}, x2=${annotation.x2}, y2=${annotation.y2}`;
  }
  return `x=${annotation.x}, y=${annotation.y}`;
}

function toEvidenceRelativePath(sessionPath: string, path: string): string {
  const relativePath = relative(sessionPath, path);
  return relativePath.length > 0 ? relativePath : path;
}

function parseScreenshotFileName(fileName: string): {
  readonly sequence?: number;
  readonly label?: string;
} {
  const match = /^(\d+)-(.+)\.png$/i.exec(fileName);
  if (!match) {
    return {};
  }

  const sequence = Number.parseInt(match[1], 10);
  return {
    sequence: Number.isFinite(sequence) ? sequence : undefined,
    label: match[2]
  };
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
