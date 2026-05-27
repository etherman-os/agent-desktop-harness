import assert from "node:assert/strict";
import test from "node:test";
import { browserLaunchArgs, inferBrowserName } from "./PlaywrightBrowserDriver.js";

test("inferBrowserName maps common browser executable names", () => {
  assert.equal(inferBrowserName("/usr/bin/google-chrome"), "chrome");
  assert.equal(inferBrowserName("/usr/bin/google-chrome-stable"), "chrome");
  assert.equal(inferBrowserName("/usr/bin/chromium"), "chromium");
  assert.equal(inferBrowserName("/usr/bin/firefox"), "firefox");
});

test("browserLaunchArgs uses chromium-safe defaults without forcing downloads", () => {
  assert.deepEqual(browserLaunchArgs("firefox"), []);
  assert.equal(browserLaunchArgs("chromium").includes("--no-sandbox"), true);
  assert.equal(browserLaunchArgs("chrome").includes("--disable-dev-shm-usage"), true);
});
