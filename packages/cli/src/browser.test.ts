import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrowserLaunchConfig,
  detectGuiBrowser,
  formatMissingGuiBrowserMessage
} from "./browser.js";
import type { BinaryChecker } from "./browser.js";

test("detectGuiBrowser uses the first available browser by priority", async () => {
  const check: BinaryChecker = async (name) => ({
    found: name === "google-chrome-stable",
    path: name === "google-chrome-stable" ? "/usr/bin/google-chrome-stable" : undefined
  });

  const browser = await detectGuiBrowser({ check, env: {} });

  assert.equal(browser?.command, "google-chrome-stable");
  assert.equal(browser?.kind, "chromium");
  assert.equal(browser?.path, "/usr/bin/google-chrome-stable");
});

test("detectGuiBrowser honors AGENT_DESKTOP_HARNESS_BROWSER", async () => {
  const check: BinaryChecker = async (name) => ({
    found: name === "/usr/bin/firefox",
    path: name === "/usr/bin/firefox" ? "/usr/bin/firefox" : undefined
  });

  const browser = await detectGuiBrowser({
    check,
    env: {
      AGENT_DESKTOP_HARNESS_BROWSER: "/usr/bin/firefox"
    }
  });

  assert.equal(browser?.command, "/usr/bin/firefox");
  assert.equal(browser?.kind, "firefox");
  assert.equal(browser?.source, "env");
});

test("detectGuiBrowser fails clearly for an invalid override", async () => {
  const check: BinaryChecker = async () => ({ found: false });

  await assert.rejects(
    async () =>
      await detectGuiBrowser({
        check,
        env: {
          AGENT_DESKTOP_HARNESS_BROWSER: "/missing/browser"
        }
      }),
    /AGENT_DESKTOP_HARNESS_BROWSER is set but is not executable/
  );
});

test("buildBrowserLaunchConfig creates chromium-safe args", () => {
  const launch = buildBrowserLaunchConfig(
    {
      command: "chromium",
      path: "/usr/bin/chromium",
      kind: "chromium",
      source: "path"
    },
    "/tmp/profile",
    "http://127.0.0.1:5179"
  );

  assert.equal(launch.command, "chromium");
  assert.ok(launch.args.includes("--no-sandbox"));
  assert.ok(launch.args.includes("--disable-dev-shm-usage"));
  assert.ok(launch.args.includes("--user-data-dir=/tmp/profile"));
  assert.equal(launch.args.at(-1), "http://127.0.0.1:5179");
});

test("buildBrowserLaunchConfig creates firefox profile args", () => {
  const launch = buildBrowserLaunchConfig(
    {
      command: "firefox",
      path: "/usr/bin/firefox",
      kind: "firefox",
      source: "path"
    },
    "/tmp/profile",
    "http://127.0.0.1:5179"
  );

  assert.equal(launch.command, "firefox");
  assert.deepEqual(launch.args.slice(0, 4), [
    "--profile",
    "/tmp/profile",
    "--new-instance",
    "--width"
  ]);
  assert.equal(launch.args.at(-1), "http://127.0.0.1:5179");
});

test("formatMissingGuiBrowserMessage includes install hints and override", () => {
  const message = formatMissingGuiBrowserMessage();

  assert.match(message, /Missing GUI browser/);
  assert.match(message, /sudo apt install -y chromium/);
  assert.match(message, /AGENT_DESKTOP_HARNESS_BROWSER/);
});
