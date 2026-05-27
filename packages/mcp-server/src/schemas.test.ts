import assert from "node:assert/strict";
import test from "node:test";
import {
  appClickSchema,
  appFillSchema,
  appOpenSchema,
  appPressSchema,
  appScreenshotSchema,
  browserAssertTextSchema,
  browserClickSchema,
  browserCloseSchema,
  browserFillSchema,
  browserOpenSchema,
  clickSchema,
  createAnnotationSchema,
  driverRouteSchema,
  electronAssertTextSchema,
  electronClickSchema,
  electronCloseSchema,
  electronFillSchema,
  electronOpenSchema,
  electronPressSchema,
  focusWindowSchema,
  hotkeySchema,
  launchAppSchema,
  observerListSchema,
  observerStartSchema,
  observerStopSchema,
  scrollSchema,
  startSessionSchema,
  tauriAssertTextSchema,
  tauriClickSchema,
  tauriCloseSchema,
  tauriFillSchema,
  tauriOpenSchema,
  visualAssertAnnotationChangedSchema,
  visualAssertAnnotationSimilarSchema,
  visualAssertChangeContainedSchema,
  visualAssertChangedSchema,
  visualAssertSimilarSchema,
  visualCompareBaselineSchema,
  visualCompareSchema,
  visualSaveBaselineSchema,
  waitForStableScreenSchema,
  waitForWindowSchema,
} from "./schemas.js";

test("startSessionSchema rejects invalid display dimensions", () => {
  assert.throws(() => {
    startSessionSchema.parse({
      width: 0,
    });
  }, /Too small/);
});

test("launchAppSchema requires command and string args", () => {
  assert.throws(() => {
    launchAppSchema.parse({
      sessionId: "session-1",
      command: "",
      args: ["run", 1],
    });
  });
});

test("clickSchema requires finite coordinates", () => {
  assert.throws(() => {
    clickSchema.parse({
      sessionId: "session-1",
      x: Number.POSITIVE_INFINITY,
      y: 10,
    });
  });
});

test("hotkeySchema requires at least one key", () => {
  assert.throws(() => {
    hotkeySchema.parse({
      sessionId: "session-1",
      keys: [],
    });
  }, /Too small/);
});

test("scrollSchema restricts direction", () => {
  assert.throws(() => {
    scrollSchema.parse({
      sessionId: "session-1",
      direction: "forward",
    });
  });
});

test("focusWindowSchema requires at least one target field", () => {
  assert.throws(() => {
    focusWindowSchema.parse({
      sessionId: "session-1",
    });
  }, /focusWindow requires/);
});

test("stable screen and wait-for-window schemas accept hardening options", () => {
  assert.equal(
    waitForStableScreenSchema.parse({
      sessionId: "session-1",
      mode: "tolerant",
      fileSizeToleranceBytes: 2048,
      retainOnlyLast: true,
    }).mode,
    "tolerant",
  );

  assert.equal(
    waitForWindowSchema.parse({
      sessionId: "session-1",
      titleIncludes: "Demo",
      titleExcludes: ["DevTools"],
      excludeDevtools: true,
      preferLargest: true,
    }).preferLargest,
    true,
  );
});

test("tauri experimental tool schemas validate command fields and selector targets", () => {
  assert.equal(
    tauriOpenSchema.parse({
      sessionId: "session-1",
      command: "pnpm",
      args: ["tauri", "dev"],
      cwd: "/tmp/app",
      applicationPath: "/tmp/app/src-tauri/target/debug/app",
    }).command,
    "pnpm",
  );

  assert.throws(() => {
    tauriOpenSchema.parse({
      sessionId: "session-1",
      command: "",
    });
  });

  assert.throws(() => {
    tauriClickSchema.parse({
      sessionId: "session-1",
    });
  }, /tauri click requires/);

  assert.equal(
    tauriClickSchema.parse({
      sessionId: "session-1",
      testId: "save-button",
    }).testId,
    "save-button",
  );

  assert.equal(
    tauriFillSchema.parse({
      sessionId: "session-1",
      label: "Message",
      value: "hello",
      secret: true,
    }).secret,
    true,
  );

  assert.equal(
    tauriAssertTextSchema.parse({
      sessionId: "session-1",
      text: "Ready",
    }).text,
    "Ready",
  );

  assert.equal(
    tauriCloseSchema.parse({
      sessionId: "session-1",
      appId: "tauri-app-1",
    }).appId,
    "tauri-app-1",
  );
});

