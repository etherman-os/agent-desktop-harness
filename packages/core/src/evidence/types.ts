import type {
  DesktopSession,
  EvidenceArtifact,
  InputAction,
  ScreenshotResult
} from "../types.js";

export interface EvidenceRecorder {
  recordSessionStarted(session: DesktopSession): Promise<EvidenceArtifact>;
  recordInputAction(
    session: DesktopSession,
    action: InputAction
  ): Promise<EvidenceArtifact>;
  recordScreenshot(result: ScreenshotResult): Promise<EvidenceArtifact>;
  writeReport(session: DesktopSession): Promise<EvidenceReport>;
}

export interface EvidenceReport {
  readonly sessionId: string;
  readonly path: string;
  readonly artifacts: readonly EvidenceArtifact[];
  readonly createdAt: Date;
}
