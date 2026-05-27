import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBrowserTarget,
  hasBrowserTarget,
  makeBrowserFillDetails,
  resolveBrowserTarget,
} from "./browserSelectors.js";

test("resolveBrowserTarget follows selector priority", () => {
  assert.deepEqual(
    resolveBrowserTarget({
      selector: "#save",
      role: "button",
      name: "Save message",
    }),
    {
      kind: "selector",
      value: "#save",
    },
  );

  assert.deepEqual(
    resolveBrowserTarget({
      role: "button",
      name: "Save message",
      text: "Save message",
    }),
    {
      kind: "role",
      value: "button",
      name: "Save message",
    },
  );
});

test("resolveBrowserTarget rejects missing targets", () => {
  assert.equal(hasBrowserTarget({}), false);
  assert.throws(() => resolveBrowserTarget({}), /Browser action requires/);
});

test("formatBrowserTarget supports label and placeholder targets", () => {
  assert.deepEqual(formatBrowserTarget({ label: "Message" }), {
    kind: "label",
    value: "Message",
    name: undefined,
  });
  assert.deepEqual(formatBrowserTarget({ placeholder: "Type a message" }), {
    kind: "placeholder",
    value: "Type a message",
    name: undefined,
  });
});

test("makeBrowserFillDetails redacts secret values", () => {
  const details = makeBrowserFillDetails({
    placeholder: "Type a message",
    value: "super-secret",
    secret: true,
  });

  assert.equal(details.redacted, true);
  assert.equal(details.valueLength, 12);
  assert.equal("value" in details, true);
  assert.equal(details.value, undefined);
  assert.equal(JSON.stringify(details).includes("super-secret"), false);
});
