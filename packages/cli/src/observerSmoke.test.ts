import test from "node:test";
import assert from "node:assert/strict";
import { parseSmokeObserverArgs, runSmokeObserver } from "./observerSmoke.js";
import type { DoctorReport } from "./doctor.js";

test("parseSmokeObserverArgs accepts optional ports", () => {
  const parsed = parseSmokeObserverArgs([
    "--workspace",
    "/tmp/work",
    "--vnc-port",
    "5901",
    "--web-port",
    "6081"
  ]);

  assert.equal(parsed.workspacePath, "/tmp/work");
  assert.equal(parsed.vncPort, 5901);
  assert.equal(parsed.webPort, 6081);
});

test("runSmokeObserver skips clearly when observer dependencies are missing", async () => {
  const result = await runSmokeObserver([], {
    doctorReport: readyDoctorReport(),
    manager: {
      getLiveObserverStatus: async () => ({
        available: false,
        warnings: [],
        errors: ["x11vnc is missing."],
        installHints: ["sudo apt install -y x11vnc novnc websockify"]
      })
    } as never
  });

  assert.equal(result.skipped, true);
  assert.match(result.skipReason ?? "", /x11vnc is missing/);
  assert.equal(result.cleanupSucceeded, true);
});

function readyDoctorReport(): DoctorReport {
  return {
    ready: true,
    status: "ready",
    dependencies: []
  };
}
