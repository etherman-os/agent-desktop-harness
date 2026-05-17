import test from "node:test";
import assert from "node:assert/strict";
import {
  clickBodySchema,
  createAnnotationBodySchema,
  createSessionBodySchema,
  focusWindowBodySchema,
  hotkeyBodySchema,
  launchBodySchema,
  scrollBodySchema
} from "./schemas.js";

test("createSessionBodySchema rejects invalid dimensions", () => {
  assert.throws(() => {
    createSessionBodySchema.parse({
      width: 0
    });
  }, /Too small/);
});

test("launchBodySchema requires a non-empty command", () => {
  assert.throws(() => {
    launchBodySchema.parse({
      command: "",
      args: ["run", "dev"]
    });
  });
});

test("clickBodySchema requires finite coordinates", () => {
  assert.throws(() => {
    clickBodySchema.parse({
      x: Number.NaN,
      y: 100
    });
  });
});

test("hotkeyBodySchema requires a non-empty key list", () => {
  assert.throws(() => {
    hotkeyBodySchema.parse({
      keys: []
    });
  }, /Too small/);
});

test("scrollBodySchema restricts direction", () => {
  assert.throws(() => {
    scrollBodySchema.parse({
      direction: "forward"
    });
  });
});

test("focusWindowBodySchema requires at least one selector", () => {
  assert.throws(() => {
    focusWindowBodySchema.parse({});
  }, /focusWindow requires/);
});

test("createAnnotationBodySchema rejects traversal and invalid rectangles", () => {
  assert.throws(() => {
    createAnnotationBodySchema.parse({
      screenshotFileName: "../0001-demo.png",
      type: "rectangle",
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      note: "bad path"
    });
  }, /file name/);

  assert.throws(() => {
    createAnnotationBodySchema.parse({
      screenshotFileName: "0001-demo.png",
      type: "rectangle",
      x: 1,
      y: 2,
      width: 0,
      height: 4,
      note: "bad rectangle"
    });
  }, /rectangle annotations/);
});
