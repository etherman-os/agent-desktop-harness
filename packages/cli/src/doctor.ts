import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

export type DependencyLevel = "required" | "recommended" | "optional";

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

  return {
    ready,
    status: ready ? "ready" : "not_ready",
    dependencies: statuses
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
    `Status: ${report.status}`
  ];

  return lines.join("\n");
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
