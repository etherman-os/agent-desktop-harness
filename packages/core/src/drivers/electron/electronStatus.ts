import { _electron } from "playwright-core";
import {
  findExecutableOnPath
} from "../../utils/command.js";
import type { ElectronDriverStatus } from "./electronTypes.js";

export interface ElectronStatusOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly findExecutable?: typeof findExecutableOnPath;
}

export async function getElectronDriverStatus(
  options: ElectronStatusOptions = {}
): Promise<ElectronDriverStatus> {
  const env = options.env ?? process.env;
  const findExecutable = options.findExecutable ?? findExecutableOnPath;
  const warnings: string[] = [];
  const errors: string[] = [];
  const playwrightAvailable = _electron !== undefined && typeof _electron.launch === "function";
  const electronBinaryPath = await findExecutable("electron", env);

  if (!playwrightAvailable) {
    errors.push("Playwright Electron API is missing from playwright-core.");
  }
  if (!electronBinaryPath) {
    warnings.push(
      "No electron binary was found on PATH; provide command or executablePath for Electron apps."
    );
  }

  return {
    available: playwrightAvailable,
    playwrightAvailable,
    electronBinaryPath,
    warnings,
    errors
  };
}
