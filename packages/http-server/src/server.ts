import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { URL } from "node:url";
import { SessionManager } from "@agent-desktop-harness/core";
import { DesktopHttpApi } from "./api.js";
import type { SessionManagerLike } from "./api.js";
import { HttpError, errorToHttpResponse } from "./errors.js";

export interface CreateHttpServerOptions {
  readonly sessionManager?: SessionManagerLike;
  readonly defaultWorkspaceDir?: string;
}

export interface StartHttpServerOptions extends CreateHttpServerOptions {
  readonly host?: string;
  readonly port?: number;
}

export function createDesktopHarnessHttpServer(
  options: CreateHttpServerOptions = {}
): Server {
  const api = new DesktopHttpApi(
    options.sessionManager,
    options.defaultWorkspaceDir
  );

  return createServer(async (request, response) => {
    try {
      const result = await routeRequest(request, api);
      writeRouteResult(response, result);
    } catch (error) {
      const result = errorToHttpResponse(error);
      if (result.statusCode >= 500) {
        console.error(error);
      }
      writeJson(response, result.statusCode, result.body);
    }
  });
}

export async function startHttpServer(
  options: StartHttpServerOptions = {}
): Promise<Server> {
  const host = options.host ?? process.env.AGENT_DESKTOP_HARNESS_HOST ?? "127.0.0.1";
  const port = options.port ?? parsePort(process.env.AGENT_DESKTOP_HARNESS_PORT) ?? 7341;
  const sessionManager = options.sessionManager ?? new SessionManager();
  const server = createDesktopHarnessHttpServer({
    ...options,
    sessionManager
  });

  installShutdownHandlers(server, sessionManager);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.error(`agent-desktop-harness HTTP server listening on http://${host}:${port}`);
  return server;
}

