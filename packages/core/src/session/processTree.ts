import type { ChildProcess } from "node:child_process";

export interface TerminateOptions {
  readonly signal?: NodeJS.Signals;
  readonly killSignal?: NodeJS.Signals;
  readonly timeoutMs?: number;
}

export async function terminateProcessTree(
  child: ChildProcess | undefined,
  options: TerminateOptions = {}
): Promise<void> {
  if (!child || child.pid === undefined || hasExited(child)) {
    return;
  }

  const signal = options.signal ?? "SIGTERM";
  const killSignal = options.killSignal ?? "SIGKILL";
  const timeoutMs = options.timeoutMs ?? 3000;

  signalProcessGroup(child.pid, signal);

  if (await waitForExit(child, timeoutMs)) {
    return;
  }

  signalProcessGroup(child.pid, killSignal);
  await waitForExit(child, timeoutMs);
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!isNoSuchProcessError(error)) {
      try {
        process.kill(pid, signal);
      } catch (fallbackError) {
        if (!isNoSuchProcessError(fallbackError)) {
          throw fallbackError;
        }
      }
    }
  }
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasExited(child)) {
    return true;
  }

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onExit = (): void => {
      cleanup();
      resolve(true);
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      child.off("exit", onExit);
    };

    child.once("exit", onExit);
  });
}

function isNoSuchProcessError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ESRCH"
  );
}