test("browser semantic tool schemas validate required fields and selector targets", () => {
  assert.equal(
    browserOpenSchema.parse({
      sessionId: "session-1",
      url: "http://127.0.0.1:5179",
      browserExecutablePath: "/usr/bin/google-chrome",
    }).url,
    "http://127.0.0.1:5179",
  );

  assert.throws(() => {
    browserOpenSchema.parse({
      sessionId: "session-1",
      url: "not-a-url",
    });
  });

  assert.throws(() => {
    browserClickSchema.parse({
      sessionId: "session-1",
    });
  }, /browser click requires/);

  assert.equal(
    browserClickSchema.parse({
      sessionId: "session-1",
      testId: "save-button",
    }).testId,
    "save-button",
  );

  assert.equal(
    browserFillSchema.parse({
      sessionId: "session-1",
      label: "Message",
      value: "hello",
      secret: true,
    }).secret,
    true,
  );

  assert.throws(() => {
    browserFillSchema.parse({
      sessionId: "session-1",
      value: "hello",
    });
  }, /browser fill requires/);

  assert.equal(
    browserAssertTextSchema.parse({
      sessionId: "session-1",
      text: "Status: saved",
    }).text,
    "Status: saved",
  );

  assert.equal(
    browserCloseSchema.parse({
      sessionId: "session-1",
      pageId: "page-1",
    }).pageId,
    "page-1",
  );
});

test("electron experimental tool schemas validate launch fields and selector targets", () => {
  assert.equal(
    electronOpenSchema.parse({
      sessionId: "session-1",
      command: "electron",
      args: ["."],
      cwd: "/tmp/app",
      windowTitleIncludes: "Demo",
    }).command,
    "electron",
  );

  assert.equal(
    electronOpenSchema.parse({
      sessionId: "session-1",
      executablePath: "/tmp/node_modules/.bin/electron",
      appPath: "/tmp/app/main.js",
    }).executablePath,
    "/tmp/node_modules/.bin/electron",
  );

  assert.throws(() => {
    electronOpenSchema.parse({
      sessionId: "session-1",
      args: ["."],
    });
  }, /electron open requires/);

  assert.throws(() => {
    electronClickSchema.parse({
      sessionId: "session-1",
    });
  }, /electron click requires/);

  assert.equal(
    electronClickSchema.parse({
      sessionId: "session-1",
      testId: "save-button",
    }).testId,
    "save-button",
  );

  assert.equal(
    electronFillSchema.parse({
      sessionId: "session-1",
      label: "Message",
      value: "hello",
      secret: true,
    }).secret,
    true,
  );

  assert.equal(
    electronPressSchema.parse({
      sessionId: "session-1",
      selector: "#message-input",
      key: "Enter",
    }).key,
    "Enter",
  );

  assert.equal(
    electronAssertTextSchema.parse({
      sessionId: "session-1",
      text: "Ready",
    }).text,
    "Ready",
  );

  assert.equal(
    electronCloseSchema.parse({
      sessionId: "session-1",
      appId: "electron-app-1",
    }).appId,
    "electron-app-1",
  );
});

test("observer tool schemas validate status-free list/start/stop inputs", () => {
  const started = observerStartSchema.parse({
    sessionId: "session-1",
    host: "127.0.0.1",
    vncPort: 5901,
    webPort: 6081,
    viewOnly: true,
    password: "secret-value",
    label: "observer",
  });
  assert.equal(started.sessionId, "session-1");
  assert.equal(started.viewOnly, true);

  assert.equal(observerListSchema.parse({}).sessionId, undefined);
  assert.equal(
    observerStopSchema.parse({
      sessionId: "session-1",
      observerId: "observer-1",
    }).observerId,
    "observer-1",
  );

  assert.throws(() => {
    observerStartSchema.parse({
      sessionId: "session-1",
      vncPort: 0,
    });
  });
});

