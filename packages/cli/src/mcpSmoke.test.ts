import assert from "node:assert/strict";
import test from "node:test";
import {
  parseJsonRpcLine,
  parseMcpToolTextResult,
  parseSmokeMcpArgs
} from "./mcpSmoke.js";

test("parseSmokeMcpArgs uses the local MCP smoke defaults", () => {
  const parsed = parseSmokeMcpArgs([]);

  assert.equal(parsed.text, "agent-desktop-harness mcp smoke");
  assert.ok(parsed.workspacePath.length > 0);
});

test("parseJsonRpcLine parses newline-delimited JSON-RPC messages", () => {
  const message = parseJsonRpcLine(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: {
        ok: true
      }
    })
  );

  assert.equal(message.jsonrpc, "2.0");
  assert.equal(message.id, 1);
});

test("parseJsonRpcLine rejects stdout pollution", () => {
  assert.throws(() => parseJsonRpcLine("server started"), /Unexpected token|Invalid/);
});

test("parseMcpToolTextResult parses JSON text content", () => {
  const result = parseMcpToolTextResult({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          sessionId: "session-1",
          success: true
        })
      }
    ]
  });

  assert.deepEqual(result, {
    sessionId: "session-1",
    success: true
  });
});

test("parseMcpToolTextResult turns MCP tool errors into thrown errors", () => {
  assert.throws(
    () =>
      parseMcpToolTextResult({
        isError: true,
        content: [
          {
            type: "text",
            text: "Missing dependency: Xvfb"
          }
        ]
      }),
    /Missing dependency: Xvfb/
  );
});
