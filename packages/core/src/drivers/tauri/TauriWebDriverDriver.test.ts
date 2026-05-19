import assert from "node:assert/strict";
import test from "node:test";
import { reserveWebDriverPort } from "./TauriWebDriverDriver.js";

test("reserveWebDriverPort returns a usable ephemeral port", async () => {
  const port = await reserveWebDriverPort();

  assert.equal(Number.isInteger(port), true);
  assert.equal(port > 0, true);
});

test("reserveWebDriverPort validates explicit ports", async () => {
  await assert.rejects(async () => await reserveWebDriverPort(0), /Invalid WebDriver port/);
  await assert.rejects(async () => await reserveWebDriverPort(70000), /Invalid WebDriver port/);
});
