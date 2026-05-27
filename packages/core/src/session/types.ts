import type {
  DesktopSession,
  InputAction,
  ScreenshotResult,
  SessionConfig,
  SessionId,
} from "../types.js";

export interface SessionManagerPort {
  start(config: SessionConfig): Promise<DesktopSession>;
  stop(sessionId: SessionId): Promise<void>;
  get(sessionId: SessionId): Promise<DesktopSession | undefined>;
}

export interface DisplayBackend {
  start(session: DesktopSession): Promise<void>;
  stop(session: DesktopSession): Promise<void>;
}

export interface SessionInputBackend {
  perform(session: DesktopSession, action: InputAction): Promise<void>;
}

export interface ScreenshotBackend {
  capture(session: DesktopSession): Promise<ScreenshotResult>;
}
