import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AppActionResult,
  AppRef,
  BrowserActionResult,
  BrowserPageRef,
  CreateAnnotationInput,
  DesktopSession,
  DriverRouteDecision,
  DriverRouteRequest,
  DriverRouterStatus,
  ElectronActionResult,
  ElectronAppRef,
  ElectronDriverStatus,
  InputActionResult,
  LaunchResult,
  LiveObserverRef,
  LiveObserverStatus,
  ScreenshotAnnotation,
  ScreenshotArtifact,
  ScreenshotResult,
  SessionConfig,
  SessionId,
  TauriActionResult,
  TauriAppRef,
  TauriDriverStatus,
  AnnotationRegionResult,
  VisualBaselineRef,
  VisualChangeContainmentResult,
  VisualCompareResult,
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

test("POST wait-for-window returns a matching window", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestJson(baseUrl, "/sessions/session-1/wait-for-window", {
      method: "POST",
      body: {
        titleIncludes: "Test",
        excludeDevtools: true
      }
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.window.id, "0x01");
  });
});

test("browser semantic routes return page, actions, screenshots, and close result", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const opened = await requestJson(baseUrl, "/sessions/session-1/browser/open", {
      method: "POST",
      body: {
        url: "http://127.0.0.1:5179",
        browserExecutablePath: "/usr/bin/google-chrome",
        viewport: {
          width: 1440,
          height: 900
        }
      }
    });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.page.pageId, "page-1");

    const fill = await requestJson(baseUrl, "/sessions/session-1/browser/fill", {
      method: "POST",
      body: {
        placeholder: "Type a message",
        value: "secret-value",
        secret: true
      }
    });
    assert.equal(fill.status, 200);
    assert.equal(JSON.stringify(fill.body).includes("secret-value"), false);
    assert.equal(fill.body.result.details.redacted, true);

    const click = await requestJson(baseUrl, "/sessions/session-1/browser/click", {
      method: "POST",
      body: {
        role: "button",
        name: "Save message"
      }
    });
    assert.equal(click.status, 200);
    assert.equal(click.body.result.actionType, "browser.click");

    const screenshot = await requestJson(baseUrl, "/sessions/session-1/browser/screenshot", {
      method: "POST",
      body: {
        label: "semantic"
      }
    });
    assert.equal(screenshot.status, 200);
    assert.equal(screenshot.body.screenshot.path, "/tmp/browser-screenshot.png");

    const closed = await requestJson(baseUrl, "/sessions/session-1/browser/close", {
      method: "POST",
      body: {}
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.sessionId, "session-1");
  });
});

test("browser click validates selector targets", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestJson(baseUrl, "/sessions/session-1/browser/click", {
      method: "POST",
      body: {}
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });
});

test("observer routes return status, start/list metadata, and stop result", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const status = await requestJson(baseUrl, "/observer/status");
    assert.equal(status.status, 200);
    assert.equal(status.body.optional, true);
    assert.equal(status.body.status.available, true);

    const started = await requestJson(baseUrl, "/sessions/session-1/observers", {
      method: "POST",
      body: {
        host: "127.0.0.1",
        vncPort: 5901,
        webPort: 6081,
        viewOnly: true,
        password: "secret-value",
        label: "test-observer"
      }
    });
    assert.equal(started.status, 200);
    assert.equal(started.body.observer.observerId, "observer-1");
    assert.equal(started.body.observer.url, "http://127.0.0.1:6081/vnc.html?autoconnect=1&resize=scale&view_only=1");
    assert.equal(JSON.stringify(started.body).includes("secret-value"), false);

    const listed = await requestJson(baseUrl, "/sessions/session-1/observers");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.observers.length, 1);

    const stopped = await requestJson(baseUrl, "/sessions/session-1/observers/observer-1", {
      method: "DELETE"
    });
    assert.equal(stopped.status, 200);
    assert.equal(stopped.body.result.stopped, true);
  });
});

