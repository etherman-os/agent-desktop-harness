import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureBrowserSemanticSmokeReady,
  parseSmokeBrowserSemanticArgs
} from "./browserSemanticSmoke.js";
import type { DoctorReport } from "./doctor.js";

test("parseSmokeBrowserSemanticArgs uses stable local demo defaults", () => {
  const parsed = parseSmokeBrowserSemanticArgs([]);

  assert.equal(parsed.vitePort, 5181);
  assert.equal(parsed.httpPort, 7355);
  assert.equal(parsed.text, "hello from semantic browser driver");
  assert.ok(parsed.workspacePath.length > 0);
});

test("parseSmokeBrowserSemanticArgs accepts explicit ports and text", () => {
  const parsed = parseSmokeBrowserSemanticArgs([
    "--workspace",
    "/tmp/browser-semantic-smoke",
    "--vite-port",
    "5191",
    "--http-port",
    "7365",
    "--text",
    "semantic smoke message"
  ]);

  assert.equal(parsed.workspacePath, "/tmp/browser-semantic-smoke");
  assert.equal(parsed.vitePort, 5191);
  assert.equal(parsed.httpPort, 7365);
  assert.equal(parsed.text, "semantic smoke message");
});

test("parseSmokeBrowserSemanticArgs validates port values", () => {
  assert.throws(
    () => parseSmokeBrowserSemanticArgs(["--vite-port", "0"]),
    /Invalid port/
  );
  assert.throws(
    () => parseSmokeBrowserSemanticArgs(["--http-port", "70000"]),
    /Invalid port/
  );
});

test("ensureBrowserSemanticSmokeReady fails when required dependencies are missing", () => {
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
    () => ensureBrowserSemanticSmokeReady(report),
    /Missing required dependencies: Xvfb/
  );
});
