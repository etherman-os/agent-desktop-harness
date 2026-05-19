import test from "node:test";
import assert from "node:assert/strict";
import {
  appClickBodySchema,
  appFillBodySchema,
  appOpenBodySchema,
  appPressBodySchema,
  appScreenshotBodySchema,
  compareVisualBaselineBodySchema,
  browserClickBodySchema,
  browserFillBodySchema,
  browserOpenBodySchema,
  browserPressBodySchema,
  browserScreenshotBodySchema,
  clickBodySchema,
  createAnnotationBodySchema,
  createSessionBodySchema,
  electronClickBodySchema,
  electronFillBodySchema,
  electronOpenBodySchema,
  electronPressBodySchema,
  electronScreenshotBodySchema,
  driverRouteBodySchema,
  focusWindowBodySchema,
  hotkeyBodySchema,
  launchBodySchema,
  scrollBodySchema,
  tauriClickBodySchema,
  tauriFillBodySchema,
  tauriOpenBodySchema,
  tauriScreenshotBodySchema,
  visualAssertChangedBodySchema,
  visualAssertAnnotationChangedBodySchema,
  visualAssertAnnotationSimilarBodySchema,
  visualAssertChangeContainedBodySchema,
  visualAssertSimilarBodySchema,
  visualCompareBodySchema,
  saveVisualBaselineBodySchema,
  startLiveObserverBodySchema,
  waitForStableScreenBodySchema,
  waitForWindowBodySchema
} from "./schemas.js";

test("createSessionBodySchema rejects invalid dimensions", () => {
  assert.throws(() => {
    createSessionBodySchema.parse({
      width: 0
    });
  }, /Too small/);
});

test("launchBodySchema requires a non-empty command", () => {
  assert.throws(() => {
    launchBodySchema.parse({
      command: "",
      args: ["run", "dev"]
    });
  });
});

test("clickBodySchema requires finite coordinates", () => {
  assert.throws(() => {
    clickBodySchema.parse({
      x: Number.NaN,
      y: 100
    });
  });
});

test("hotkeyBodySchema requires a non-empty key list", () => {
  assert.throws(() => {
    hotkeyBodySchema.parse({
      keys: []
    });
  }, /Too small/);
});

test("scrollBodySchema restricts direction", () => {
  assert.throws(() => {
    scrollBodySchema.parse({
      direction: "forward"
    });
  });
});

test("focusWindowBodySchema requires at least one selector", () => {
  assert.throws(() => {
    focusWindowBodySchema.parse({});
  }, /focusWindow requires/);
});

test("stable screen and wait-for-window schemas accept hardening options", () => {
  assert.equal(
    waitForStableScreenBodySchema.parse({
      mode: "tolerant",
      fileSizeToleranceBytes: 2048,
      retainOnlyLast: true
    }).mode,
    "tolerant"
  );

  assert.equal(
    waitForWindowBodySchema.parse({
      titleIncludes: "Demo",
      titleExcludes: ["DevTools"],
      excludeDevtools: true,
      preferLargest: true
    }).excludeDevtools,
    true
  );
});

test("browser semantic schemas validate required fields and selector targets", () => {
  assert.equal(
    browserOpenBodySchema.parse({
      url: "http://127.0.0.1:5179",
      browserName: "chromium",
      viewport: {
        width: 1440,
        height: 900
      }
    }).url,
    "http://127.0.0.1:5179"
  );

  assert.throws(() => {
    browserOpenBodySchema.parse({
      url: "not-a-url"
    });
  });

  assert.throws(() => {
    browserClickBodySchema.parse({
      timeoutMs: 1000
    });
  }, /browser click requires/);

  assert.equal(
    browserClickBodySchema.parse({
      role: "button",
      name: "Save message"
    }).role,
    "button"
  );

  assert.equal(
    browserFillBodySchema.parse({
      placeholder: "Type a message",
      value: "hello",
      secret: true
    }).secret,
    true
  );

  assert.throws(() => {
    browserFillBodySchema.parse({
      placeholder: "Type a message"
    });
  });

  assert.equal(
    browserPressBodySchema.parse({
      selector: "#message",
      key: "Enter"
    }).key,
    "Enter"
  );

  assert.equal(
    browserScreenshotBodySchema.parse({
      label: "browser-result",
      fullPage: true
    }).fullPage,
    true
  );
});

