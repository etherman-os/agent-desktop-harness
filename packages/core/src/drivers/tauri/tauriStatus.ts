import { findExecutableOnPath } from "../../utils/command.js";
import type { TauriDriverStatus } from "./tauriTypes.js";

export interface TauriStatusOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly findExecutable?: typeof findExecutableOnPath;
}

export async function getTauriDriverStatus(
  options: TauriStatusOptions = {}
): Promise<TauriDriverStatus> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const findExecutable = options.findExecutable ?? findExecutableOnPath;
  const [tauriDriverPath, webKitWebDriverPath, cargoPath] = await Promise.all([
    findExecutable("tauri-driver", env),
    findExecutable("WebKitWebDriver", env),
    findExecutable("cargo", env)
  ]);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!tauriDriverPath) {
    errors.push("tauri-driver is missing. Install it with `cargo install tauri-driver --locked`.");
  }
  if (!cargoPath) {
    warnings.push("cargo is missing; it is needed to install or update tauri-driver.");
  }

  if (platform === "linux") {
    if (!webKitWebDriverPath) {
      errors.push(
        "WebKitWebDriver is missing. Install the WebKit WebDriver package for this distribution."
      );
    }
  } else if (platform === "darwin") {
    errors.push(
      "Tauri desktop WebDriver is not supported on macOS because WKWebView does not provide a WebDriver tool."
    );
  } else if (platform === "win32") {
    warnings.push("Windows requires a matching Microsoft Edge WebDriver on PATH for tauri-driver.");
  } else {
    warnings.push(`Tauri WebDriver support on ${platform} is experimental and unverified.`);
  }

  return {
    available: errors.length === 0,
    tauriDriverPath,
    webKitWebDriverPath,
    cargoPath,
    warnings,
    errors
  };
}
