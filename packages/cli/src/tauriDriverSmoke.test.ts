import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureTauriDriverSmokeReady,
  parseCommandLine,
  parseSmokeTauriDriverArgs
} from "./tauriDriverSmoke.js";
import type { DoctorReport } from "./doctor.js";

test("parseSmokeTauriDriverArgs uses environment-driven Tauri app config", () => {
  const parsed = parseSmokeTauriDriverArgs([], {
    AGENT_DESKTOP_HARNESS_TAURI_COMMAND: "pnpm --filter @app tauri dev",
    AGENT_DESKTOP_HARNESS_TAURI_CWD: "/tmp/tauri-app",
    AGENT_DESKTOP_HARNESS_TAURI_APP_PATH: "/tmp/tauri-app/src-tauri/target/debug/app",
    AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_COMMAND: "pnpm --filter @app dev",
    AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_CWD: "/tmp/tauri-app",
    AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_WAIT_URL: "http://127.0.0.1:1420",
    AGENT_DESKTOP_HARNESS_TAURI_PRELAUNCH_TIMEOUT_MS: "7000",
    AGENT_DESKTOP_HARNESS_TAURI_WINDOW_TITLE: "Demo",
    AGENT_DESKTOP_HARNESS_TAURI_WEBDRIVER_PORT: "4445",
    AGENT_DESKTOP_HARNESS_TAURI_ASSERT_TEXT: "Ready",
    AGENT_DESKTOP_HARNESS_TAURI_TIMEOUT_MS: "12000"
  });

  assert.deepEqual(parsed.command, ["pnpm", "--filter", "@app", "tauri", "dev"]);
  assert.equal(parsed.workspacePath, "/tmp/tauri-app");
  assert.equal(parsed.cwd, "/tmp/tauri-app");
  assert.equal(parsed.applicationPath, "/tmp/tauri-app/src-tauri/target/debug/app");
  assert.deepEqual(parsed.prelaunchCommand, ["pnpm", "--filter", "@app", "dev"]);
  assert.equal(parsed.prelaunchCwd, "/tmp/tauri-app");
  assert.equal(parsed.prelaunchWaitUrl, "http://127.0.0.1:1420");
  assert.equal(parsed.prelaunchTimeoutMs, 7000);
  assert.equal(parsed.windowTitleIncludes, "Demo");
  assert.equal(parsed.webdriverPort, 4445);
  assert.equal(parsed.assertText, "Ready");
  assert.equal(parsed.timeoutMs, 12000);
});

test("parseSmokeTauriDriverArgs lets CLI options override env", () => {
  const parsed = parseSmokeTauriDriverArgs(
    [
      "--cwd",
      "/tmp/override-app",
      "--command",
      "cargo tauri dev",
      "--application",
      "/tmp/override-app/src-tauri/target/debug/app",
      "--prelaunch-command",
      "pnpm dev",
      "--prelaunch-cwd",
      "/tmp/override-app",
      "--prelaunch-wait-url",
      "http://127.0.0.1:1420",
      "--prelaunch-timeout-ms",
      "8000",
      "--window-title",
      "Override",
      "--webdriver-port",
      "4455",
      "--assert-text",
      "Loaded",
      "--timeout-ms",
      "10000"
    ],
    {
      AGENT_DESKTOP_HARNESS_TAURI_COMMAND: "pnpm tauri dev"
    }
  );

  assert.deepEqual(parsed.command, ["cargo", "tauri", "dev"]);
  assert.equal(parsed.cwd, "/tmp/override-app");
  assert.equal(parsed.workspacePath, "/tmp/override-app");
  assert.equal(parsed.applicationPath, "/tmp/override-app/src-tauri/target/debug/app");
  assert.deepEqual(parsed.prelaunchCommand, ["pnpm", "dev"]);
  assert.equal(parsed.prelaunchCwd, "/tmp/override-app");
  assert.equal(parsed.prelaunchWaitUrl, "http://127.0.0.1:1420");
  assert.equal(parsed.prelaunchTimeoutMs, 8000);
  assert.equal(parsed.windowTitleIncludes, "Override");
  assert.equal(parsed.webdriverPort, 4455);
  assert.equal(parsed.assertText, "Loaded");
  assert.equal(parsed.timeoutMs, 10000);
});

test("parseCommandLine handles quotes and rejects malformed input", () => {
  assert.deepEqual(parseCommandLine('pnpm --filter "@scope/app" tauri dev'), [
    "pnpm",
    "--filter",
    "@scope/app",
    "tauri",
    "dev"
  ]);

  assert.throws(() => parseCommandLine("pnpm 'tauri dev"), /unterminated/);
  assert.throws(() => parseCommandLine("   "), /cannot be empty/);
});

test("ensureTauriDriverSmokeReady fails when required desktop dependencies are missing", () => {
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
    () => ensureTauriDriverSmokeReady(report),
    /Missing required dependencies: Xvfb/
  );
});
