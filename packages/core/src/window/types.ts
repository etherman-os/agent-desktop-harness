import type {
  DesktopSession,
  FocusWindowTarget,
  WindowActionResult,
  WindowInfo,
} from "../types.js";

export interface WindowBackend {
  getWindows(session: DesktopSession): Promise<WindowInfo[]>;
  focusWindow(session: DesktopSession, target: FocusWindowTarget): Promise<WindowActionResult>;
}
