import test from "node:test";
import assert from "node:assert/strict";
import {
  clickSchema,
  createAnnotationSchema,
  focusWindowSchema,
  hotkeySchema,
  launchAppSchema,
  scrollSchema,
  startSessionSchema
} from "./schemas.js";

test("startSessionSchema rejects invalid display dimensions", () => {
  assert.throws(() => {
    startSessionSchema.parse({
      width: 0
    });
  }, /Too small/);
});

test("launchAppSchema requires command and string args", () => {
  assert.throws(() => {
    launchAppSchema.parse({
      sessionId: "session-1",
      command: "",
      args: ["run", 1]
    });
  });
});

test("clickSchema requires finite coordinates", () => {
  assert.throws(() => {
    clickSchema.parse({
      sessionId: "session-1",
      x: Number.POSITIVE_INFINITY,
      y: 10
    });
  });
});

test("hotkeySchema requires at least one key", () => {
  assert.throws(() => {
    hotkeySchema.parse({
      sessionId: "session-1",
      keys: []
    });
  }, /Too small/);
});

test("scrollSchema restricts direction", () => {
  assert.throws(() => {
    scrollSchema.parse({
      sessionId: "session-1",
      direction: "forward"
    });
  });
});

test("focusWindowSchema requires at least one target field", () => {
  assert.throws(() => {
    focusWindowSchema.parse({
      sessionId: "session-1"
    });
  }, /focusWindow requires/);
});

test("createAnnotationSchema rejects path traversal and invalid rectangles", () => {
  assert.throws(() => {
    createAnnotationSchema.parse({
      sessionId: "session-1",
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
    createAnnotationSchema.parse({
      sessionId: "session-1",
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
