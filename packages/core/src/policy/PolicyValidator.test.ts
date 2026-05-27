import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PolicyError } from "../errors.js";
import type { DesktopSession } from "../types.js";
import { PolicyValidator } from "./PolicyValidator.js";

const workspacePath = resolve("/tmp/agent-desktop-harness-policy-test");

function makeSession(policy: DesktopSession["config"]["policy"]): DesktopSession {
  return {
    id: "session-test",
    config: {
      workspacePath,
      policy,
    },
    driverKind: "unknown",
    status: "running",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    workspacePath,
    evidencePath: resolve(workspacePath, ".desktop-harness/sessions/session-test"),
    display: ":90",
    displayNumber: 90,
    width: 1440,
    height: 900,
    depth: 24,
    processIds: {
      apps: [],
    },
    warnings: [],
  };
}

test("PolicyValidator allows allowlisted launch commands", () => {
  const validator = new PolicyValidator();
  const session = makeSession({ allowedCommands: ["pnpm"] });

  assert.doesNotThrow(() => {
    validator.validateLaunchConfig(session, {
      command: "pnpm",
      args: ["dev"],
      cwd: workspacePath,
    });
  });
});

test("PolicyValidator rejects unlisted commands without local development opt-in", () => {
  const validator = new PolicyValidator();
  const session = makeSession({});

  assert.throws(() => {
    validator.validateLaunchConfig(session, {
      command: "pnpm",
      args: ["dev"],
      cwd: workspacePath,
    });
  }, PolicyError);
});

test("PolicyValidator rejects shell command strings", () => {
  const validator = new PolicyValidator();
  const session = makeSession({
    allowUnlistedCommandsForLocalDevelopment: true,
  });

  assert.throws(() => {
    validator.validateLaunchConfig(session, {
      command: "pnpm dev",
      args: [],
      cwd: workspacePath,
    });
  }, /Shell command strings are not accepted/);
});

test("PolicyValidator rejects cwd outside the session workspace", () => {
  const validator = new PolicyValidator();
  const session = makeSession({ allowedCommands: ["pnpm"] });

  assert.throws(() => {
    validator.validateLaunchConfig(session, {
      command: "pnpm",
      args: ["dev"],
      cwd: resolve("/tmp"),
    });
  }, /cwd must stay inside/);
});
