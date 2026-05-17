import type {
  DesktopSession,
  FocusWindowTarget,
  WindowActionResult,
  WindowInfo
} from "../types.js";
import { ProcessError } from "../errors.js";
import {
  assertExecutableOnPath,
  createSanitizedEnvironment,
  runCommand
} from "../utils/command.js";
import type { CommandRunner, DependencyChecker } from "../utils/command.js";
import { isoNow } from "../utils/time.js";
import type { WindowBackend } from "./types.js";

export interface WmctrlWindowBackendOptions {
  readonly commandRunner?: CommandRunner;
  readonly dependencyChecker?: DependencyChecker;
}

export class WmctrlWindowBackend implements WindowBackend {
  private readonly commandRunner: CommandRunner;
  private readonly dependencyChecker: DependencyChecker;

  constructor(options: WmctrlWindowBackendOptions = {}) {
    this.commandRunner = options.commandRunner ?? runCommand;
    this.dependencyChecker = options.dependencyChecker ?? assertExecutableOnPath;
  }

  async getWindows(session: DesktopSession): Promise<WindowInfo[]> {
    await this.ensureWmctrl();
    const result = await this.commandRunner("wmctrl", ["-lp"], {
      env: createSanitizedEnvironment({ DISPLAY: session.display })
    });

    return parseWmctrlWindowList(result.stdout);
  }

  async focusWindow(
    session: DesktopSession,
    target: FocusWindowTarget
  ): Promise<WindowActionResult> {
    const windows = await this.getWindows(session);
    const window = findMatchingWindow(windows, target);

    if (!window) {
      throw new ProcessError("No matching window was found for focusWindow.");
    }

    await this.ensureWmctrl();
    await this.commandRunner("wmctrl", ["-ia", window.id], {
      env: createSanitizedEnvironment({ DISPLAY: session.display })
    });

    return {
      sessionId: session.id,
      success: true,
      window,
      createdAt: isoNow()
    };
  }

  private async ensureWmctrl(): Promise<void> {
    await this.dependencyChecker(
      "wmctrl",
      "Install it with: sudo apt install -y wmctrl"
    );
  }
}

export function parseWmctrlWindowList(stdout: string): WindowInfo[] {
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(parseWmctrlLine);
}

export function parseWmctrlLine(line: string): WindowInfo {
  const match = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line);

  if (!match) {
    return {
      id: "",
      title: "",
      raw: line
    };
  }

  const [, id, desktop, pidValue, , rest] = match;
  const pid = Number.parseInt(pidValue, 10);

  return {
    id,
    desktop,
    pid: Number.isFinite(pid) && pid >= 0 ? pid : undefined,
    title: rest,
    raw: line
  };
}

export function findMatchingWindow(
  windows: readonly WindowInfo[],
  target: FocusWindowTarget
): WindowInfo | undefined {
  if (target.id) {
    const id = target.id.toLowerCase();
    return windows.find((window) => window.id.toLowerCase() === id);
  }

  if (target.pid !== undefined) {
    return windows.find((window) => window.pid === target.pid);
  }

  if (target.title) {
    return windows.find((window) => window.title === target.title);
  }

  if (target.titleIncludes) {
    const needle = target.titleIncludes.toLowerCase();
    return windows.find((window) => window.title.toLowerCase().includes(needle));
  }

  throw new ProcessError("focusWindow requires id, pid, title, or titleIncludes.");
}