test("driver router tool schemas validate app kinds, drivers, and router targets", () => {
  assert.equal(
    driverRouteSchema.parse({
      sessionId: "session-1",
      appKind: "browser",
      requireSemantic: true,
    }).appKind,
    "browser",
  );

  assert.throws(() => {
    driverRouteSchema.parse({
      sessionId: "session-1",
      appKind: "mobile",
    });
  });

  assert.equal(
    appOpenSchema.parse({
      sessionId: "session-1",
      appKind: "browser",
      url: "http://127.0.0.1:5179",
      preferredDriver: "browser-playwright",
      requireSemantic: true,
    }).preferredDriver,
    "browser-playwright",
  );

  assert.throws(() => {
    appClickSchema.parse({
      sessionId: "session-1",
    });
  }, /app click requires/);

  assert.equal(
    appClickSchema.parse({
      sessionId: "session-1",
      x: 10,
      y: 20,
      button: "left",
    }).button,
    "left",
  );

  assert.equal(
    appFillSchema.parse({
      sessionId: "session-1",
      placeholder: "Type a message",
      value: "hello",
      secret: true,
    }).secret,
    true,
  );

  assert.equal(
    appPressSchema.parse({
      sessionId: "session-1",
      key: "Enter",
      selector: "#message",
    }).key,
    "Enter",
  );

  assert.equal(
    appScreenshotSchema.parse({
      sessionId: "session-1",
      label: "router-result",
      fullPage: true,
    }).fullPage,
    true,
  );
});

test("visual QA tool schemas validate paths, regions, and ratios", () => {
  assert.equal(
    visualCompareSchema.parse({
      sessionId: "session-1",
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      threshold: 0.1,
      createDiffImage: true,
    }).createDiffImage,
    true,
  );

  assert.equal(
    visualAssertChangedSchema.parse({
      sessionId: "session-1",
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      minDiffPixelRatio: 0.01,
      region: {
        x: 10,
        y: 20,
        width: 30,
        height: 40,
      },
    }).region?.height,
    40,
  );

  assert.equal(
    visualAssertSimilarSchema.parse({
      sessionId: "session-1",
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      maxDiffPixelRatio: 0.05,
    }).maxDiffPixelRatio,
    0.05,
  );

  assert.throws(() => {
    visualCompareSchema.parse({
      sessionId: "session-1",
      beforePath: "",
      afterPath: "screenshots/0002-after.png",
    });
  });

  assert.throws(() => {
    visualAssertSimilarSchema.parse({
      sessionId: "session-1",
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      maxDiffPixelRatio: 2,
    });
  });

  assert.equal(
    visualSaveBaselineSchema.parse({
      sessionId: "session-1",
      screenshotPath: "screenshots/0001-before.png",
      name: "sample-vite-clean",
      suite: "smoke",
      overwrite: true,
    }).name,
    "sample-vite-clean",
  );

  assert.equal(
    visualCompareBaselineSchema.parse({
      sessionId: "session-1",
      screenshotPath: "screenshots/0002-current.png",
      baselineName: "sample-vite-clean",
      maxDiffPixelRatio: 0.01,
    }).baselineName,
    "sample-vite-clean",
  );

  assert.equal(
    visualAssertAnnotationChangedSchema.parse({
      sessionId: "session-1",
      annotationId: "ann_001",
      afterPath: "screenshots/0002-after.png",
      padding: 4,
      minDiffPixelRatio: 0.01,
    }).padding,
    4,
  );

  assert.equal(
    visualAssertAnnotationSimilarSchema.parse({
      sessionId: "session-1",
      annotationId: "ann_001",
      afterPath: "screenshots/0002-after.png",
      maxDiffPixelRatio: 0.01,
    }).annotationId,
    "ann_001",
  );

  assert.equal(
    visualAssertChangeContainedSchema.parse({
      sessionId: "session-1",
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      allowedRegions: [
        {
          x: 1,
          y: 2,
          width: 3,
          height: 4,
        },
      ],
    }).allowedRegions.length,
    1,
  );
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
      note: "bad path",
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
      note: "bad rectangle",
    });
  }, /rectangle annotations/);
});