test("tauri experimental schemas validate command fields and selector targets", () => {
  assert.equal(
    tauriOpenBodySchema.parse({
      command: "pnpm",
      args: ["tauri", "dev"],
      cwd: "/tmp/app",
      webdriverPort: 4444,
      applicationPath: "/tmp/app/src-tauri/target/debug/app"
    }).command,
    "pnpm"
  );

  assert.throws(() => {
    tauriOpenBodySchema.parse({
      command: "",
      args: ["tauri", "dev"]
    });
  });

  assert.throws(() => {
    tauriClickBodySchema.parse({
      timeoutMs: 1000
    });
  }, /tauri click requires/);

  assert.equal(
    tauriClickBodySchema.parse({
      role: "button",
      name: "Save message"
    }).role,
    "button"
  );

  assert.equal(
    tauriFillBodySchema.parse({
      placeholder: "Type a message",
      value: "hello",
      secret: true
    }).secret,
    true
  );

  assert.equal(
    tauriScreenshotBodySchema.parse({
      appId: "tauri-app-1",
      label: "tauri-fallback"
    }).appId,
    "tauri-app-1"
  );
});

test("electron experimental schemas validate launch fields and selector targets", () => {
  assert.equal(
    electronOpenBodySchema.parse({
      command: "electron",
      args: ["."],
      cwd: "/tmp/app",
      windowTitleIncludes: "Demo"
    }).command,
    "electron"
  );

  assert.equal(
    electronOpenBodySchema.parse({
      executablePath: "/tmp/node_modules/.bin/electron",
      appPath: "/tmp/app/main.js"
    }).executablePath,
    "/tmp/node_modules/.bin/electron"
  );

  assert.throws(() => {
    electronOpenBodySchema.parse({
      args: ["."]
    });
  }, /electron open requires/);

  assert.throws(() => {
    electronClickBodySchema.parse({
      timeoutMs: 1000
    });
  }, /electron click requires/);

  assert.equal(
    electronClickBodySchema.parse({
      role: "button",
      name: "Save message"
    }).role,
    "button"
  );

  assert.equal(
    electronFillBodySchema.parse({
      placeholder: "Type a message",
      value: "hello",
      secret: true
    }).secret,
    true
  );

  assert.equal(
    electronPressBodySchema.parse({
      selector: "#message-input",
      key: "Enter"
    }).key,
    "Enter"
  );

  assert.equal(
    electronScreenshotBodySchema.parse({
      appId: "electron-app-1",
      label: "electron-semantic",
      fullPage: true
    }).appId,
    "electron-app-1"
  );
});

test("observer schema accepts local start options and rejects extra fields", () => {
  const parsed = startLiveObserverBodySchema.parse({
    host: "127.0.0.1",
    vncPort: 5901,
    webPort: 6081,
    viewOnly: true,
    password: "secret-value",
    label: "observer"
  });

  assert.equal(parsed.host, "127.0.0.1");
  assert.equal(parsed.viewOnly, true);

  assert.throws(() => {
    startLiveObserverBodySchema.parse({
      host: "127.0.0.1",
      unsafe: true
    });
  });
});

