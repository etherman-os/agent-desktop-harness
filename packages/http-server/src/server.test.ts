import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type {
  CreateAnnotationInput,
  DesktopSession,
  InputActionResult,
  LaunchResult,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotResult,
  SessionConfig,
  SessionId,
  VisualHandoff,
  WaitForStableScreenResult,
  WindowActionResult,
  WindowInfo
} from "@agent-desktop-harness/core";
import { PolicyError } from "@agent-desktop-harness/core";
import { createDesktopHarnessHttpServer } from "./server.js";
import type { SessionManagerLike } from "./api.js";

test("GET /health returns service status", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestJson(baseUrl, "/health");

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.service, "agent-desktop-harness-http");
  });
});

test("POST /sessions validates request body", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestJson(baseUrl, "/sessions", {
      method: "POST",
      body: {
        width: 0
      }
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });
});

test("GET unknown session returns 404", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestJson(baseUrl, "/sessions/missing");

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "SESSION_NOT_FOUND");
  });
});

test("POST type-text redacts secret response details", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestJson(baseUrl, "/sessions/session-1/type-text", {
      method: "POST",
      body: {
        text: "secret-value",
        secret: true
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.result.details, {
      redacted: true,
      textLength: 12
    });
    assert.equal(JSON.stringify(response.body).includes("secret-value"), false);
  });
});

test("POST focus-window requires a selector", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestJson(baseUrl, "/sessions/session-1/focus-window", {
      method: "POST",
      body: {}
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });
});

test("policy errors map to 403", async () => {
  const manager = new MockSessionManager();
  manager.launchError = new PolicyError("Command is not allowed.");

  await withServer(manager, async (baseUrl) => {
    const response = await requestJson(baseUrl, "/sessions/session-1/launch", {
      method: "POST",
      body: {
        command: "xterm"
      }
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "POLICY_DENIED");
  });
});

test("GET screenshots and visual handoff routes return evidence metadata", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const screenshots = await requestJson(baseUrl, "/sessions/session-1/screenshots");
    assert.equal(screenshots.status, 200);
    assert.equal(screenshots.body.screenshots[0].fileName, "0001-demo.png");

    const handoff = await requestJson(baseUrl, "/sessions/session-1/visual-handoff");
    assert.equal(handoff.status, 200);
    assert.match(handoff.body.text, /Visual Handoff/);
  });
});

test("POST annotations validates traversal and returns annotation", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const bad = await requestJson(baseUrl, "/sessions/session-1/annotations", {
      method: "POST",
      body: {
        screenshotFileName: "../0001-demo.png",
        type: "rectangle",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        note: "bad path"
      }
    });
    assert.equal(bad.status, 400);

    const good = await requestJson(baseUrl, "/sessions/session-1/annotations", {
      method: "POST",
      body: {
        screenshotFileName: "0001-demo.png",
        type: "rectangle",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        note: "Button overlaps this text."
      }
    });
    assert.equal(good.status, 200);
    assert.equal(good.body.annotation.id, "ann_001");
    assert.equal(good.body.annotation.note, "Button overlaps this text.");
  });
});

test("GET annotation UI returns local HTML", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestText(baseUrl, "/sessions/session-1/annotate");

    assert.equal(response.status, 200);
    assert.match(response.contentType, /text\/html/);
    assert.match(response.body, /Visual Annotation Handoff/);
  });
});

