import { resolve } from "node:path";
import type { DesktopSession, HarnessPolicy, LaunchConfig, SessionConfig } from "../types.js";
import { PolicyError } from "../errors.js";
import { isPathInside } from "../utils/fs.js";
import { looksLikeShellCommand } from "../utils/command.js";

export class PolicyValidator {
  validateSessionConfig(config: SessionConfig): void {
    const policy = config.policy;

    if (policy?.allowRealDesktopControl) {
      throw new PolicyError("Real desktop control is not supported in v0.1.");
    }

    const workspaceRoot = policy?.workspaceRoot;
    if (workspaceRoot && !isPathInside(workspaceRoot, config.workspacePath)) {
      throw new PolicyError(
        `Workspace path must be inside policy workspaceRoot: ${workspaceRoot}`
      );
    }
  }

  validateLaunchConfig(session: DesktopSession, launch: LaunchConfig): void {
    const policy = session.config.policy;
    const command = launch.command.trim();

    if (command.length === 0) {
      throw new PolicyError("Launch command cannot be empty.");
    }

    if (looksLikeShellCommand(command)) {
      throw new PolicyError(
        "Launch command must be an executable name or path with arguments passed separately. Shell command strings are not accepted."
      );
    }

    this.validateCommandAllowed(command, policy);
    this.validateCwd(session, launch.cwd);
  }

  private validateCommandAllowed(command: string, policy: HarnessPolicy | undefined): void {
    const allowedCommands = policy?.allowedCommands;

    if (allowedCommands && allowedCommands.length > 0) {
      if (!allowedCommands.includes(command)) {
        throw new PolicyError(
          `Command "${command}" is not in HarnessPolicy.allowedCommands.`
        );
      }
      return;
    }

    if (policy?.allowUnlistedCommandsForLocalDevelopment === true) {
      return;
    }

    throw new PolicyError(
      "No command allowlist was provided. Set HarnessPolicy.allowedCommands or explicitly set allowUnlistedCommandsForLocalDevelopment for local development only."
    );
  }

  private validateCwd(session: DesktopSession, cwd: string | undefined): void {
    const launchCwd = resolve(cwd ?? session.workspacePath);
    if (!isPathInside(session.workspacePath, launchCwd)) {
      throw new PolicyError("Launch cwd must stay inside the session workspace.");
    }
  }
}
