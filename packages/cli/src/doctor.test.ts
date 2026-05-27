import assert from "node:assert/strict";
import test from "node:test";
import {
  DOCTOR_DEPENDENCIES,
  type DoctorReport,
  formatDoctorText,
  formatMissingRequiredMessage,
  getTauriDriverDependencyStatuses,
  runDoctor,
} from "./doctor.js";

test("runDoctor returns machine-readable dependency statuses", async () => {
  const report = await runDoctor(
    [
      {
        name: "definitely-not-agent-desktop-harness-binary",
        level: "required",
        installHint: "sudo apt install -y missing",
      },
    ],
    { PATH: "" },
  );

  assert.equal(report.ready, false);
  assert.equal(report.status, "not_ready");
  assert.deepEqual(report.dependencies, [
    {
      name: "definitely-not-agent-desktop-harness-binary",
      level: "required",
      installHint: "sudo apt install -y missing",
      found: false,
      path: undefined,
    },
  ]);
  assert.equal(report.experimental?.tauriDriver.available, false);
});

test("formatDoctorText includes human-readable sections and status", () => {
  const report: DoctorReport = {
    ready: false,
    status: "not_ready",
    dependencies: [
      {
        name: "Xvfb",
        level: "required",
        installHint: "sudo apt install -y xvfb",
        found: true,
        path: "/usr/bin/Xvfb",
      },
      {
        name: "scrot",
        level: "required",
        installHint: "sudo apt install -y scrot",
        found: false,
      },
      {
        name: "openbox",
        level: "recommended",
        installHint: "sudo apt install -y openbox",
        found: false,
      },
      {
        name: "xterm",
        level: "optional",
        installHint: "sudo apt install -y xterm",
        found: false,
      },
      {
        name: "tauri-driver",
        level: "experimental",
        installHint: "cargo install tauri-driver --locked",
        found: false,
      },
      {
        name: "WebKitWebDriver",
        level: "experimental",
        installHint:
          "Install the WebKit WebDriver package for your distribution; package names vary.",
        found: false,
      },
      {
        name: "cargo",
        level: "experimental",
        installHint: "Install Rust and Cargo from your distribution packages or rustup.",
        found: true,
        path: "/usr/bin/cargo",
      },
      {
        name: "x11vnc",
        level: "observer",
        installHint: "sudo apt install -y x11vnc",
        found: false,
      },
      {
        name: "websockify",
        level: "observer",
        installHint: "sudo apt install -y websockify",
        found: false,
      },
      {
        name: "novnc_proxy",
        level: "observer",
        installHint: "sudo apt install -y novnc",
        found: false,
      },
    ],
    experimental: {
      tauriDriver: {
        available: false,
        dependencies: [],
        warnings: [],
        errors: ["tauri-driver is missing."],
      },
      electronDriver: {
        available: true,
        playwrightAvailable: true,
        electronBinaryPath: "/tmp/node_modules/.bin/electron",
        warnings: [],
        errors: [],
      },
    },
    optional: {
      liveObserver: {
        available: false,
        warnings: [],
        errors: ["x11vnc is missing."],
        installHints: ["sudo apt install -y x11vnc novnc websockify"],
      },
    },
  };

  const text = formatDoctorText(report);

  assert.match(text, /Agent Desktop Harness Doctor/);
  assert.match(text, /Required dependencies:/);
  assert.match(text, /Xvfb\s+OK\s+\/usr\/bin\/Xvfb/);
  assert.match(text, /scrot\s+MISSING\s+install with: sudo apt install -y scrot/);
  assert.match(text, /Recommended dependencies:/);
  assert.match(text, /Optional smoke dependencies:/);
  assert.match(text, /Optional live observer dependencies:/);
  assert.match(text, /x11vnc\s+MISSING/);
  assert.match(text, /Live observer path: unavailable/);
  assert.match(text, /Experimental Tauri driver dependencies:/);
  assert.match(text, /tauri-driver\s+MISSING/);
  assert.match(text, /Tauri WebDriver semantic path: unavailable/);
  assert.match(text, /Experimental Electron driver:/);
  assert.match(text, /playwright electron API: OK/);
  assert.match(text, /electron binary: OK\s+\/tmp\/node_modules\/\.bin\/electron/);
  assert.match(text, /Electron Playwright semantic path: available/);
  assert.match(text, /Status: not_ready/);
});

test("dependency install hints map to the expected Ubuntu packages", () => {
  const hints = new Map(
    DOCTOR_DEPENDENCIES.map((dependency) => [dependency.name, dependency.installHint]),
  );

  assert.equal(hints.get("Xvfb"), "sudo apt install -y xvfb");
  assert.equal(hints.get("xdpyinfo"), "sudo apt install -y x11-utils");
  assert.equal(hints.get("scrot"), "sudo apt install -y scrot");
  assert.equal(hints.get("xdotool"), "sudo apt install -y xdotool");
  assert.equal(hints.get("wmctrl"), "sudo apt install -y wmctrl");
  assert.equal(hints.get("openbox"), "sudo apt install -y openbox");
  assert.equal(hints.get("xterm"), "sudo apt install -y xterm");
  assert.equal(hints.get("tauri-driver"), "cargo install tauri-driver --locked");
  assert.equal(hints.get("x11vnc"), "sudo apt install -y x11vnc");
  assert.equal(hints.get("websockify"), "sudo apt install -y websockify");
  assert.equal(hints.get("novnc_proxy"), "sudo apt install -y novnc");
});

test("Tauri driver dependencies are experimental and do not block readiness", async () => {
  const report = await runDoctor(
    [
      {
        name: "tauri-driver",
        level: "experimental",
        installHint: "cargo install tauri-driver --locked",
      },
    ],
    { PATH: "" },
  );

  assert.equal(report.ready, true);
  assert.equal(report.status, "ready");
  assert.equal(report.experimental?.tauriDriver.available, false);
  assert.equal(report.experimental?.electronDriver.available, true);
  assert.equal(getTauriDriverDependencyStatuses(report.dependencies).length, 1);
});

test("missing required message lists missing dependencies and hints", () => {
  const report: DoctorReport = {
    ready: false,
    status: "not_ready",
    dependencies: [
      {
        name: "Xvfb",
        level: "required",
        installHint: "sudo apt install -y xvfb",
        found: false,
      },
    ],
  };

  const message = formatMissingRequiredMessage(report);

  assert.match(message, /Missing required dependencies: Xvfb/);
  assert.match(message, /scripts\/install-ubuntu-deps\.sh/);
  assert.match(message, /Xvfb: sudo apt install -y xvfb/);
});