async function routeRequest(
  request: IncomingMessage,
  api: DesktopHttpApi
): Promise<RouteResult> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (method === "GET" && parts.length === 1 && parts[0] === "health") {
    return ok(api.health());
  }

  if (method === "GET" && parts.length === 2 && parts[0] === "tauri" && parts[1] === "status") {
    return ok(await api.tauriStatus());
  }

  if (method === "GET" && parts.length === 2 && parts[0] === "electron" && parts[1] === "status") {
    return ok(await api.electronStatus());
  }

  if (method === "GET" && parts.length === 2 && parts[0] === "drivers" && parts[1] === "status") {
    return ok(await api.driverStatus());
  }

  if (method === "GET" && parts.length === 2 && parts[0] === "observer" && parts[1] === "status") {
    return ok(await api.observerStatus());
  }

  if (parts[0] !== "sessions") {
    throw new HttpError(404, "NOT_FOUND", "Route not found.");
  }

  if (method === "GET" && parts.length === 1) {
    return ok(api.listSessions());
  }

  if (method === "POST" && parts.length === 1) {
    return ok(await api.createSession(await readJsonBody(request)));
  }

  const sessionId = parts[1];
  if (!sessionId) {
    throw new HttpError(404, "NOT_FOUND", "Route not found.");
  }

  if (method === "GET" && parts.length === 2) {
    return ok(api.getSession(sessionId));
  }

  if (method === "DELETE" && parts.length === 2) {
    return ok(await api.stopSession(sessionId));
  }

  if (parts.length === 3 && parts[2] === "observers") {
    if (method === "GET") {
      return ok(api.listLiveObservers(sessionId));
    }

    if (method === "POST") {
      return ok(await api.startLiveObserver(sessionId, await readJsonBody(request)));
    }
  }

  if (method === "DELETE" && parts.length === 4 && parts[2] === "observers") {
    return ok(await api.stopLiveObserver(sessionId, parts[3] ?? ""));
  }

  if (method === "POST" && parts.length === 3) {
    const action = parts[2];
    const body = await readJsonBody(request);

    switch (action) {
      case "launch":
        return ok(await api.launchApp(sessionId, body));
      case "screenshot":
        return ok(await api.screenshot(sessionId, body));
      case "click":
        return ok(await api.click(sessionId, body));
      case "double-click":
        return ok(await api.doubleClick(sessionId, body));
      case "type-text":
        return ok(await api.typeText(sessionId, body));
      case "hotkey":
        return ok(await api.hotkey(sessionId, body));
      case "scroll":
        return ok(await api.scroll(sessionId, body));
      case "focus-window":
        return ok(await api.focusWindow(sessionId, body));
      case "wait-for-stable-screen":
        return ok(await api.waitForStableScreen(sessionId, body));
      case "wait-for-window":
        return ok(await api.waitForWindow(sessionId, body));
      case "annotations":
        return ok(await api.createAnnotation(sessionId, body));
      default:
        throw new HttpError(404, "NOT_FOUND", "Route not found.");
    }
  }

  if (method === "POST" && parts.length === 4 && parts[2] === "browser") {
    const action = parts[3];
    const body = await readJsonBody(request);

    switch (action) {
      case "open":
        return ok(await api.browserOpen(sessionId, body));
      case "click":
        return ok(await api.browserClick(sessionId, body));
      case "fill":
        return ok(await api.browserFill(sessionId, body));
      case "press":
        return ok(await api.browserPress(sessionId, body));
      case "assert-text":
        return ok(await api.browserAssertText(sessionId, body));
      case "screenshot":
        return ok(await api.browserScreenshot(sessionId, body));
      case "close":
        return ok(await api.browserClose(sessionId, body));
      default:
        throw new HttpError(404, "NOT_FOUND", "Route not found.");
    }
  }

  if (method === "POST" && parts.length === 4 && parts[2] === "tauri") {
    const action = parts[3];
    const body = await readJsonBody(request);

    switch (action) {
      case "open":
        return ok(await api.tauriOpen(sessionId, body));
      case "click":
        return ok(await api.tauriClick(sessionId, body));
      case "fill":
        return ok(await api.tauriFill(sessionId, body));
      case "assert-text":
        return ok(await api.tauriAssertText(sessionId, body));
      case "screenshot":
        return ok(await api.tauriScreenshot(sessionId, body));
      case "close":
        return ok(await api.tauriClose(sessionId, body));
      default:
        throw new HttpError(404, "NOT_FOUND", "Route not found.");
    }
  }

  if (method === "POST" && parts.length === 4 && parts[2] === "electron") {
    const action = parts[3];
    const body = await readJsonBody(request);

    switch (action) {
      case "open":
        return ok(await api.electronOpen(sessionId, body));
      case "click":
        return ok(await api.electronClick(sessionId, body));
      case "fill":
        return ok(await api.electronFill(sessionId, body));
      case "press":
        return ok(await api.electronPress(sessionId, body));
      case "assert-text":
        return ok(await api.electronAssertText(sessionId, body));
      case "screenshot":
        return ok(await api.electronScreenshot(sessionId, body));
      case "close":
        return ok(await api.electronClose(sessionId, body));
      default:
        throw new HttpError(404, "NOT_FOUND", "Route not found.");
    }
  }

  if (method === "POST" && parts.length === 4 && parts[2] === "driver" && parts[3] === "route") {
    return ok(await api.driverRoute(sessionId, await readJsonBody(request)));
  }

  if (method === "POST" && parts.length === 4 && parts[2] === "apps") {
    const action = parts[3];
    const body = await readJsonBody(request);

    switch (action) {
      case "open":
        return ok(await api.appOpen(sessionId, body));
      case "click":
        return ok(await api.appClick(sessionId, body));
      case "fill":
        return ok(await api.appFill(sessionId, body));
      case "press":
        return ok(await api.appPress(sessionId, body));
      case "assert-text":
        return ok(await api.appAssertText(sessionId, body));
      case "screenshot":
        return ok(await api.appScreenshot(sessionId, body));
      case "close":
        return ok(await api.appClose(sessionId, body));
      default:
        throw new HttpError(404, "NOT_FOUND", "Route not found.");
    }
  }

  if (method === "POST" && parts.length === 4 && parts[2] === "visual") {
    const action = parts[3];
    const body = await readJsonBody(request);

    switch (action) {
      case "baselines":
        return ok(await api.saveVisualBaseline(sessionId, body));
      case "compare":
        return ok(await api.visualCompare(sessionId, body));
      case "assert-changed":
        return ok(await api.visualAssertChanged(sessionId, body));
      case "assert-similar":
        return ok(await api.visualAssertSimilar(sessionId, body));
      case "compare-baseline":
        return ok(await api.compareVisualBaseline(sessionId, body));
      case "assert-annotation-changed":
        return ok(await api.visualAssertAnnotationChanged(sessionId, body));
      case "assert-annotation-similar":
        return ok(await api.visualAssertAnnotationSimilar(sessionId, body));
      case "assert-change-contained":
        return ok(await api.visualAssertChangeContained(sessionId, body));
      default:
        throw new HttpError(404, "NOT_FOUND", "Route not found.");
    }
  }

  if (method === "GET" && parts.length === 4 && parts[2] === "visual" && parts[3] === "baselines") {
    return ok(await api.listVisualBaselines(sessionId, Object.fromEntries(url.searchParams)));
  }

  if (method === "GET" && parts.length === 4 && parts[2] === "visual" && parts[3] === "assertions") {
    return ok(await api.listVisualAssertions(sessionId));
  }

  if (method === "GET" && parts.length === 5 && parts[2] === "visual" && parts[3] === "diffs") {
    const file = await api.getVisualDiffFile(sessionId, parts[4] ?? "");
    return binary(200, file.body, "image/png", {
      "content-disposition": `inline; filename="${safeHeaderFileName(parts[4] ?? "visual-diff.png")}"`
    });
  }

  if (method === "GET" && parts.length === 3 && parts[2] === "windows") {
    return ok(await api.getWindows(sessionId));
  }

  if (method === "GET" && parts.length === 3 && parts[2] === "screenshots") {
    return ok(await api.listScreenshots(sessionId));
  }

  if (method === "GET" && parts.length === 4 && parts[2] === "screenshots") {
    const file = await api.getScreenshotFile(sessionId, parts[3] ?? "");
    return binary(200, file.body, "image/png", {
      "content-disposition": `inline; filename="${safeHeaderFileName(parts[3] ?? "screenshot.png")}"`
    });
  }

  if (method === "GET" && parts.length === 3 && parts[2] === "annotations") {
    return ok(await api.listAnnotations(sessionId));
  }

  if (method === "GET" && parts.length === 4 && parts[2] === "annotations") {
    const file = await api.getAnnotationFile(sessionId, parts[3] ?? "");
    return binary(200, file.body, "image/png", {
      "content-disposition": `inline; filename="${safeHeaderFileName(parts[3] ?? "annotation.png")}"`
    });
  }

  if (method === "GET" && parts.length === 3 && parts[2] === "visual-handoff") {
    return ok(await api.getVisualHandoff(sessionId));
  }

  if (method === "GET" && parts.length === 3 && parts[2] === "annotate") {
    return text(200, api.getAnnotationUi(sessionId, url.searchParams.get("screenshot") ?? undefined), "text/html; charset=utf-8");
  }

  if (
    method === "GET" &&
    parts.length === 4 &&
    parts[2] === "evidence" &&
    parts[3] === "report"
  ) {
    return ok(await api.getEvidenceReport(sessionId));
  }

  throw new HttpError(404, "NOT_FOUND", "Route not found.");
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  if (!String(contentType).toLowerCase().includes("application/json")) {
    throw new HttpError(
      400,
      "INVALID_CONTENT_TYPE",
      "POST requests must use Content-Type: application/json."
    );
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 15_000_000) {
      throw new HttpError(400, "REQUEST_TOO_LARGE", "Request body is too large.");
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text.length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

type RouteResult =
  | {
      readonly kind: "json";
      readonly statusCode: number;
      readonly body: unknown;
    }
  | {
      readonly kind: "binary";
      readonly statusCode: number;
      readonly body: Buffer;
      readonly contentType: string;
      readonly headers?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "text";
      readonly statusCode: number;
      readonly body: string;
      readonly contentType: string;
      readonly headers?: Readonly<Record<string, string>>;
    };

function ok(body: unknown): RouteResult {
  return {
    kind: "json",
    statusCode: 200,
    body
  };
}

function binary(
  statusCode: number,
  body: Buffer,
  contentType: string,
  headers: Readonly<Record<string, string>> = {}
): RouteResult {
  return {
    kind: "binary",
    statusCode,
    body,
    contentType,
    headers
  };
}

function text(
  statusCode: number,
  body: string,
  contentType: string,
  headers: Readonly<Record<string, string>> = {}
): RouteResult {
  return {
    kind: "text",
    statusCode,
    body,
    contentType,
    headers
  };
}

function writeRouteResult(response: ServerResponse, result: RouteResult): void {
  if (result.kind === "json") {
    writeJson(response, result.statusCode, result.body);
    return;
  }

  response.writeHead(result.statusCode, {
    "content-type": result.contentType,
    "cache-control": "no-store",
    ...(result.headers ?? {})
  });
  response.end(result.body);
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function safeHeaderFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid AGENT_DESKTOP_HARNESS_PORT: ${value}`);
  }

  return port;
}

function installShutdownHandlers(server: Server, sessionManager: SessionManagerLike): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    void (async () => {
      console.error(`agent-desktop-harness HTTP server received ${signal}; stopping sessions.`);
      await Promise.allSettled(
        sessionManager
          .listSessions()
          .filter((session) => session.status !== "stopped")
          .map((session) => sessionManager.stopSession(session.id))
      );
      server.close(() => process.exit(0));
    })();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
