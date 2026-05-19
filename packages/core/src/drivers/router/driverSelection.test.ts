import assert from "node:assert/strict";
import test from "node:test";
import { makeDriverRouterStatus, selectDriver } from "./driverSelection.js";
import type { DriverRouterStatus } from "./driverRouterTypes.js";

test("selectDriver chooses browser semantic driver for browser apps", () => {
  const decision = selectDriver(makeStatus(), {
    appKind: "browser"
  });

  assert.equal(decision.selectedDriver, "browser-playwright");
  assert.equal(decision.semantic, true);
  assert.equal(decision.fallbackUsed, false);
});

test("selectDriver chooses Tauri WebDriver when available and fallback when unavailable", () => {
  assert.equal(
    selectDriver(makeStatus({ tauriAvailable: true }), {
      appKind: "tauri"
    }).selectedDriver,
    "tauri-webdriver"
  );

  const fallback = selectDriver(makeStatus({ tauriAvailable: false }), {
    appKind: "tauri"
  });
  assert.equal(fallback.selectedDriver, "x11-fallback");
  assert.equal(fallback.fallbackUsed, true);
  assert.match(fallback.fallbackReason ?? "", /tauri-webdriver is unavailable/);
});

test("selectDriver chooses Electron Playwright when available and fallback when unavailable", () => {
  assert.equal(
    selectDriver(makeStatus({ electronAvailable: true }), {
      appKind: "electron"
    }).selectedDriver,
    "electron-playwright"
  );

  const fallback = selectDriver(makeStatus({ electronAvailable: false }), {
    appKind: "electron"
  });
  assert.equal(fallback.selectedDriver, "x11-fallback");
  assert.equal(fallback.fallbackUsed, true);
});

test("selectDriver fails clearly when semantic is required but unavailable", () => {
  assert.throws(
    () =>
      selectDriver(makeStatus({ tauriAvailable: false }), {
        appKind: "tauri",
        requireSemantic: true
      }),
    /tauri-webdriver is unavailable/
  );
});

test("selectDriver fails when fallback is not allowed", () => {
  assert.throws(
    () =>
      selectDriver(makeStatus({ electronAvailable: false }), {
        appKind: "electron",
        allowFallback: false
      }),
    /electron-playwright is unavailable/
  );
});

test("selectDriver honors preferred drivers", () => {
  const decision = selectDriver(makeStatus(), {
    appKind: "browser",
    preferredDriver: "x11-fallback"
  });

  assert.equal(decision.selectedDriver, "x11-fallback");
  assert.equal(decision.selectionMode, "explicit");
  assert.equal(decision.semantic, false);
});

test("makeDriverRouterStatus maps driver prerequisite status", () => {
  const status = makeDriverRouterStatus({
    tauri: {
      available: false,
      warnings: ["tauri warning"],
      errors: ["tauri missing"]
    },
    electron: {
      available: true,
      playwrightAvailable: true,
      warnings: [],
      errors: []
    }
  });

  assert.equal(status.tauri.available, false);
  assert.equal(status.electron.available, true);
  assert.equal(status.x11Fallback.available, true);
});

function makeStatus(
  options: {
    readonly tauriAvailable?: boolean;
    readonly electronAvailable?: boolean;
  } = {}
): DriverRouterStatus {
  return {
    browser: {
      available: true,
      driver: "browser-playwright",
      warnings: [],
      errors: []
    },
    tauri: {
      available: options.tauriAvailable ?? true,
      driver: "tauri-webdriver",
      experimental: true,
      warnings: [],
      errors: options.tauriAvailable === false ? ["tauri-driver is missing."] : []
    },
    electron: {
      available: options.electronAvailable ?? true,
      driver: "electron-playwright",
      experimental: true,
      warnings: [],
      errors: options.electronAvailable === false ? ["Playwright Electron is missing."] : []
    },
    x11Fallback: {
      available: true,
      driver: "x11-fallback",
      warnings: [],
      errors: []
    }
  };
}
