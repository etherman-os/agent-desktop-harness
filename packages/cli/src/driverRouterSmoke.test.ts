import assert from "node:assert/strict";
import test from "node:test";
import type { DoctorReport } from "./doctor.js";
import { ensureDriverRouterSmokeReady, parseSmokeDriverRouterArgs } from "./driverRouterSmoke.js";

test("parseSmokeDriverRouterArgs uses stable local demo defaults", () => {
  const parsed = parseSmokeDriverRouterArgs([]);

  assert.equal(parsed.vitePort, 5182);
  assert.equal(parsed.httpPort, 7356);
  assert.equal(parsed.text, "hello from driver router");
  assert.ok(parsed.workspacePath.length > 0);
});

test("parseSmokeDriverRouterArgs accepts explicit ports and text", () => {
  const parsed = parseSmokeDriverRouterArgs([
    "--workspace",
    "/tmp/driver-router-smoke",
    "--vite-port",
    "5192",
    "--http-port",
    "7366",
    "--text",
    "router smoke message",
  ]);

  assert.equal(parsed.workspacePath, "/tmp/driver-router-smoke");
  assert.equal(parsed.vitePort, 5192);
  assert.equal(parsed.httpPort, 7366);
  assert.equal(parsed.text, "router smoke message");
});

test("parseSmokeDriverRouterArgs validates port values", () => {
  assert.throws(() => parseSmokeDriverRouterArgs(["--vite-port", "0"]), /Invalid port/);
  assert.throws(() => parseSmokeDriverRouterArgs(["--http-port", "70000"]), /Invalid port/);
});

test("ensureDriverRouterSmokeReady fails when required dependencies are missing", () => {
  const report: DoctorReport = {
    ready: false,
    status: "not_ready",
    dependencies: [
      {
        name: "Xvfb",
        level: "required",
        installHint: "sudo apt install -y xvfb",
        found: false,
      },
    ],
  };

  assert.throws(() => ensureDriverRouterSmokeReady(report), /Missing required dependencies: Xvfb/);
});
