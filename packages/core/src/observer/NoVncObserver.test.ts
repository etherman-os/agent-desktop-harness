import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  allocateTcpPort,
  buildNoVncProxyArgs,
  buildWebsockifyArgs,
  buildX11VncArgs,
  makeNoVncUrl,
  normalizeObserverHost,
  redactObserverStartDetails
} from "./NoVncObserver.js";
import { getLiveObserverStatus } from "./observerStatus.js";

test("observer command builders keep services local and view-only by default", () => {
  assert.deepEqual(
    buildX11VncArgs({
      display: ":191",
      vncPort: 5901,
      viewOnly: true
    }),
    [
      "-display",
      ":191",
      "-rfbport",
      "5901",
      "-localhost",
      "-forever",
      "-shared",
      "-quiet",
      "-viewonly",
      "-nopw"
    ]
  );

  assert.deepEqual(buildNoVncProxyArgs({ host: "127.0.0.1", webPort: 6081, vncPort: 5901 }), [
    "--listen",
    "127.0.0.1:6081",
    "--vnc",
    "127.0.0.1:5901"
  ]);

  assert.deepEqual(
    buildWebsockifyArgs({
      host: "127.0.0.1",
      webPort: 6081,
      vncPort: 5901,
      noVncWebRootPath: "/usr/share/novnc"
    }),
    ["--web", "/usr/share/novnc", "127.0.0.1:6081", "127.0.0.1:5901"]
  );
});

test("observer rejects non-local hosts and builds noVNC URL", () => {
  assert.equal(normalizeObserverHost(undefined), "127.0.0.1");
  assert.throws(() => normalizeObserverHost("0.0.0.0"), /local-only/);

  assert.equal(
    makeNoVncUrl("127.0.0.1", 6081, true),
    "http://127.0.0.1:6081/vnc.html?autoconnect=1&resize=scale&view_only=1"
  );
});

test("observer status detects binaries and noVNC web root", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-desktop-harness-observer-status-"));
  const bin = join(root, "bin");
  const webRoot = join(root, "novnc");

  try {
    await mkdir(bin);
    await mkdir(webRoot);
    await makeExecutable(join(bin, "x11vnc"));
    await makeExecutable(join(bin, "websockify"));
    await writeFile(join(webRoot, "vnc.html"), "<html>noVNC</html>");

    const status = await getLiveObserverStatus({
      env: {
        PATH: bin
      },
      noVncWebRootCandidates: [webRoot]
    });

    assert.equal(status.available, true);
    assert.equal(status.x11vncPath, join(bin, "x11vnc"));
    assert.equal(status.websockifyPath, join(bin, "websockify"));
    assert.equal(status.noVncWebRootPath, webRoot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("observer status reports unavailable dependencies clearly", async () => {
  const status = await getLiveObserverStatus({
    env: {
      PATH: ""
    },
    noVncWebRootCandidates: []
  });

  assert.equal(status.available, false);
  assert.match(status.errors.join("\n"), /x11vnc is missing/);
  assert.match(status.errors.join("\n"), /novnc_proxy or websockify is missing/);
});

test("observer start detail redaction omits raw password", () => {
  const details = redactObserverStartDetails({
    password: "secret-value",
    vncPort: 5901,
    webPort: 6081
  });

  assert.equal(details.passwordProvided, true);
  assert.equal(JSON.stringify(details).includes("secret-value"), false);
});

test("observer port allocator returns an available local TCP port", async () => {
  const port = await allocateTcpPort("127.0.0.1");
  assert.equal(Number.isInteger(port), true);
  assert.equal(port > 0, true);
});

async function makeExecutable(path: string): Promise<void> {
  await writeFile(path, "#!/usr/bin/env sh\nexit 0\n");
  await chmod(path, 0o755);
}
