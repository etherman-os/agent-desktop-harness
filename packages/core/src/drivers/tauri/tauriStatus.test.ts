import assert from "node:assert/strict";
import test from "node:test";
import { getTauriDriverStatus } from "./tauriStatus.js";

test("getTauriDriverStatus reports missing Linux WebDriver prerequisites", async () => {
  const status = await getTauriDriverStatus({
    platform: "linux",
    findExecutable: async () => undefined,
  });

  assert.equal(status.available, false);
  assert.equal(status.tauriDriverPath, undefined);
  assert.equal(status.webKitWebDriverPath, undefined);
  assert.match(status.errors.join("\n"), /tauri-driver is missing/);
  assert.match(status.errors.join("\n"), /WebKitWebDriver is missing/);
});

test("getTauriDriverStatus reports available Linux prerequisites", async () => {
  const status = await getTauriDriverStatus({
    platform: "linux",
    findExecutable: async (command) => `/usr/bin/${command}`,
  });

  assert.equal(status.available, true);
  assert.equal(status.tauriDriverPath, "/usr/bin/tauri-driver");
  assert.equal(status.webKitWebDriverPath, "/usr/bin/WebKitWebDriver");
  assert.equal(status.cargoPath, "/usr/bin/cargo");
  assert.deepEqual(status.errors, []);
});

test("getTauriDriverStatus does not overclaim macOS support", async () => {
  const status = await getTauriDriverStatus({
    platform: "darwin",
    findExecutable: async (command) => `/usr/bin/${command}`,
  });

  assert.equal(status.available, false);
  assert.match(status.errors.join("\n"), /not supported on macOS/);
});
