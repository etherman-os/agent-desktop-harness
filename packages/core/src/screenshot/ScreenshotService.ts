import type { DesktopSession, ScreenshotOptions, ScreenshotResult } from "../types.js";
import { MissingDependencyError, ProcessError } from "../errors.js";
import { assertExecutableOnPath, createSanitizedEnvironment, runCommand } from "../utils/command.js";
import { fileSize } from "../utils/fs.js";
import { now } from "../utils/time.js";

export class ScreenshotService {
  async capture(
    session: DesktopSession,
    filePath: string,
    sequence: number,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotResult> {
    await assertExecutableOnPath(
      "scrot",
      "Install scrot, for example: sudo apt install -y scrot"
    );

    try {
      await runCommand("scrot", [filePath], {
        env: createSanitizedEnvironment({ DISPLAY: session.display })
      });
    } catch (error) {
      if (error instanceof MissingDependencyError) {
        throw error;
      }

      throw new ProcessError(
        `Failed to capture screenshot from display ${session.display}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error
      );
    }

    const size = await fileSize(filePath);
    if (size <= 0) {
      throw new ProcessError(`Screenshot file was created but is empty: ${filePath}`);
    }

    const createdAt = now();
    return {
      artifactId: `screenshot-${String(sequence).padStart(4, "0")}`,
      sessionId: session.id,
      path: filePath,
      width: session.width,
      height: session.height,
      capturedAt: createdAt,
      createdAt,
      display: session.display,
      sequence,
      label: options.label
    };
  }
}