test("tauri experimental routes return status, fallback guidance, screenshots, and close result", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const status = await requestJson(baseUrl, "/tauri/status");
    assert.equal(status.status, 200);
    assert.equal(status.body.experimental, true);
    assert.equal(status.body.status.available, false);

    const opened = await requestJson(baseUrl, "/sessions/session-1/tauri/open", {
      method: "POST",
      body: {
        command: "pnpm",
        args: ["tauri", "dev"],
        cwd: "/tmp/agent-desktop-harness-http-test"
      }
    });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.experimental, true);
    assert.equal(opened.body.mode, "x11-fallback");
    assert.equal(opened.body.app.appId, "tauri-app-1");

    const click = await requestJson(baseUrl, "/sessions/session-1/tauri/click", {
      method: "POST",
      body: {
        role: "button",
        name: "Save message"
      }
    });
    assert.equal(click.status, 200);
    assert.equal(click.body.experimental, true);
    assert.equal(click.body.result.success, false);
    assert.equal(click.body.result.mode, "x11-fallback");

    const fill = await requestJson(baseUrl, "/sessions/session-1/tauri/fill", {
      method: "POST",
      body: {
        placeholder: "Type a message",
        value: "secret-value",
        secret: true
      }
    });
    assert.equal(fill.status, 200);
    assert.equal(JSON.stringify(fill.body).includes("secret-value"), false);
    assert.equal(fill.body.result.details.redacted, true);

    const screenshot = await requestJson(baseUrl, "/sessions/session-1/tauri/screenshot", {
      method: "POST",
      body: {
        label: "tauri-fallback"
      }
    });
    assert.equal(screenshot.status, 200);
    assert.equal(screenshot.body.screenshot.path, "/tmp/tauri-screenshot.png");

    const closed = await requestJson(baseUrl, "/sessions/session-1/tauri/close", {
      method: "POST",
      body: {}
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.experimental, true);
    assert.equal(closed.body.sessionId, "session-1");
  });
});

test("tauri click validates selector targets", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestJson(baseUrl, "/sessions/session-1/tauri/click", {
      method: "POST",
      body: {}
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });
});

test("electron experimental routes return status, semantic actions, screenshots, and close result", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const status = await requestJson(baseUrl, "/electron/status");
    assert.equal(status.status, 200);
    assert.equal(status.body.experimental, true);
    assert.equal(status.body.status.available, true);

    const opened = await requestJson(baseUrl, "/sessions/session-1/electron/open", {
      method: "POST",
      body: {
        command: "electron",
        args: ["."],
        cwd: "/tmp/agent-desktop-harness-http-test"
      }
    });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.experimental, true);
    assert.equal(opened.body.mode, "playwright-electron");
    assert.equal(opened.body.app.appId, "electron-app-1");

    const fill = await requestJson(baseUrl, "/sessions/session-1/electron/fill", {
      method: "POST",
      body: {
        placeholder: "Type a message",
        value: "secret-value",
        secret: true
      }
    });
    assert.equal(fill.status, 200);
    assert.equal(JSON.stringify(fill.body).includes("secret-value"), false);
    assert.equal(fill.body.result.details.redacted, true);

    const click = await requestJson(baseUrl, "/sessions/session-1/electron/click", {
      method: "POST",
      body: {
        role: "button",
        name: "Save message"
      }
    });
    assert.equal(click.status, 200);
    assert.equal(click.body.result.actionType, "electron.click");

    const press = await requestJson(baseUrl, "/sessions/session-1/electron/press", {
      method: "POST",
      body: {
        selector: "#message-input",
        key: "Enter"
      }
    });
    assert.equal(press.status, 200);
    assert.equal(press.body.result.actionType, "electron.press");

    const screenshot = await requestJson(baseUrl, "/sessions/session-1/electron/screenshot", {
      method: "POST",
      body: {
        label: "electron-semantic"
      }
    });
    assert.equal(screenshot.status, 200);
    assert.equal(screenshot.body.screenshot.path, "/tmp/electron-screenshot.png");

    const closed = await requestJson(baseUrl, "/sessions/session-1/electron/close", {
      method: "POST",
      body: {}
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.experimental, true);
    assert.equal(closed.body.sessionId, "session-1");
  });
});

