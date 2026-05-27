import type { DesktopSession, DriverKind, InputAction, ScreenshotResult } from "../types.js";

export interface DriverProbeResult {
  readonly kind: DriverKind;
  readonly confidence: number;
  readonly reason: string;
}

export interface Driver {
  readonly kind: DriverKind;
  probe(session: DesktopSession): Promise<DriverProbeResult>;
  screenshot(session: DesktopSession): Promise<ScreenshotResult>;
  perform(session: DesktopSession, action: InputAction): Promise<void>;
}

export interface DriverRouter {
  resolve(session: DesktopSession): Promise<Driver>;
}
