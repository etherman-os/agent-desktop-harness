import type { SpawnOptionsWithoutStdio } from "node:child_process";
import type {
  ClickAction,
  DesktopSession,
  HotkeyAction,
  InputActionResult,
  ScrollAction,
  TypeTextAction
} from "../types.js";
import { ProcessError } from "../errors.js";
import {
  assertExecutableOnPath,
  createSanitizedEnvironment,
  runCommand
} from "../utils/command.js";
import type { CommandRunner, DependencyChecker } from "../utils/command.js";
import { isoNow } from "../utils/time.js";
import type { InputBackend } from "./types.js";

const BUTTON_BY_NAME: Record<NonNullable<ClickAction["button"]>, string> = {
  left: "1",
  middle: "2",
  right: "3"
};

const SCROLL_BUTTON_BY_DIRECTION: Record<ScrollAction["direction"], string> = {
  up: "4",
  down: "5",
  left: "6",
  right: "7"
};

const KEY_ALIASES = new Map<string, string>([
  ["cmd", "Super"],
  ["command", "Super"],
  ["control", "ctrl"],
  ["ctrl", "ctrl"],
  ["escape", "Escape"],
  ["esc", "Escape"],
  ["alt", "alt"],
  ["option", "alt"],
  ["shift", "shift"],
  ["tab", "Tab"],
  ["enter", "Return"],
  ["return", "Return"],
  ["space", "space"],
  ["backspace", "BackSpace"],
  ["delete", "Delete"]
]);

export interface XdotoolInputBackendOptions {
  readonly commandRunner?: CommandRunner;
  readonly dependencyChecker?: DependencyChecker;
}

export class XdotoolInputBackend implements InputBackend {
  private readonly commandRunner: CommandRunner;
  private readonly dependencyChecker: DependencyChecker;

  constructor(options: XdotoolInputBackendOptions = {}) {
    this.commandRunner = options.commandRunner ?? runCommand;
    this.dependencyChecker = options.dependencyChecker ?? assertExecutableOnPath;
  }

  async click(session: DesktopSession, action: ClickAction): Promise<InputActionResult> {
    const button = toXdotoolButton(action.button ?? "left");
    await this.runXdotool(session, [
      "mousemove",
      String(action.x),
      String(action.y),
      "click",
      button
    ]);

    return makeInputResult(session, "input.click", {
      x: action.x,
      y: action.y,
      button: action.button ?? "left",
      label: action.label
    });
  }

  async doubleClick(session: DesktopSession, action: ClickAction): Promise<InputActionResult> {
    const button = toXdotoolButton(action.button ?? "left");
    await this.runXdotool(session, [
      "mousemove",
      String(action.x),
      String(action.y),
      "click",
      "--repeat",
      "2",
      button
    ]);

    return makeInputResult(session, "input.double_click", {
      x: action.x,
      y: action.y,
      button: action.button ?? "left",
      label: action.label
    });
  }

  async typeText(session: DesktopSession, action: TypeTextAction): Promise<InputActionResult> {
    await this.runXdotool(session, ["type", "--delay", "0", "--", action.text]);

    return makeInputResult(session, "input.type_text", makeTypeTextDetails(action));
  }

  async hotkey(session: DesktopSession, action: HotkeyAction): Promise<InputActionResult> {
    const keyChord = normalizeHotkeyKeys(action.keys).join("+");
    await this.runXdotool(session, ["key", keyChord]);

    return makeInputResult(session, "input.hotkey", {
      keys: normalizeHotkeyKeys(action.keys),
      label: action.label
    });
  }

  async scroll(session: DesktopSession, action: ScrollAction): Promise<InputActionResult> {
    const amount = normalizeScrollAmount(action.amount);
    const button = scrollDirectionToButton(action.direction);
    const args: string[] = [];

    if (action.x !== undefined && action.y !== undefined) {
      args.push("mousemove", String(action.x), String(action.y));
    }

    args.push("click", "--repeat", String(amount), button);
    await this.runXdotool(session, args);

    return makeInputResult(session, "input.scroll", {
      direction: action.direction,
      amount,
      x: action.x,
      y: action.y,
      label: action.label
    });
  }

  private async runXdotool(
    session: DesktopSession,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio = {}
  ): Promise<void> {
    await this.dependencyChecker(
      "xdotool",
      "Install it with: sudo apt install -y xdotool"
    );
    await this.commandRunner("xdotool", args, {
      ...options,
      env: createSanitizedEnvironment({
        ...options.env,
        DISPLAY: session.display
      })
    });
  }
}

export function toXdotoolButton(button: NonNullable<ClickAction["button"]>): string {
  return BUTTON_BY_NAME[button];
}

export function scrollDirectionToButton(direction: ScrollAction["direction"]): string {
  return SCROLL_BUTTON_BY_DIRECTION[direction];
}

export function normalizeScrollAmount(amount: number | undefined): number {
  if (amount === undefined) {
    return 1;
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw new ProcessError("Scroll amount must be a positive integer.");
  }
  return amount;
}

export function normalizeHotkeyKeys(keys: readonly string[]): string[] {
  if (keys.length === 0) {
    throw new ProcessError("Hotkey action requires at least one key.");
  }

  return keys.map((key) => {
    const trimmed = key.trim();
    if (trimmed.length === 0) {
      throw new ProcessError("Hotkey keys cannot be empty.");
    }
    return KEY_ALIASES.get(trimmed.toLowerCase()) ?? trimmed;
  });
}

export function makeTypeTextDetails(action: TypeTextAction): Readonly<Record<string, unknown>> {
  if (action.secret) {
    return {
      redacted: true,
      textLength: action.text.length,
      label: action.label
    };
  }

  return {
    text: truncateForLog(action.text),
    textLength: action.text.length,
    truncated: action.text.length > 256,
    label: action.label
  };
}

function toResultDetails(
  details: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined)
  );
}

function makeInputResult(
  session: DesktopSession,
  actionType: string,
  details: Readonly<Record<string, unknown>>
): InputActionResult {
  return {
    sessionId: session.id,
    actionType,
    createdAt: isoNow(),
    success: true,
    details: toResultDetails(details)
  };
}

function truncateForLog(value: string): string {
  return value.length > 256 ? `${value.slice(0, 256)}...` : value;
}
