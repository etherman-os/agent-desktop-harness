import assert from "node:assert/strict";
import type { SpawnOptionsWithoutStdio } from "node:child_process";
import test from "node:test";
import type { DesktopSession } from "../types.js";
import {
  makeTypeTextDetails,
  normalizeHotkeyKeys,
  scrollDirectionToButton,
  XdotoolInputBackend,
} from "./XdotoolInputBackend.js";

const session: DesktopSession = {
  id: "session-input-test",
  config: {
    workspacePath: "/tmp/session-input-test",
  },
  driverKind: "unknown",
  status: "running",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  workspacePath: "/tmp/session-input-test",
  evidencePath: "/tmp/session-input-test/.desktop-harness/sessions/session-input-test",
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

test("normalizeHotkeyKeys maps common aliases", () => {
  assert.deepEqual(normalizeHotkeyKeys(["control", "shift", "r"]), ["ctrl", "shift", "r"]);
  assert.deepEqual(normalizeHotkeyKeys(["Escape"]), ["Escape"]);
  assert.deepEqual(normalizeHotkeyKeys(["alt", "Tab"]), ["alt", "Tab"]);
});

test("scrollDirectionToButton maps wheel buttons", () => {
  assert.equal(scrollDirectionToButton("up"), "4");
  assert.equal(scrollDirectionToButton("down"), "5");
  assert.equal(scrollDirectionToButton("left"), "6");
  assert.equal(scrollDirectionToButton("right"), "7");
});

test("typeText uses argument passing and targets the session display", async () => {
  const calls: {
    command: string;
    args: readonly string[];
    options?: SpawnOptionsWithoutStdio;
  }[] = [];
  const backend = new XdotoolInputBackend({
    dependencyChecker: async () => undefined,
    commandRunner: async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: "", stderr: "" };
    },
  });

  await backend.typeText(session, {
    text: "hello && rm -rf /",
    label: "safe-args",
  });

  assert.equal(calls[0]?.command, "xdotool");
  assert.deepEqual(calls[0]?.args, ["type", "--delay", "0", "--", "hello && rm -rf /"]);
  assert.equal(calls[0]?.options?.env?.DISPLAY, ":90");
});

test("makeTypeTextDetails redacts secret text", () => {
  const details = makeTypeTextDetails({
    text: "secret-value",
    secret: true,
    label: "password",
  });

  assert.equal(details.redacted, true);
  assert.equal(details.textLength, 12);
  assert.equal("text" in details, false);
});
