import { delimiter, isAbsolute, join } from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess, SpawnOptionsWithoutStdio } from "node:child_process";
import { isExecutable } from "./fs.js";
import { MissingDependencyError, ProcessError } from "../errors.js";

const SENSITIVE_ENV_NAME = /(TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|AUTH|COOKIE)/i;

export type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: SpawnOptionsWithoutStdio
) => Promise<CommandResult>;

export type DependencyChecker = (
  command: string,
  installHint: string
) => Promise<void>;

export async function findExecutableOnPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): Promise<string | undefined> {
  if (command.includes("/") || isAbsolute(command)) {
    const candidate = isAbsolute(command) ? command : join(cwd, command);
    return (await isExecutable(candidate)) ? candidate : undefined;
  }

  const pathValue = env.PATH ?? "";
  for (const pathEntry of pathValue.split(delimiter)) {
    if (pathEntry.length === 0) {
      continue;
    }

    const candidate = join(pathEntry, command);
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export async function assertExecutableOnPath(
  command: string,
  installHint: string
): Promise<void> {
  const executable = await findExecutableOnPath(command);
  if (!executable) {
    throw new MissingDependencyError(command, installHint);
  }
}

export function createSanitizedEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || SENSITIVE_ENV_NAME.test(key)) {
      continue;
    }
    env[key] = value;
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

export async function waitForSpawn(
  child: ChildProcess,
  command: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      child.off("spawn", onSpawn);
      child.off("error", onError);
      child.off("exit", onExit);
    };

    const onSpawn = (): void => {
      cleanup();
      resolve();
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(new ProcessError(`Failed to start command "${command}": ${error.message}`, error));
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanup();
      reject(
        new ProcessError(
          `Command "${command}" exited before it was ready (code=${String(
            code
          )}, signal=${String(signal)}).`
        )
      );
    };

    child.once("spawn", onSpawn);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

export async function runCommand(
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio = {}
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", (error) => {
      reject(new ProcessError(`Failed to run command "${command}": ${error.message}`, error));
    });

    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new ProcessError(
          `Command "${command}" failed (code=${String(code)}, signal=${String(
            signal
          )}): ${stderr.trim()}`
        )
      );
    });
  });
}

export function looksLikeShellCommand(command: string): boolean {
  return !command.includes("/") && /\s/.test(command.trim());
}
