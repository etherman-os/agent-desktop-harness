import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureElectronDriverSmokeReady,
  parseSmokeElectronDriverArgs,
  resolveSmokeElectronDriverConfig
} from "./electronDriverSmoke.js";
import type { DoctorReport } from "./doctor.js";

test("parseSmokeElectronDriverArgs uses environment-driven Electron app config", () => {
  const parsed = parseSmokeElectronDriverArgs([], {
    AGENT_DESKTOP_HARNESS_ELECTRON_COMMAND: "electron .",
    AGENT_DESKTOP_HARNESS_ELECTRON_ARGS: "--inspect=0",
    AGENT_DESKTOP_HARNESS_ELECTRON_CWD: "/tmp/electron-app",
    AGENT_DESKTOP_HARNESS_ELECTRON_EXECUTABLE_PATH: "/tmp/electron",
    AGENT_DESKTOP_HARNESS_ELECTRON_APP_PATH: "/tmp/electron-app/main.js",
    AGENT_DESKTOP_HARNESS_ELECTRON_WINDOW_TITLE: "Demo",
    AGENT_DESKTOP_HARNESS_ELECTRON_TEXT: "hello electron",
    AGENT_DESKTOP_HARNESS_ELECTRON_TIMEOUT_MS: "12000"
  });

  assert.equal(parsed.command, "electron");
  assert.deepEqual(parsed.args, [".", "--inspect=0"]);
  assert.equal(parsed.workspacePath, "/tmp/electron-app");
  assert.equal(parsed.cwd, "/tmp/electron-app");
  assert.equal(parsed.executablePath, "/tmp/electron");
  assert.equal(parsed.appPath, "/tmp/electron-app/main.js");
  assert.equal(parsed.windowTitleIncludes, "Demo");
  assert.equal(parsed.text, "hello electron");
  assert.equal(parsed.timeoutMs, 12000);
});

test("parseSmokeElectronDriverArgs lets CLI options override env", () => {
  const parsed = parseSmokeElectronDriverArgs(
    [
      "--cwd",
      "/tmp/override-electron",
      "--command",
      "electron .",
      "--args",
      "--inspect=0",
      "--executable-path",
      "/tmp/override-electron-bin",
      "--app-path",
      "/tmp/override-electron/main.js",
      "--window-title",
      "Override",
      "--text",
      "override message",
      "--timeout-ms",
      "10000"
    ],
    {
      AGENT_DESKTOP_HARNESS_ELECTRON_COMMAND: "electron old.js"
    }
  );

  assert.equal(parsed.command, "electron");
  assert.deepEqual(parsed.args, ["--inspect=0"]);
  assert.equal(parsed.cwd, "/tmp/override-electron");
  assert.equal(parsed.workspacePath, "/tmp/override-electron");
  assert.equal(parsed.executablePath, "/tmp/override-electron-bin");
  assert.equal(parsed.appPath, "/tmp/override-electron/main.js");
  assert.equal(parsed.windowTitleIncludes, "Override");
  assert.equal(parsed.text, "override message");
  assert.equal(parsed.timeoutMs, 10000);
});

test("resolveSmokeElectronDriverConfig uses sample app when no env app is configured", async () => {
  const parsed = await resolveSmokeElectronDriverConfig(
    parseSmokeElectronDriverArgs([], {}),
    process.execPath
  );

  assert.equal(parsed.command, process.execPath);
  assert.deepEqual(parsed.args, ["."]);
  assert.match(parsed.cwd ?? "", /examples\/sample-electron-app$/);
  assert.equal(parsed.windowTitleIncludes, "Agent Desktop Harness Electron Demo");
});

test("resolveSmokeElectronDriverConfig preserves explicit app config", async () => {
  const parsed = await resolveSmokeElectronDriverConfig(
    parseSmokeElectronDriverArgs(["--command", "electron ."], {}),
    process.execPath
  );

  assert.equal(parsed.command, "electron");
  assert.deepEqual(parsed.args, ["."]);
});

test("ensureElectronDriverSmokeReady fails when required desktop dependencies are missing", () => {
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
    () => ensureElectronDriverSmokeReady(report),
    /Missing required dependencies: Xvfb/
  );
});
