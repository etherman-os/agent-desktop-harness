import type { HarnessPolicy, SessionConfig } from "../types.js";

export interface CommandAllowlistEntry {
  readonly command: string;
  readonly args?: readonly string[];
  readonly description?: string;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

export interface PolicyEvaluator {
  evaluateSessionStart(
    config: SessionConfig,
    policy: HarnessPolicy
  ): Promise<PolicyDecision>;
}
