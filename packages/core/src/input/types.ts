import type {
  ClickAction,
  DesktopSession,
  HotkeyAction,
  InputActionResult,
  ScrollAction,
  TypeTextAction,
} from "../types.js";

export interface InputBackend {
  click(session: DesktopSession, action: ClickAction): Promise<InputActionResult>;
  doubleClick(session: DesktopSession, action: ClickAction): Promise<InputActionResult>;
  typeText(session: DesktopSession, action: TypeTextAction): Promise<InputActionResult>;
  hotkey(session: DesktopSession, action: HotkeyAction): Promise<InputActionResult>;
  scroll(session: DesktopSession, action: ScrollAction): Promise<InputActionResult>;
}
