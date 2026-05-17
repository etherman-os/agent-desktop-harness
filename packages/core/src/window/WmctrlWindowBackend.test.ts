import test from "node:test";
import assert from "node:assert/strict";
import {
  findMatchingWindow,
  parseWmctrlLine,
  parseWmctrlWindowList
} from "./WmctrlWindowBackend.js";

test("parseWmctrlLine parses wmctrl -lp output", () => {
  const parsed = parseWmctrlLine("0x03a00007  0 12345 host Terminal Title");

  assert.equal(parsed.id, "0x03a00007");
  assert.equal(parsed.desktop, "0");
  assert.equal(parsed.pid, 12345);
  assert.equal(parsed.title, "Terminal Title");
});

test("parseWmctrlWindowList returns an empty list for no windows", () => {
  assert.deepEqual(parseWmctrlWindowList(""), []);
});

test("findMatchingWindow supports id, pid, exact title, and title substring", () => {
  const windows = parseWmctrlWindowList(
    [
      "0x03a00007  0 12345 host Terminal Title",
      "0x03a00008  0 23456 host Browser Window"
    ].join("\n")
  );

  assert.equal(findMatchingWindow(windows, { id: "0x03A00007" })?.pid, 12345);
  assert.equal(findMatchingWindow(windows, { pid: 23456 })?.id, "0x03a00008");
  assert.equal(findMatchingWindow(windows, { title: "Terminal Title" })?.pid, 12345);
  assert.equal(findMatchingWindow(windows, { titleIncludes: "browser" })?.pid, 23456);
});
