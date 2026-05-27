import assert from "node:assert/strict";
import test from "node:test";
import { getElectronDriverStatus } from "./electronStatus.js";

test("getElectronDriverStatus reports Playwright Electron availability and optional binary", async () => {
  const status = await getElectronDriverStatus({
    env: { PATH: "" },
    findExecutable: async () => undefined,
  });

  assert.equal(status.playwrightAvailable, true);
  assert.equal(status.available, true);
  assert.equal(status.electronBinaryPath, undefined);
  assert.match(status.warnings.join("\n"), /No electron binary/);
});

test("getElectronDriverStatus reports an Electron binary when found", async () => {
  const status = await getElectronDriverStatus({
    env: { PATH: "/tmp" },
    findExecutable: async (command) =>
      command === "electron" ? "/tmp/node_modules/.bin/electron" : undefined,
  });

  assert.equal(status.available, true);
  assert.equal(status.electronBinaryPath, "/tmp/node_modules/.bin/electron");
  assert.deepEqual(status.errors, []);
});
