import type {
  ClickAction,
  DesktopSession,
  HotkeyAction,
  InputActionResult,
  ScrollAction,
  TypeTextAction
} from "../types.js";
import { XdotoolInputBackend } from "./XdotoolInputBackend.js";
import type { InputBackend } from "./types.js";

export interface InputServiceOptions {
  readonly backend?: InputBackend;
}

export class InputService implements InputBackend {
  private readonly backend: InputBackend;

  constructor(options: InputServiceOptions = {}) {
    this.backend = options.backend ?? new XdotoolInputBackend();
  }

  async click(session: DesktopSession, action: ClickAction): Promise<InputActionResult> {
    return await this.backend.click(session, action);
  }

  async doubleClick(
    session: DesktopSession,
    action: ClickAction
  ): Promise<InputActionResult> {
    return await this.backend.doubleClick(session, action);
  }

  async typeText(
    session: DesktopSession,
    action: TypeTextAction
  ): Promise<InputActionResult> {
    return await this.backend.typeText(session, action);
  }

  async hotkey(session: DesktopSession, action: HotkeyAction): Promise<InputActionResult> {
    return await this.backend.hotkey(session, action);
  }

  async scroll(session: DesktopSession, action: ScrollAction): Promise<InputActionResult> {
    return await this.backend.scroll(session, action);
  }
}