test("electron click validates selector targets", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestJson(baseUrl, "/sessions/session-1/electron/click", {
      method: "POST",
      body: {}
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });
});

test("driver router routes return status, decisions, app actions, screenshots, and close result", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const status = await requestJson(baseUrl, "/drivers/status");
    assert.equal(status.status, 200);
    assert.equal(status.body.status.browser.available, true);

    const decision = await requestJson(baseUrl, "/sessions/session-1/driver/route", {
      method: "POST",
      body: {
        appKind: "browser",
        requireSemantic: true
      }
    });
    assert.equal(decision.status, 200);
    assert.equal(decision.body.decision.selectedDriver, "browser-playwright");
    assert.equal(decision.body.decision.semantic, true);

    const opened = await requestJson(baseUrl, "/sessions/session-1/apps/open", {
      method: "POST",
      body: {
        appKind: "browser",
        url: "http://127.0.0.1:5179",
        requireSemantic: true
      }
    });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.app.appId, "app-1");
    assert.equal(opened.body.selectedDriver, "browser-playwright");

    const fill = await requestJson(baseUrl, "/sessions/session-1/apps/fill", {
      method: "POST",
      body: {
        placeholder: "Type a message",
        value: "secret-value",
        secret: true
      }
    });
    assert.equal(fill.status, 200);
    assert.equal(fill.body.result.actionType, "app.fill");
    assert.equal(fill.body.result.details.redacted, true);
    assert.equal(JSON.stringify(fill.body).includes("secret-value"), false);

    const click = await requestJson(baseUrl, "/sessions/session-1/apps/click", {
      method: "POST",
      body: {
        role: "button",
        name: "Save message"
      }
    });
    assert.equal(click.status, 200);
    assert.equal(click.body.result.selectedDriver, "browser-playwright");

    const asserted = await requestJson(baseUrl, "/sessions/session-1/apps/assert-text", {
      method: "POST",
      body: {
        text: "Status: saved"
      }
    });
    assert.equal(asserted.status, 200);
    assert.equal(asserted.body.result.semantic, true);

    const screenshot = await requestJson(baseUrl, "/sessions/session-1/apps/screenshot", {
      method: "POST",
      body: {
        label: "router"
      }
    });
    assert.equal(screenshot.status, 200);
    assert.equal(screenshot.body.screenshot.path, "/tmp/app-screenshot.png");

    const closed = await requestJson(baseUrl, "/sessions/session-1/apps/close", {
      method: "POST",
      body: {}
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.success, true);
  });
});

