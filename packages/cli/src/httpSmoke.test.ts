import assert from "node:assert/strict";
import test from "node:test";
import { type FetchLike, httpJsonRequest, parseSmokeHttpArgs } from "./httpSmoke.js";

test("parseSmokeHttpArgs uses the local HTTP smoke defaults", () => {
  const parsed = parseSmokeHttpArgs([]);

  assert.equal(parsed.port, 7352);
  assert.equal(parsed.text, "agent-desktop-harness http smoke");
  assert.ok(parsed.workspacePath.length > 0);
});

test("parseSmokeHttpArgs validates port values", () => {
  assert.throws(() => parseSmokeHttpArgs(["--port", "70000"]), /Invalid port/);
});

test("httpJsonRequest sends JSON bodies and parses successful responses", async () => {
  let capturedBody: string | undefined;
  const fetchLike: FetchLike = async (_url, init) => {
    capturedBody = init?.body;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ ok: true });
      },
    };
  };

  const result = await httpJsonRequest<{ readonly ok: boolean }>(
    fetchLike,
    "http://127.0.0.1:7352/example",
    {
      method: "POST",
      body: { value: "test" },
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(capturedBody, JSON.stringify({ value: "test" }));
});

test("httpJsonRequest surfaces structured HTTP error messages", async () => {
  const fetchLike: FetchLike = async () => ({
    ok: false,
    status: 503,
    async text() {
      return JSON.stringify({
        ok: false,
        error: {
          code: "MISSING_DEPENDENCY",
          message: "Missing dependency: Xvfb",
        },
      });
    },
  });

  await assert.rejects(
    async () => await httpJsonRequest(fetchLike, "http://127.0.0.1:7352/example"),
    /HTTP 503: Missing dependency: Xvfb/,
  );
});