test("driver router schemas validate app kinds, drivers, and router targets", () => {
  assert.equal(
    driverRouteBodySchema.parse({
      appKind: "browser",
      requireSemantic: true
    }).appKind,
    "browser"
  );

  assert.throws(() => {
    driverRouteBodySchema.parse({
      appKind: "mobile"
    });
  });

  assert.equal(
    appOpenBodySchema.parse({
      appKind: "browser",
      url: "http://127.0.0.1:5179",
      preferredDriver: "browser-playwright",
      requireSemantic: true
    }).preferredDriver,
    "browser-playwright"
  );

  assert.throws(() => {
    appOpenBodySchema.parse({
      appKind: "browser",
      url: "not-a-url"
    });
  });

  assert.throws(() => {
    appClickBodySchema.parse({
      timeoutMs: 1000
    });
  }, /app click requires/);

  assert.equal(
    appClickBodySchema.parse({
      x: 10,
      y: 20,
      button: "left"
    }).button,
    "left"
  );

  assert.equal(
    appFillBodySchema.parse({
      placeholder: "Type a message",
      value: "hello",
      secret: true
    }).secret,
    true
  );

  assert.equal(
    appPressBodySchema.parse({
      key: "Enter",
      selector: "#message"
    }).key,
    "Enter"
  );

  assert.equal(
    appScreenshotBodySchema.parse({
      label: "router-result",
      fullPage: true
    }).fullPage,
    true
  );
});

test("visual QA schemas validate paths, regions, and ratios", () => {
  assert.equal(
    visualCompareBodySchema.parse({
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      label: "before-after",
      threshold: 0.1,
      maxDiffPixelRatio: 0.2,
      createDiffImage: true
    }).createDiffImage,
    true
  );

  assert.equal(
    visualAssertChangedBodySchema.parse({
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      minDiffPixelRatio: 0.01,
      region: {
        x: 10,
        y: 20,
        width: 30,
        height: 40
      }
    }).region?.width,
    30
  );

  assert.equal(
    visualAssertSimilarBodySchema.parse({
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      maxDiffPixelRatio: 0.05
    }).maxDiffPixelRatio,
    0.05
  );

  assert.throws(() => {
    visualCompareBodySchema.parse({
      beforePath: "",
      afterPath: "screenshots/0002-after.png"
    });
  });

  assert.throws(() => {
    visualAssertSimilarBodySchema.parse({
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      maxDiffPixelRatio: 2
    });
  });

  assert.throws(() => {
    visualAssertChangedBodySchema.parse({
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      region: {
        x: 0,
        y: 0,
        width: 0,
        height: 10
      }
    });
  });

  assert.equal(
    saveVisualBaselineBodySchema.parse({
      screenshotPath: "screenshots/0001-before.png",
      name: "sample-vite-clean",
      suite: "smoke",
      overwrite: true,
      metadata: {
        purpose: "smoke"
      }
    }).suite,
    "smoke"
  );

  assert.equal(
    compareVisualBaselineBodySchema.parse({
      screenshotPath: "screenshots/0002-current.png",
      baselineName: "sample-vite-clean",
      suite: "smoke",
      maxDiffPixelRatio: 0.01,
      createDiffImage: true
    }).baselineName,
    "sample-vite-clean"
  );

  assert.equal(
    visualAssertAnnotationChangedBodySchema.parse({
      annotationId: "ann_001",
      afterPath: "screenshots/0002-after.png",
      padding: 4,
      minDiffPixelRatio: 0.01
    }).padding,
    4
  );

  assert.equal(
    visualAssertAnnotationSimilarBodySchema.parse({
      annotationId: "ann_001",
      afterPath: "screenshots/0002-after.png",
      maxDiffPixelRatio: 0.01
    }).annotationId,
    "ann_001"
  );

  assert.equal(
    visualAssertChangeContainedBodySchema.parse({
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
      maxOutsideDiffPixelRatio: 0.001
    }).allowedRegions.length,
    1
  );

  assert.throws(() => {
    visualAssertChangeContainedBodySchema.parse({
      beforePath: "screenshots/0001-before.png",
      afterPath: "screenshots/0002-after.png",
      allowedRegions: []
    });
  });
});

test("createAnnotationBodySchema rejects traversal and invalid rectangles", () => {
  assert.throws(() => {
    createAnnotationBodySchema.parse({
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
    createAnnotationBodySchema.parse({
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
