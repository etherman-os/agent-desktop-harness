import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureViteSmokeReady,
  parseSmokeViteHttpArgs,
  parseSmokeViteMcpArgs
} from "./viteSmoke.js";
import type { DoctorReport } from "./doctor.js";

test("parseSmokeViteHttpArgs uses stable local demo defaults", () => {
  const parsed = parseSmokeViteHttpArgs([]);

  assert.equal(parsed.vitePort, 5179);
  assert.equal(parsed.httpPort, 7353);
  assert.equal(parsed.text, "hello from http smoke");
  assert.ok(parsed.workspacePath.length > 0);
});

test("parseSmokeViteMcpArgs uses stable local demo defaults", () => {
  const parsed = parseSmokeViteMcpArgs([]);

  assert.equal(parsed.vitePort, 5179);
  assert.equal(parsed.text, "hello from mcp smoke");
  assert.ok(parsed.workspacePath.length > 0);
});

test("parseSmokeViteHttpArgs validates port values", () => {
  assert.throws(
    () => parseSmokeViteHttpArgs(["--vite-port", "0"]),
    /Invalid port/
  );
  assert.throws(
    () => parseSmokeViteHttpArgs(["--http-port", "70000"]),
    /Invalid port/
  );
});

test("ensureViteSmokeReady fails when required dependencies are missing", () => {
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
    () => ensureViteSmokeReady(report),
    /Missing required dependencies: Xvfb/
  );
});
