import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { getElectronDriverStatus, getLiveObserverStatus } from "@agent-desktop-harness/core";
import type { LiveObserverStatus } from "@agent-desktop-harness/core";
import { repoRootPath } from "./repo.js";

export type DependencyLevel = "required" | "recommended" | "optional" | "experimental" | "observer";

export interface DependencyDefinition {
  readonly name: string;
  readonly level: DependencyLevel;
  readonly installHint: string;
}

export interface DependencyStatus extends DependencyDefinition {
  readonly found: boolean;
  readonly path?: string;
}

export interface DoctorReport {
  readonly ready: boolean;
  readonly status: "ready" | "not_ready";
  readonly dependencies: readonly DependencyStatus[];
  readonly experimental?: {
    readonly tauriDriver: {
      readonly available: boolean;
      readonly dependencies: readonly DependencyStatus[];
      readonly warnings: readonly string[];
      readonly errors: readonly string[];
    };
    readonly electronDriver: {
      readonly available: boolean;
      readonly playwrightAvailable: boolean;
      readonly electronBinaryPath?: string;
      readonly warnings: readonly string[];
      readonly errors: readonly string[];
    };
  };
  readonly optional?: {
    readonly liveObserver: LiveObserverStatus;
  };
}

export const DOCTOR_DEPENDENCIES: readonly DependencyDefinition[] = [
  {
    name: "Xvfb",
    level: "required",
    installHint: "sudo apt install -y xvfb"
  },
  {
    name: "xdpyinfo",
    level: "required",
    installHint: "sudo apt install -y x11-utils"
  },
  {
    name: "scrot",
    level: "required",
    installHint: "sudo apt install -y scrot"
  },
  {
    name: "xdotool",
    level: "required",
    installHint: "sudo apt install -y xdotool"
  },
  {
    name: "wmctrl",
    level: "required",
    installHint: "sudo apt install -y wmctrl"
  },
  {
    name: "openbox",
    level: "recommended",
    installHint: "sudo apt install -y openbox"
  },
  {
    name: "xterm",
    level: "optional",
    installHint: "sudo apt install -y xterm"
  },
  {
    name: "chromium",
    level: "optional",
    installHint: "sudo apt install -y chromium"
  },
  {
    name: "chromium-browser",
    level: "optional",
    installHint: "sudo apt install -y chromium-browser"
  },
  {
    name: "google-chrome",
    level: "optional",
    installHint: "Install Google Chrome or use google-chrome-stable if available."
  },
  {
    name: "google-chrome-stable",
    level: "optional",
    installHint: "Install Google Chrome Stable from the official package."
  },
  {
    name: "firefox",
    level: "optional",
    installHint: "sudo apt install -y firefox"
  },
  {
    name: "tauri-driver",
    level: "experimental",
    installHint: "cargo install tauri-driver --locked"
  },
  {
    name: "WebKitWebDriver",
    level: "experimental",
    installHint: "Install the WebKit WebDriver package for your distribution; package names vary."
  },
  {
    name: "cargo",
    level: "experimental",
    installHint: "Install Rust and Cargo from your distribution packages or rustup."
  },
  {
    name: "x11vnc",
    level: "observer",
    installHint: "sudo apt install -y x11vnc"
  },
  {
    name: "websockify",
    level: "observer",
    installHint: "sudo apt install -y websockify"
  },
  {
    name: "novnc_proxy",
    level: "observer",
    installHint: "sudo apt install -y novnc"
  }
];

export async function runDoctor(
  dependencies: readonly DependencyDefinition[] = DOCTOR_DEPENDENCIES,
  env: NodeJS.ProcessEnv = process.env
): Promise<DoctorReport> {
  const statuses = await Promise.all(
    dependencies.map(async (dependency) => {
      const binary = await checkBinary(dependency.name, env);
      return {
        ...dependency,
        found: binary.found,
        path: binary.path
      };
    })
  );
  const ready = getMissingRequiredDependencies(statuses).length === 0;

  const electronDriver = await withLocalElectronBinary(
    await getElectronDriverStatus({ env }),
    env
  );
  const liveObserver = await getLiveObserverStatus({ env });

  return {
    ready,
    status: ready ? "ready" : "not_ready",
    dependencies: statuses,
    experimental: {
      tauriDriver: makeTauriDriverExperimentalReport(statuses),
      electronDriver
    },
    optional: {
      liveObserver
    }
  };
}