async function withServer(
  sessionManager: SessionManagerLike,
  callback: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createDesktopHarnessHttpServer({ sessionManager });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeServer(server);
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function requestJson(
  baseUrl: string,
  path: string,
  options: {
    readonly method?: string;
    readonly body?: unknown;
  } = {}
): Promise<{ readonly status: number; readonly body: Record<string, any> }> {
  const init: RequestInit = {
    method: options.method ?? "GET"
  };

  if (options.body !== undefined) {
    init.headers = {
      "content-type": "application/json"
    };
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${baseUrl}${path}`, init);
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}

async function requestText(
  baseUrl: string,
  path: string
): Promise<{
  readonly status: number;
  readonly body: string;
  readonly contentType: string;
}> {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? ""
  };
}

class MockSessionManager implements SessionManagerLike {
  launchError: Error | undefined;
  private readonly session = makeSession();

  async createSession(config: SessionConfig): Promise<DesktopSession> {
    return {
      ...this.session,
      config,
      workspacePath: config.workspacePath
    };
  }

  listSessions(): DesktopSession[] {
    return [this.session];
  }

  getSession(sessionId: SessionId): DesktopSession | undefined {
    return sessionId === this.session.id ? this.session : undefined;
  }

  async launchApp(): Promise<LaunchResult> {
    if (this.launchError) {
      throw this.launchError;
    }

    return {
      sessionId: this.session.id,
      processId: 123,
      command: "xterm",
      args: [],
      cwd: this.session.workspacePath,
      display: this.session.display,
      startedAt: new Date("2026-01-01T00:00:00.000Z")
    };
  }

  async captureScreenshot(): Promise<ScreenshotResult> {
    return {
      artifactId: "screenshot-0001",
      sessionId: this.session.id,
      path: "/tmp/screenshot.png",
      width: 1440,
      height: 900,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      display: this.session.display,
      sequence: 1
    };
  }

  async click(): Promise<InputActionResult> {
    return this.inputResult("input.click");
  }

  async doubleClick(): Promise<InputActionResult> {
    return this.inputResult("input.double_click");
  }

  async typeText(): Promise<InputActionResult> {
    return this.inputResult("input.type_text", {
      text: "secret-value"
    });
  }

  async hotkey(): Promise<InputActionResult> {
    return this.inputResult("input.hotkey");
  }

  async scroll(): Promise<InputActionResult> {
    return this.inputResult("input.scroll");
  }

  async getWindows(): Promise<WindowInfo[]> {
    return [
      {
        id: "0x01",
        title: "Test Window"
      }
    ];
  }

  async focusWindow(): Promise<WindowActionResult> {
    return {
      sessionId: this.session.id,
      success: true,
      window: {
        id: "0x01",
        title: "Test Window"
      },
      createdAt: "2026-01-01T00:00:00.000Z"
    };
  }

  async waitForStableScreen(): Promise<WaitForStableScreenResult> {
    return {
      sessionId: this.session.id,
      stable: true,
      checks: 2,
      elapsedMs: 1000
    };
  }

  async listScreenshots(): Promise<ScreenshotArtifact[]> {
    return [
      {
        sessionId: this.session.id,
        fileName: "0001-demo.png",
        path: `${this.session.evidencePath}/screenshots/0001-demo.png`,
        sequence: 1,
        label: "demo",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];
  }

  getScreenshotFilePath(): string {
    return `${this.session.evidencePath}/screenshots/0001-demo.png`;
  }

  getAnnotationFilePath(): string {
    return `${this.session.evidencePath}/annotations/ann_001-crop.png`;
  }

  async createAnnotation(
    sessionId: SessionId,
    input: CreateAnnotationInput
  ): Promise<ScreenshotAnnotation> {
    return {
      id: "ann_001",
      sessionId,
      screenshotPath: `${this.session.evidencePath}/screenshots/${input.screenshotFileName}`,
      screenshotFileName: input.screenshotFileName,
      type: input.type,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      x2: input.x2,
      y2: input.y2,
      note: input.note,
      color: input.color,
      cropPath: `${this.session.evidencePath}/annotations/ann_001-crop.png`,
      createdAt: "2026-01-01T00:00:00.000Z"
    };
  }

  async listAnnotations(): Promise<ScreenshotAnnotation[]> {
    return [
      {
        id: "ann_001",
        sessionId: this.session.id,
        screenshotPath: `${this.session.evidencePath}/screenshots/0001-demo.png`,
        screenshotFileName: "0001-demo.png",
        type: "rectangle",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        note: "Button overlaps this text.",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];
  }

  async getVisualHandoff(): Promise<VisualHandoff> {
    return {
      sessionId: this.session.id,
      path: `${this.session.evidencePath}/visual-handoff.md`,
      text: "# Visual Handoff\n\nButton overlaps this text.\n",
      annotations: await this.listAnnotations()
    };
  }

  async stopSession(): Promise<void> {
    return;
  }

  private inputResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {}
  ): InputActionResult {
    return {
      sessionId: this.session.id,
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: true,
      details
    };
  }
}

function makeSession(): DesktopSession {
  return {
    id: "session-1",
    config: {
      workspacePath: "/tmp/agent-desktop-harness-http-test"
    },
    driverKind: "unknown",
    status: "running",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    workspacePath: "/tmp/agent-desktop-harness-http-test",
    evidencePath: "/tmp/agent-desktop-harness-http-test/.desktop-harness/sessions/session-1",
    display: ":90",
    displayNumber: 90,
    width: 1440,
    height: 900,
    depth: 24,
    processIds: {
      apps: []
    },
    warnings: []
  };
}
