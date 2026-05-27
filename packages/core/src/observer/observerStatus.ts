import { access } from "node:fs/promises";
import { join } from "node:path";
import { findExecutableOnPath } from "../utils/command.js";
import type { LiveObserverStatus, ObserverDependencyPaths } from "./observerTypes.js";

const OBSERVER_INSTALL_HINTS = ["sudo apt install -y x11vnc novnc websockify"] as const;

const DEFAULT_NOVNC_WEB_ROOT_CANDIDATES = [
  "/usr/share/novnc",
  "/usr/share/noVNC",
  "/usr/local/share/novnc",
  "/usr/share/webapps/novnc",
] as const;

export interface LiveObserverStatusOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly noVncWebRootCandidates?: readonly string[];
}
export async function getLiveObserverStatus(
  options: LiveObserverStatusOptions = {},
): Promise<LiveObserverStatus> {
  const env = options.env ?? process.env;
  const paths = await findObserverDependencyPaths(options);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!paths.x11vncPath) {
    errors.push("x11vnc is missing.");
  }

  if (!paths.novncProxyPath && !paths.websockifyPath) {
    errors.push("novnc_proxy or websockify is missing.");
  }

  if (!paths.novncProxyPath && paths.websockifyPath && !paths.noVncWebRootPath) {
    errors.push("noVNC web root was not found.");
  }

  if (paths.novncProxyPath && paths.websockifyPath && !paths.noVncWebRootPath) {
    warnings.push("noVNC web root was not found, but novnc_proxy is available.");
  }

  const explicitWebRoot = env.AGENT_DESKTOP_HARNESS_NOVNC_WEB_ROOT;
  if (explicitWebRoot && !paths.noVncWebRootPath) {
    warnings.push(
      `AGENT_DESKTOP_HARNESS_NOVNC_WEB_ROOT is set but does not contain vnc.html: ${explicitWebRoot}`,
    );
  }

  return {
    available: errors.length === 0,
    x11vncPath: paths.x11vncPath,
    websockifyPath: paths.websockifyPath,
    novncProxyPath: paths.novncProxyPath,
    novncPath: paths.novncProxyPath ?? paths.noVncWebRootPath,
    noVncWebRootPath: paths.noVncWebRootPath,
    warnings,
    errors,
    installHints: OBSERVER_INSTALL_HINTS,
  };
}

export async function findObserverDependencyPaths(
  options: LiveObserverStatusOptions = {},
): Promise<ObserverDependencyPaths> {
  const env = options.env ?? process.env;
  const candidates = [
    env.AGENT_DESKTOP_HARNESS_NOVNC_WEB_ROOT,
    ...(options.noVncWebRootCandidates ?? DEFAULT_NOVNC_WEB_ROOT_CANDIDATES),
  ].filter((candidate): candidate is string => candidate !== undefined && candidate.length > 0);

  return {
    x11vncPath: await findExecutableOnPath("x11vnc", env),
    websockifyPath: await findExecutableOnPath("websockify", env),
    novncProxyPath: await findExecutableOnPath("novnc_proxy", env),
    noVncWebRootPath: await findNoVncWebRoot(candidates),
  };
}

export async function findNoVncWebRoot(candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      await access(join(candidate, "vnc.html"));
      return candidate;
    } catch {
      // Try the next known package layout.
    }
  }

  return undefined;
}