export async function checkBinary(
  name: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ readonly found: boolean; readonly path?: string }> {
  const pathValue = env.PATH ?? "";

  if (name.includes("/") || isAbsolute(name)) {
    const candidate = isAbsolute(name) ? name : join(process.cwd(), name);
    return (await isExecutable(candidate))
      ? { found: true, path: candidate }
      : { found: false };
  }

  for (const pathEntry of pathValue.split(delimiter)) {
    if (pathEntry.length === 0) {
      continue;
    }

    const candidate = join(pathEntry, name);
    if (await isExecutable(candidate)) {
      return {
        found: true,
        path: candidate
      };
    }
  }

  return { found: false };
}

export function formatDoctorText(report: DoctorReport): string {
  const lines = [
    "Agent Desktop Harness Doctor",
    "",
    ...formatDependencySection("Required dependencies", report.dependencies, "required"),
    "",
    ...formatDependencySection(
      "Recommended dependencies",
      report.dependencies,
      "recommended"
    ),
    "",
    ...formatDependencySection(
      "Optional smoke dependencies",
      report.dependencies,
      "optional"
    ),
    "",
    ...formatLiveObserverSummary(report),
    "",
    ...formatDependencySection(
      "Experimental Tauri driver dependencies",
      report.dependencies,
      "experimental"
    ),
    ...formatExperimentalTauriDriverSummary(report),
    "",
    ...formatExperimentalElectronDriverSummary(report),
    "",
    `Status: ${report.status}`
  ];

  return lines.join("\n");
}

function formatLiveObserverSummary(report: DoctorReport): string[] {
  const observerDependencies = report.dependencies.filter(
    (dependency) => dependency.level === "observer"
  );
  const status = report.optional?.liveObserver;
  const webRootLine = status?.noVncWebRootPath
    ? `  ${"noVNC web root".padEnd(14, " ")} OK      ${status.noVncWebRootPath}`
    : `  ${"noVNC web root".padEnd(14, " ")} MISSING install with: sudo apt install -y novnc`;

  return [
    "Optional live observer dependencies:",
    ...observerDependencies.map((dependency) => `  ${formatDependencyLine(dependency)}`),
    webRootLine,
    `  Live observer path: ${status?.available ? "available" : "unavailable"}`,
    ...(status?.errors ?? []).map((error) => `    error: ${error}`),
    ...(status?.warnings ?? []).map((warning) => `    warning: ${warning}`)
  ];
}

export function getMissingRequiredDependencies(
  dependencies: readonly DependencyStatus[]
): DependencyStatus[] {
  return dependencies.filter(
    (dependency) => dependency.level === "required" && !dependency.found
  );
}

export function findDependencyStatus(
  report: DoctorReport,
  name: string
): DependencyStatus | undefined {
  return report.dependencies.find((dependency) => dependency.name === name);
}

export function getTauriDriverDependencyStatuses(
  dependencies: readonly DependencyStatus[]
): DependencyStatus[] {
  return dependencies.filter((dependency) => dependency.level === "experimental");
}

export function formatMissingRequiredMessage(report: DoctorReport): string {
  const missing = getMissingRequiredDependencies(report.dependencies);
  if (missing.length === 0) {
    return "";
  }

  const hints = missing.map(
    (dependency) => `  ${dependency.name}: ${dependency.installHint}`
  );

  return [
    `Missing required dependencies: ${missing.map((dependency) => dependency.name).join(", ")}`,
    "Install them manually or run ./scripts/install-ubuntu-deps.sh.",
    "Install hints:",
    ...hints
  ].join("\n");
}

