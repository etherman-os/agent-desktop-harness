import type { ChildProcess, SpawnOptionsWithoutStdio } from "node:child_process";
import { spawn } from "node:child_process";

export interface ProcessOutput {
  readonly stdout: string;
  readonly stderr: string;
}

export async function runProcess(
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio = {},
): Promise<ProcessOutput> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
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

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          [
            `Command failed: ${command} ${args.join(" ")}`,
            `Exit: code=${String(code)}, signal=${String(signal)}`,
            stderr.trim() ? `stderr:\n${stderr.trim()}` : undefined,
            stdout.trim() ? `stdout:\n${stdout.trim()}` : undefined,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}

export async function stopChildProcess(
  child: ChildProcess,
  name: string,
  timeoutMs = 3000,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.killed) {
    return;
  }

  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
  });

  child.kill("SIGTERM");

  const stopped = await Promise.race([exited.then(() => true), delay(timeoutMs).then(() => false)]);

  if (stopped) {
    return;
  }

  child.kill("SIGKILL");
  await Promise.race([
    exited,
    delay(1000).then(() => {
      throw new Error(`${name} did not exit after SIGKILL.`);
    }),
  ]);
}

export function collectChildOutput(child: ChildProcess): ProcessOutput {
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

  return {
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
