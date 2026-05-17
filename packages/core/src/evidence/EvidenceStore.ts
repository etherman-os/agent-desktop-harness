import { basename, join, relative } from "node:path";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import type {
  ActionLogRecord,
  CreateAnnotationInput,
  DesktopSession,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotOptions,
  VisualHandoff
} from "../types.js";
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
  readonly annotationsPath: string;
  readonly annotationsJsonlPath: string;
  readonly reportPath: string;
  readonly visualHandoffPath: string;
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
      annotationsPath: join(sessionPath, "annotations"),
      annotationsJsonlPath: join(sessionPath, "annotations.jsonl"),
      reportPath: join(sessionPath, "report.md"),
      visualHandoffPath: join(sessionPath, "visual-handoff.md")
    };
  }

  async createSession(session: DesktopSession): Promise<void> {
    const paths = this.getPaths(
      session.workspacePath,
      session.id,
      session.config.evidenceRootPath
    );
    await ensureDirectory(paths.screenshotsPath);
    await ensureDirectory(paths.annotationsPath);
    await touchFile(paths.actionsJsonlPath);
    await touchFile(paths.annotationsJsonlPath);
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
    return join(paths.screenshotsPath, fileName);
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
    const text = renderVisualHandoff(session, paths.sessionPath, annotations);
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
    const screenshotPaths = actions
      .filter((action) => action.type === "screenshot.captured" && action.status === "ok")
      .map((action) => action.details?.path)
      .filter((path): path is string => typeof path === "string");
    const inputActions = actions.filter((action) => action.type.startsWith("input."));
    const windowActions = actions.filter((action) => action.type.startsWith("window."));
    const lines = [
      `# Desktop Session ${session.id}`,
      "",
      `- Status: ${session.status}`,
      `- Display: ${session.display}`,
      `- Resolution: ${session.width}x${session.height}x${session.depth}`,
      `- Workspace: ${session.workspacePath}`,
      `- Evidence: ${session.evidencePath}`,
      `- Created: ${session.createdAt.toISOString()}`,
      `- Stopped: ${session.stoppedAt?.toISOString() ?? "not stopped"}`,
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
      `- Input actions: ${inputActions.length}`,
      `- Window actions: ${windowActions.length}`,
      `- Screenshots: ${screenshotPaths.length}`,
      `- Visual handoff: ${await pathExists(paths.visualHandoffPath) ? paths.visualHandoffPath : "none"}`,
      "",
      "## Screenshots",
      "",
      ...(screenshotPaths.length > 0
        ? screenshotPaths.map((path) => `- ${path}`)
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
  annotations: readonly ScreenshotAnnotation[]
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
