import type {
  DesktopSession,
  FocusWindowTarget,
  WindowActionResult,
  WindowInfo
} from "../types.js";
import { WmctrlWindowBackend } from "./WmctrlWindowBackend.js";
import type { WindowBackend } from "./types.js";

export interface WindowServiceOptions {
  readonly backend?: WindowBackend;
}

export class WindowService implements WindowBackend {
  private readonly backend: WindowBackend;

  constructor(options: WindowServiceOptions = {}) {
    this.backend = options.backend ?? new WmctrlWindowBackend();
  }

  async getWindows(session: DesktopSession): Promise<WindowInfo[]> {
    return await this.backend.getWindows(session);
  }

  async focusWindow(
    session: DesktopSession,
    target: FocusWindowTarget
  ): Promise<WindowActionResult> {
    return await this.backend.focusWindow(session, target);
  }
}