test("visual QA routes return comparison metadata, assertions, and diff PNGs", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agent-desktop-harness-http-visual-"));
  const manager = new MockSessionManager();
  manager.visualDiffFilePath = join(tempRoot, "visual-diffs", "diff_001-router.png");
  await mkdir(join(tempRoot, "visual-diffs"), { recursive: true });
  await writeFile(
    manager.visualDiffFilePath,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );

  try {
    await withServer(manager, async (baseUrl) => {
      const compare = await requestJson(baseUrl, "/sessions/session-1/visual/compare", {
        method: "POST",
        body: {
          beforePath: "screenshots/0001-before.png",
          afterPath: "screenshots/0002-after.png",
          label: "router",
          createDiffImage: true
        }
      });
      assert.equal(compare.status, 200);
      assert.equal(compare.body.result.kind, "compare");
      assert.match(compare.body.result.diffPath, /visual-diffs/);

      const changed = await requestJson(baseUrl, "/sessions/session-1/visual/assert-changed", {
        method: "POST",
        body: {
          beforePath: "screenshots/0001-before.png",
          afterPath: "screenshots/0002-after.png",
          minDiffPixelRatio: 0.01
        }
      });
      assert.equal(changed.status, 200);
      assert.equal(changed.body.result.passed, true);

      const similar = await requestJson(baseUrl, "/sessions/session-1/visual/assert-similar", {
        method: "POST",
        body: {
          beforePath: "screenshots/0001-before.png",
          afterPath: "screenshots/0002-after.png",
          maxDiffPixelRatio: 0.1
        }
      });
      assert.equal(similar.status, 200);
      assert.equal(similar.body.result.passed, true);

      const savedBaseline = await requestJson(baseUrl, "/sessions/session-1/visual/baselines", {
        method: "POST",
        body: {
          screenshotPath: "screenshots/0001-before.png",
          name: "sample-vite-clean",
          suite: "smoke",
          overwrite: true
        }
      });
      assert.equal(savedBaseline.status, 200);
      assert.equal(savedBaseline.body.baseline.name, "sample-vite-clean");

      const baselines = await requestJson(baseUrl, "/sessions/session-1/visual/baselines?suite=smoke");
      assert.equal(baselines.status, 200);
      assert.equal(baselines.body.baselines[0].suite, "smoke");

      const baselineCompare = await requestJson(
        baseUrl,
        "/sessions/session-1/visual/compare-baseline",
        {
          method: "POST",
          body: {
            screenshotPath: "screenshots/0002-after.png",
            baselineName: "sample-vite-clean",
            suite: "smoke",
            createDiffImage: true
          }
        }
      );
      assert.equal(baselineCompare.status, 200);
      assert.equal(baselineCompare.body.result.kind, "compare-baseline");

      const annotationChanged = await requestJson(
        baseUrl,
        "/sessions/session-1/visual/assert-annotation-changed",
        {
          method: "POST",
          body: {
            annotationId: "ann_001",
            afterPath: "screenshots/0002-after.png",
            minDiffPixelRatio: 0.01
          }
        }
      );
      assert.equal(annotationChanged.status, 200);
      assert.equal(annotationChanged.body.result.annotationId, "ann_001");

      const contained = await requestJson(
        baseUrl,
        "/sessions/session-1/visual/assert-change-contained",
        {
          method: "POST",
          body: {
            beforePath: "screenshots/0001-before.png",
            afterPath: "screenshots/0002-after.png",
            allowedRegions: [
              {
                x: 1,
                y: 2,
                width: 3,
                height: 4
              }
            ],
            maxOutsideDiffPixelRatio: 0
          }
        }
      );
      assert.equal(contained.status, 200);
      assert.equal(contained.body.result.containmentPassed, true);

      const assertions = await requestJson(baseUrl, "/sessions/session-1/visual/assertions");
      assert.equal(assertions.status, 200);
      assert.equal(assertions.body.assertions[0].kind, "assert-changed");

      const diff = await fetch(`${baseUrl}/sessions/session-1/visual/diffs/diff_001-router.png`);
      assert.equal(diff.status, 200);
      assert.match(diff.headers.get("content-type") ?? "", /image\/png/);
      assert.equal((await diff.arrayBuffer()).byteLength, 8);
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("app click validates router targets", async () => {
  await withServer(new MockSessionManager(), async (baseUrl) => {
    const response = await requestJson(baseUrl, "/sessions/session-1/apps/click", {
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
  visualDiffFilePath: string | undefined;
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
      elapsedMs: 1000,
      mode: "hash",
      discardedScreenshotCount: 0
    };
  }

  async waitForWindow(): Promise<WindowInfo> {
    return {
      id: "0x01",
      title: "Test Window"
    };
  }

  async openBrowser(): Promise<BrowserPageRef> {
    return {
      sessionId: this.session.id,
      pageId: "page-1",
      url: "http://127.0.0.1:5179",
      title: "Agent Desktop Harness Demo",
      createdAt: "2026-01-01T00:00:00.000Z"
    };
  }

  async browserClick(): Promise<BrowserActionResult> {
    return this.browserResult("browser.click");
  }

  async browserFill(): Promise<BrowserActionResult> {
    return this.browserResult("browser.fill", {
      redacted: true,
      valueLength: 12
    });
  }

  async browserPress(): Promise<BrowserActionResult> {
    return this.browserResult("browser.press");
  }

  async browserAssertText(): Promise<BrowserActionResult> {
    return this.browserResult("browser.assert_text");
  }

  async browserScreenshot(): Promise<ScreenshotResult> {
    return {
      artifactId: "screenshot-0002",
      sessionId: this.session.id,
      path: "/tmp/browser-screenshot.png",
      width: 1440,
      height: 900,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      display: this.session.display,
      sequence: 2,
      label: "semantic"
    };
  }

  async closeBrowser(): Promise<void> {
    return;
  }

  async getTauriDriverStatus(): Promise<TauriDriverStatus> {
    return {
      available: false,
      warnings: [],
      errors: ["tauri-driver is missing."]
    };
  }

  async openTauriApp(): Promise<TauriAppRef> {
    return {
      sessionId: this.session.id,
      appId: "tauri-app-1",
      processId: 456,
      createdAt: "2026-01-01T00:00:00.000Z",
      mode: "x11-fallback",
      warnings: ["Tauri WebDriver semantic mode is unavailable; use desktop_* X11 fallback tools."]
    };
  }

  async tauriClick(): Promise<TauriActionResult> {
    return this.tauriResult("tauri.click");
  }

  async tauriFill(): Promise<TauriActionResult> {
    return this.tauriResult("tauri.fill", {
      redacted: true,
      valueLength: 12
    });
  }

  async tauriAssertText(): Promise<TauriActionResult> {
    return this.tauriResult("tauri.assert_text");
  }

  async tauriScreenshot(): Promise<ScreenshotResult> {
    return {
      artifactId: "screenshot-0003",
      sessionId: this.session.id,
      path: "/tmp/tauri-screenshot.png",
      width: 1440,
      height: 900,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      display: this.session.display,
      sequence: 3,
      label: "tauri-fallback"
    };
  }

  async closeTauriApp(): Promise<void> {
    return;
  }

  async getElectronDriverStatus(): Promise<ElectronDriverStatus> {
    return {
      available: true,
      playwrightAvailable: true,
      electronBinaryPath: "/tmp/electron",
      warnings: [],
      errors: []
    };
  }

  async openElectronApp(): Promise<ElectronAppRef> {
    return {
      sessionId: this.session.id,
      appId: "electron-app-1",
      processId: 789,
      createdAt: "2026-01-01T00:00:00.000Z",
      mode: "playwright-electron",
      windowTitle: "Agent Desktop Harness Electron Demo",
      warnings: []
    };
  }

  async electronClick(): Promise<ElectronActionResult> {
    return this.electronResult("electron.click");
  }

  async electronFill(): Promise<ElectronActionResult> {
    return this.electronResult("electron.fill", {
      redacted: true,
      valueLength: 12
    });
  }

  async electronPress(): Promise<ElectronActionResult> {
    return this.electronResult("electron.press");
  }

  async electronAssertText(): Promise<ElectronActionResult> {
    return this.electronResult("electron.assert_text");
  }

  async electronScreenshot(): Promise<ScreenshotResult> {
    return {
      artifactId: "screenshot-0004",
      sessionId: this.session.id,
      path: "/tmp/electron-screenshot.png",
      width: 1440,
      height: 900,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      display: this.session.display,
      sequence: 4,
      label: "electron-semantic"
    };
  }

  async closeElectronApp(): Promise<void> {
    return;
  }

  async getLiveObserverStatus(): Promise<LiveObserverStatus> {
    return {
      available: true,
      x11vncPath: "/usr/bin/x11vnc",
      websockifyPath: "/usr/bin/websockify",
      novncProxyPath: "/usr/bin/novnc_proxy",
      novncPath: "/usr/bin/novnc_proxy",
      noVncWebRootPath: "/usr/share/novnc",
      warnings: [],
      errors: [],
      installHints: ["sudo apt install -y x11vnc novnc websockify"]
    };
  }

  async startLiveObserver(): Promise<LiveObserverRef> {
    return this.liveObserver();
  }

  async stopLiveObserver(): Promise<{
    readonly sessionId: SessionId;
    readonly observerId: string;
    readonly stopped: boolean;
  }> {
    return {
      sessionId: this.session.id,
      observerId: "observer-1",
      stopped: true
    };
  }

  listLiveObservers(): LiveObserverRef[] {
    return [this.liveObserver()];
  }

  async getDriverRouterStatus(): Promise<DriverRouterStatus> {
    return {
      browser: {
        available: true,
        driver: "browser-playwright",
        warnings: [],
        errors: []
      },
      tauri: {
        available: false,
        driver: "tauri-webdriver",
        experimental: true,
        warnings: [],
        errors: ["tauri-driver is missing."]
      },
      electron: {
        available: true,
        driver: "electron-playwright",
        experimental: true,
        warnings: [],
        errors: []
      },
      x11Fallback: {
        available: true,
        driver: "x11-fallback",
        warnings: [],
        errors: []
      }
    };
  }

  async routeDriver(
    _sessionId: SessionId,
    request: DriverRouteRequest
  ): Promise<DriverRouteDecision> {
    return {
      appKind: request.appKind,
      selectedDriver: request.appKind === "browser" ? "browser-playwright" : "x11-fallback",
      selectionMode: request.preferredDriver ? "explicit" : "auto",
      semantic: request.appKind === "browser",
      fallbackUsed: request.appKind !== "browser",
      fallbackReason: request.appKind === "browser" ? undefined : "semantic driver unavailable",
      warnings: [],
      errors: []
    };
  }

  async openApp(): Promise<AppRef> {
    return {
      sessionId: this.session.id,
      appId: "app-1",
      appKind: "browser",
      selectedDriver: "browser-playwright",
      semantic: true,
      fallbackUsed: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      warnings: []
    };
  }

  async appClick(): Promise<AppActionResult> {
    return this.appResult("app.click");
  }

  async appFill(): Promise<AppActionResult> {
    return this.appResult("app.fill", {
      redacted: true,
      valueLength: 12
    });
  }

  async appPress(): Promise<AppActionResult> {
    return this.appResult("app.press");
  }

  async appAssertText(): Promise<AppActionResult> {
    return this.appResult("app.assert_text");
  }

  async appScreenshot(): Promise<ScreenshotResult> {
    return {
      artifactId: "screenshot-0005",
      sessionId: this.session.id,
      path: "/tmp/app-screenshot.png",
      width: 1440,
      height: 900,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      display: this.session.display,
      sequence: 5,
      label: "router"
    };
  }

  async closeApp(): Promise<void> {
    return;
  }

  async visualCompare(): Promise<VisualCompareResult> {
    return this.visualResult("compare", undefined);
  }

  async visualAssertChanged(): Promise<VisualCompareResult> {
    return this.visualResult("assert-changed", true);
  }

  async visualAssertSimilar(): Promise<VisualCompareResult> {
    return this.visualResult("assert-similar", true);
  }

  async saveVisualBaseline(): Promise<VisualBaselineRef> {
    return this.visualBaseline();
  }

  async listVisualBaselines(): Promise<VisualBaselineRef[]> {
    return [this.visualBaseline()];
  }

  async compareVisualBaseline(): Promise<VisualCompareResult> {
    return {
      ...this.visualResult("compare-baseline", true),
      baselineName: "sample-vite-clean",
      baselineSuite: "smoke"
    };
  }

  async getAnnotationRegion(): Promise<AnnotationRegionResult> {
    return {
      annotationId: "ann_001",
      region: {
        x: 1,
        y: 2,
        width: 3,
        height: 4
      },
      screenshotPath: `${this.session.evidencePath}/screenshots/0001-demo.png`,
      note: "Button overlaps this text."
    };
  }

  async visualAssertAnnotationChanged(): Promise<VisualCompareResult> {
    return {
      ...this.visualResult("assert-annotation-changed", true),
      annotationId: "ann_001",
      annotationNote: "Button overlaps this text."
    };
  }

  async visualAssertAnnotationSimilar(): Promise<VisualCompareResult> {
    return {
      ...this.visualResult("assert-annotation-similar", true),
      annotationId: "ann_001",
      annotationNote: "Button overlaps this text."
    };
  }

  async visualAssertChangeContained(): Promise<VisualChangeContainmentResult> {
    return {
      ...this.visualResult("assert-change-contained", true),
      allowedRegions: [
        {
          x: 1,
          y: 2,
          width: 3,
          height: 4
        }
      ],
      insideComparedPixels: 12,
      insideDiffPixels: 4,
      insideDiffPixelRatio: 0.3333333333333333,
      outsideComparedPixels: 88,
      outsideDiffPixels: 0,
      outsideDiffPixelRatio: 0,
      containmentPassed: true
    };
  }

  async listVisualAssertions(): Promise<VisualCompareResult[]> {
    return [this.visualResult("assert-changed", true)];
  }

  getVisualDiffFilePath(): string {
    return this.visualDiffFilePath ?? `${this.session.evidencePath}/visual-diffs/diff_001-router.png`;
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

  private browserResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {}
  ): BrowserActionResult {
    return {
      sessionId: this.session.id,
      pageId: "page-1",
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: true,
      details
    };
  }

  private tauriResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {}
  ): TauriActionResult {
    return {
      sessionId: this.session.id,
      appId: "tauri-app-1",
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: false,
      mode: "x11-fallback",
      details: {
        unavailable: true,
        ...details
      },
      warnings: ["Tauri WebDriver semantic mode is unavailable; use desktop_* X11 fallback tools."]
    };
  }

  private electronResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {}
  ): ElectronActionResult {
    return {
      sessionId: this.session.id,
      appId: "electron-app-1",
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: true,
      mode: "playwright-electron",
      details
    };
  }

  private appResult(
    actionType: string,
    details: Readonly<Record<string, unknown>> = {}
  ): AppActionResult {
    return {
      sessionId: this.session.id,
      appId: "app-1",
      appKind: "browser",
      selectedDriver: "browser-playwright",
      semantic: true,
      fallbackUsed: false,
      actionType,
      createdAt: "2026-01-01T00:00:00.000Z",
      success: true,
      warnings: [],
      details
    };
  }

  private visualResult(
    kind:
      | "compare"
      | "assert-changed"
      | "assert-similar"
      | "compare-baseline"
      | "assert-annotation-changed"
      | "assert-annotation-similar"
      | "assert-change-contained",
    passed: boolean | undefined
  ): VisualCompareResult {
    return {
      sessionId: this.session.id,
      label: "router",
      kind,
      beforePath: `${this.session.evidencePath}/screenshots/0001-before.png`,
      afterPath: `${this.session.evidencePath}/screenshots/0002-after.png`,
      diffPath: `${this.session.evidencePath}/visual-diffs/diff_001-router.png`,
      width: 10,
      height: 10,
      comparedPixels: 100,
      diffPixels: 4,
      diffPixelRatio: 0.04,
      threshold: 0.1,
      minDiffPixelRatio: kind === "assert-changed" ? 0.01 : undefined,
      maxDiffPixelRatio: kind === "assert-similar" ? 0.1 : undefined,
      passed,
      createdAt: "2026-01-01T00:00:00.000Z",
      warnings: []
    };
  }

  private visualBaseline(): VisualBaselineRef {
    return {
      name: "sample-vite-clean",
      suite: "smoke",
      path: `${this.session.evidencePath}/../../baselines/smoke/sample-vite-clean.png`,
      sourceScreenshotPath: `${this.session.evidencePath}/screenshots/0001-before.png`,
      width: 10,
      height: 10,
      createdAt: "2026-01-01T00:00:00.000Z"
    };
  }

  private liveObserver(): LiveObserverRef {
    return {
      sessionId: this.session.id,
      observerId: "observer-1",
      host: "127.0.0.1",
      vncPort: 5901,
      webPort: 6081,
      viewOnly: true,
      url: "http://127.0.0.1:6081/vnc.html?autoconnect=1&resize=scale&view_only=1",
      createdAt: "2026-01-01T00:00:00.000Z",
      warnings: []
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