function formatDependencySection(
  title: string,
  dependencies: readonly DependencyStatus[],
  level: DependencyLevel
): string[] {
  const matching = dependencies.filter((dependency) => dependency.level === level);

  return [
    `${title}:`,
    ...matching.map((dependency) => `  ${formatDependencyLine(dependency)}`)
  ];
}

function makeTauriDriverExperimentalReport(
  dependencies: readonly DependencyStatus[]
): NonNullable<DoctorReport["experimental"]>["tauriDriver"] {
  const tauriDependencies = getTauriDriverDependencyStatuses(dependencies);
  const tauriDriver = tauriDependencies.find((dependency) => dependency.name === "tauri-driver");
  const webKitWebDriver = tauriDependencies.find((dependency) => dependency.name === "WebKitWebDriver");
  const cargo = tauriDependencies.find((dependency) => dependency.name === "cargo");
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!tauriDriver?.found) {
    errors.push("tauri-driver is missing.");
  }
  if (process.platform === "linux" && !webKitWebDriver?.found) {
    errors.push("WebKitWebDriver is missing.");
  }
  if (!cargo?.found) {
    warnings.push("cargo is missing; it is needed to install or update tauri-driver.");
  }
  if (process.platform === "darwin") {
    errors.push("Tauri desktop WebDriver is not supported on macOS.");
  }

  return {
    available: errors.length === 0,
    dependencies: tauriDependencies,
    warnings,
    errors
  };
}

function formatExperimentalTauriDriverSummary(report: DoctorReport): string[] {
  const tauri =
    report.experimental?.tauriDriver ??
    makeTauriDriverExperimentalReport(report.dependencies);
  if (!tauri) {
    return [];
  }
  if (tauri.available) {
    return ["  Tauri WebDriver semantic path: available"];
  }
  return [
    "  Tauri WebDriver semantic path: unavailable",
    ...tauri.errors.map((error) => `    error: ${error}`),
    ...tauri.warnings.map((warning) => `    warning: ${warning}`)
  ];
}

function formatExperimentalElectronDriverSummary(report: DoctorReport): string[] {
  const electron = report.experimental?.electronDriver;
  if (!electron) {
    return [
      "Experimental Electron driver:",
      "  playwright electron API: UNKNOWN",
      "  electron binary: UNKNOWN"
    ];
  }

  return [
    "Experimental Electron driver:",
    `  playwright electron API: ${electron.playwrightAvailable ? "OK" : "MISSING"}`,
    `  electron binary: ${electron.electronBinaryPath ? `OK      ${electron.electronBinaryPath}` : "MISSING/OPTIONAL"}`,
    `  Electron Playwright semantic path: ${electron.available ? "available" : "unavailable"}`,
    ...electron.errors.map((error) => `    error: ${error}`),
    ...electron.warnings.map((warning) => `    warning: ${warning}`)
  ];
}

function formatDependencyLine(dependency: DependencyStatus): string {
  const name = dependency.name.padEnd(9, " ");
  const state = dependency.found ? "OK" : "MISSING";
  const detail = dependency.found
    ? dependency.path ?? "found"
    : `install with: ${dependency.installHint}`;

  return `${name} ${state.padEnd(7, " ")} ${detail}`;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function withLocalElectronBinary(
  status: NonNullable<DoctorReport["experimental"]>["electronDriver"],
  env: NodeJS.ProcessEnv
): Promise<NonNullable<DoctorReport["experimental"]>["electronDriver"]> {
  if (status.electronBinaryPath) {
    return status;
  }

  const candidates = [
    join(repoRootPath(), "node_modules", ".bin", "electron"),
    join(repoRootPath(), "examples", "sample-electron-app", "node_modules", ".bin", "electron")
  ];

  for (const candidate of candidates) {
    const found = await checkBinary(candidate, env);
    if (found.found && found.path) {
      return {
        ...status,
        electronBinaryPath: found.path,
        warnings: status.warnings.filter(
          (warning) => !warning.includes("No electron binary was found")
        )
      };
    }
  }

  return status;
}
