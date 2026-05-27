import { startStdioServer } from "./server.js";

void startStdioServer().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? `agent-desktop-harness MCP server failed: ${error.message}`
      : `agent-desktop-harness MCP server failed: ${String(error)}`,
  );
  process.exitCode = 1;
});
