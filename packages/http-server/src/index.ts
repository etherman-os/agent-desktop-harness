import { startHttpServer } from "./server.js";

void startHttpServer().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? `agent-desktop-harness HTTP server failed: ${error.message}`
      : `agent-desktop-harness HTTP server failed: ${String(error)}`,
  );
  process.exitCode = 1;
});
