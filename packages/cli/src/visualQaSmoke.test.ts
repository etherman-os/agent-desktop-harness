import assert from "node:assert/strict";
import test from "node:test";
import type { DoctorReport } from "./doctor.js";
import {
  ensureVisualQaSmokeReady,
  parseSmokeVisualBaselineArgs,
  parseSmokeVisualQaArgs,
} from "./visualQaSmoke.js";

test("parseSmokeVisualQaArgs uses stable local demo defaults", () => {
  const parsed = parseSmokeVisualQaArgs([]);

  assert.equal(parsed.vitePort, 5183);
  assert.equal(parsed.httpPort, 7357);
  assert.equal(parsed.text, "hello from visual qa smoke");
  assert.ok(parsed.workspacePath.length > 0);
});

test("parseSmokeVisualQaArgs accepts explicit ports and text", () => {
  const parsed = parseSmokeVisualQaArgs([
    "--workspace",
    "/tmp/visual-qa-smoke",
    "--vite-port",
    "5193",
    "--http-port",
    "7367",
    "--text",
    "visual qa message",
  ]);

  assert.equal(parsed.workspacePath, "/tmp/visual-qa-smoke");
  assert.equal(parsed.vitePort, 5193);
  assert.equal(parsed.httpPort, 7367);
  assert.equal(parsed.text, "visual qa message");
});

test("parseSmokeVisualQaArgs validates port values", () => {
  assert.throws(() => parseSmokeVisualQaArgs(["--vite-port", "0"]), /Invalid port/);
  assert.throws(() => parseSmokeVisualQaArgs(["--http-port", "70000"]), /Invalid port/);
});

test("parseSmokeVisualBaselineArgs uses stable local baseline defaults", () => {
  const parsed = parseSmokeVisualBaselineArgs([]);

  assert.equal(parsed.vitePort, 5184);
  assert.equal(parsed.httpPort, 7358);
  assert.equal(parsed.text, "hello from visual baseline smoke");
  assert.equal(parsed.baselineName, "sample-vite-clean");
  assert.equal(parsed.baselineSuite, "smoke");
  assert.ok(parsed.workspacePath.length > 0);
});

test("parseSmokeVisualBaselineArgs accepts explicit baseline options", () => {
  const parsed = parseSmokeVisualBaselineArgs([
    "--workspace",
    "/tmp/visual-baseline-smoke",
    "--vite-port",
    "5194",
    "--http-port",
    "7368",
    "--text",
    "visual baseline message",
    "--baseline-name",
    "clean-state",
    "--suite",
    "regression",
  ]);

  assert.equal(parsed.workspacePath, "/tmp/visual-baseline-smoke");
  assert.equal(parsed.vitePort, 5194);
  assert.equal(parsed.httpPort, 7368);
  assert.equal(parsed.text, "visual baseline message");
  assert.equal(parsed.baselineName, "clean-state");
  assert.equal(parsed.baselineSuite, "regression");
});

test("parseSmokeVisualBaselineArgs validates port values", () => {
  assert.throws(() => parseSmokeVisualBaselineArgs(["--vite-port", "0"]), /Invalid port/);
  assert.throws(() => parseSmokeVisualBaselineArgs(["--http-port", "70000"]), /Invalid port/);
});

test("ensureVisualQaSmokeReady fails when required dependencies are missing", () => {
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

  assert.throws(() => ensureVisualQaSmokeReady(report), /Missing required dependencies: Xvfb/);
});
