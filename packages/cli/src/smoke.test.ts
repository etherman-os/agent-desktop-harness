import assert from "node:assert/strict";
import test from "node:test";
import { ensureSmokeReady, parseSmokeX11Args } from "./smoke.js";
import type { DoctorReport } from "./doctor.js";

test("parseSmokeX11Args uses the xterm smoke defaults", () => {
  const parsed = parseSmokeX11Args([]);

  assert.equal(parsed.command, "xterm");
  assert.equal(parsed.text, "agent-desktop-harness smoke");
  assert.deepEqual(parsed.args, []);
});

test("ensureSmokeReady fails clearly when required dependencies are missing", () => {
  const report: DoctorReport = {
    ready: false,
    status: "not_ready",
    dependencies: [
      {
        name: "Xvfb",
        level: "required",
        installHint: "sudo apt install -y xvfb",
        found: false
      }
    ]
  };

  assert.throws(
    () => ensureSmokeReady(report, "xterm"),
    /Missing required dependencies: Xvfb/
  );
});

test("ensureSmokeReady requires xterm for the default smoke demo", () => {
  const report: DoctorReport = {
    ready: true,
    status: "ready",
    dependencies: [
      {
        name: "xterm",
        level: "optional",
        installHint: "sudo apt install -y xterm",
        found: false
      }
    ]
  };

  assert.throws(
    () => ensureSmokeReady(report, "xterm"),
    /Missing optional smoke dependency/
  );
});

test("ensureSmokeReady allows a custom command without xterm", () => {
  const report: DoctorReport = {
    ready: true,
    status: "ready",
    dependencies: [
      {
        name: "xterm",
        level: "optional",
        installHint: "sudo apt install -y xterm",
        found: false
      }
    ]
  };

  assert.doesNotThrow(() => ensureSmokeReady(report, "custom-gui"));
});
