import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { assertExecutableOnPath, createSanitizedEnvironment, findExecutableOnPath, runCommand, waitForSpawn } from "../utils/command.js";
import { terminateProcessTree } from "../session/processTree.js";
import { ProcessError } from "../errors.js";

export interface XvfbDisplayOptions {
  readonly display: string;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly readyTimeoutMs?: number;
}

export interface StartedXvfbDisplay {
  readonly display: string;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly xvfbProcess: ChildProcess;
  readonly windowManagerProcess?: ChildProcess;
  readonly warnings: readonly string[];
}

export class XvfbDisplay {
  async start(options: XvfbDisplayOptions): Promise<StartedXvfbDisplay> {
    await assertExecutableOnPath(
      "Xvfb",
      "Install Xvfb, for example: sudo apt install -y xvfb"
    );
    await assertExecutableOnPath(
      "xdpyinfo",
      "Install x11-utils, for example: sudo apt install -y x11-utils"
    );

    const xvfbProcess = spawn(
      "Xvfb",
      [
        options.display,
        "-screen",
        "0",
        `${options.width}x${options.height}x${options.depth}`,
        "-nolisten",
        "tcp"
      ],
      {
        detached: true,
        env: createSanitizedEnvironment(),
        shell: false,
        stdio: "ignore"
      }
    );

    await waitForSpawn(xvfbProcess, "Xvfb");

    try {
      await this.waitUntilReady(options.display, options.readyTimeoutMs ?? 5000);
    } catch (error) {
      await terminateProcessTree(xvfbProcess);
      throw error;
    }

    const warnings: string[] = [];
    const windowManagerProcess = await this.tryStartWindowManager(options.display, warnings);

    return {
      display: options.display,
      width: options.width,
      height: options.height,
      depth: options.depth,
      xvfbProcess,
      windowManagerProcess,
      warnings
    };
  }

  private async waitUntilReady(display: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;

    while (Date.now() < deadline) {
      try {
        await runCommand("xdpyinfo", ["-display", display], {
          env: createSanitizedEnvironment({ DISPLAY: display })
        });
        return;
      } catch (error) {
        lastError = error;
        await sleep(100);
      }
    }

    throw new ProcessError(
      `Xvfb started but display ${display} did not become ready within ${timeoutMs}ms.`,
      lastError
    );
  }

  private async tryStartWindowManager(
    display: string,
    warnings: string[]
  ): Promise<ChildProcess | undefined> {
    const openboxPath = await findExecutableOnPath("openbox");
    if (!openboxPath) {
      warnings.push("openbox was not found; continuing without a window manager.");
      return undefined;
    }

    const child = spawn("openbox", [], {
      detached: true,
      env: createSanitizedEnvironment({ DISPLAY: display }),
      shell: false,
      stdio: "ignore"
    });

    try {
      await waitForSpawn(child, "openbox");
      await sleep(250);
      if (child.exitCode !== null || child.signalCode !== null) {
        warnings.push("openbox started but exited immediately; continuing without it.");
        return undefined;
      }
      return child;
    } catch (error) {
      warnings.push(
        `openbox could not be started; continuing without a window manager: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return undefined;
    }
  }
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
