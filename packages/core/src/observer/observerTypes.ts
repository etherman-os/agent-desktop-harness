import type { ChildProcess } from "node:child_process";
import type { SessionId } from "../types.js";

export interface LiveObserverStatus {
  readonly available: boolean;
  readonly x11vncPath?: string;
  readonly websockifyPath?: string;
  readonly novncProxyPath?: string;
  readonly novncPath?: string;
  readonly noVncWebRootPath?: string;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly installHints: readonly string[];
}
export interface StartLiveObserverOptions {
  readonly sessionId?: SessionId;
  readonly host?: string;
  readonly vncPort?: number;
  readonly webPort?: number;
  readonly viewOnly?: boolean;
  readonly password?: string;
  readonly label?: string;
}

export interface LiveObserverRef {
  readonly sessionId: SessionId;
  readonly observerId: string;
  readonly host: string;
  readonly vncPort: number;
  readonly webPort: number;
  readonly viewOnly: boolean;
  readonly url: string;
  readonly createdAt: string;
  readonly warnings: readonly string[];
}

export interface StopLiveObserverResult {
  readonly sessionId: SessionId;
  readonly observerId: string;
  readonly stopped: boolean;
}

export interface ManagedLiveObserver extends LiveObserverRef {
  readonly x11vncProcess: ChildProcess;
  readonly proxyProcess: ChildProcess;
  readonly passwordFilePath?: string;
  readonly x11vncCommand: readonly string[];
  readonly proxyCommand: readonly string[];
}

export interface ObserverDependencyPaths {
  readonly x11vncPath?: string;
  readonly websockifyPath?: string;
  readonly novncProxyPath?: string;
  readonly noVncWebRootPath?: string;
}
