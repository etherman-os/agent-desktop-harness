import { basename } from "node:path";
import { checkBinary } from "./doctor.js";

export type BrowserKind = "chromium" | "firefox";

export interface GuiBrowser {
  readonly command: string;
  readonly path: string;
  readonly kind: BrowserKind;
  readonly source: "env" | "path";
}

export interface BrowserCandidate {
  readonly command: string;
  readonly kind: BrowserKind;
  readonly installHint: string;
}

export interface BrowserLaunchConfig {
  readonly command: string;
  readonly args: readonly string[];
}

export type BinaryChecker = (
  name: string,
  env?: NodeJS.ProcessEnv,
) => Promise<{ readonly found: boolean; readonly path?: string }>;

export const GUI_BROWSER_CANDIDATES: readonly BrowserCandidate[] = [
  {
    command: "chromium",
    kind: "chromium",
    installHint: "sudo apt install -y chromium",
  },
  {
    command: "chromium-browser",
    kind: "chromium",
    installHint: "sudo apt install -y chromium-browser",
  },
  {
    command: "google-chrome",
    kind: "chromium",
    installHint: "Install Google Chrome or use google-chrome-stable if available.",
  },
  {
    command: "google-chrome-stable",
    kind: "chromium",
    installHint: "Install Google Chrome Stable from the official package.",
  },
  {
    command: "firefox",
    kind: "firefox",
    installHint: "sudo apt install -y firefox",
  },
];

export async function detectGuiBrowser(
  options: { readonly env?: NodeJS.ProcessEnv; readonly check?: BinaryChecker } = {},
): Promise<GuiBrowser | undefined> {
  const env = options.env ?? process.env;
  const check = options.check ?? checkBinary;
  const override = env.AGENT_DESKTOP_HARNESS_BROWSER?.trim();

  if (override) {
    const binary = await check(override, env);
    if (!binary.found) {
      throw new Error(`AGENT_DESKTOP_HARNESS_BROWSER is set but is not executable: ${override}`);
    }

    return {
      command: binary.path ?? override,
      path: binary.path ?? override,
      kind: inferBrowserKind(override),
      source: "env",
    };
  }

  for (const candidate of GUI_BROWSER_CANDIDATES) {
    const binary = await check(candidate.command, env);
    if (binary.found && binary.path) {
      return {
        command: candidate.command,
        path: binary.path,
        kind: candidate.kind,
        source: "path",
      };
    }
  }

  return undefined;
}

export function buildBrowserLaunchConfig(
  browser: GuiBrowser,
  profileDir: string,
  url: string,
): BrowserLaunchConfig {
  if (browser.kind === "firefox") {
    return {
      command: browser.command,
      args: ["--profile", profileDir, "--new-instance", "--width", "1180", "--height", "760", url],
    };
  }

  return {
    command: browser.command,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--disable-default-apps",
      "--window-size=1180,760",
      "--window-position=130,70",
      `--user-data-dir=${profileDir}`,
      url,
    ],
  };
}

export function formatMissingGuiBrowserMessage(): string {
  return [
    "Missing GUI browser for Vite smoke.",
    "Install one of:",
    "  sudo apt install -y chromium-browser",
    "  sudo apt install -y chromium",
    "  sudo apt install -y firefox",
    "or set AGENT_DESKTOP_HARNESS_BROWSER=/path/to/browser",
  ].join("\n");
}

function inferBrowserKind(command: string): BrowserKind {
  const name = basename(command).toLowerCase();
  return name.includes("firefox") ? "firefox" : "chromium";
}
