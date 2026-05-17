import assert from "node:assert/strict";
import test from "node:test";
import {
  DOCTOR_DEPENDENCIES,
  formatDoctorText,
  formatMissingRequiredMessage,
  runDoctor,
  type DoctorReport
} from "./doctor.js";

test("runDoctor returns machine-readable dependency statuses", async () => {
  const report = await runDoctor(
    [
      {
        name: "definitely-not-agent-desktop-harness-binary",
        level: "required",
        installHint: "sudo apt install -y missing"
      }
    ],
    { PATH: "" }
  );

  assert.equal(report.ready, false);
  assert.equal(report.status, "not_ready");
  assert.deepEqual(report.dependencies, [
    {
      name: "definitely-not-agent-desktop-harness-binary",
      level: "required",
      installHint: "sudo apt install -y missing",
      found: false,
      path: undefined
    }
  ]);
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
        path: "/usr/bin/Xvfb"
      },
      {
        name: "scrot",
        level: "required",
        installHint: "sudo apt install -y scrot",
        found: false
      },
      {
        name: "openbox",
        level: "recommended",
        installHint: "sudo apt install -y openbox",
        found: false
      },
      {
        name: "xterm",
        level: "optional",
        installHint: "sudo apt install -y xterm",
        found: false
      }
    ]
  };

  const text = formatDoctorText(report);

  assert.match(text, /Agent Desktop Harness Doctor/);
  assert.match(text, /Required dependencies:/);
  assert.match(text, /Xvfb\s+OK\s+\/usr\/bin\/Xvfb/);
  assert.match(text, /scrot\s+MISSING\s+install with: sudo apt install -y scrot/);
  assert.match(text, /Recommended dependencies:/);
  assert.match(text, /Optional smoke dependencies:/);
  assert.match(text, /Status: not_ready/);
});

test("dependency install hints map to the expected Ubuntu packages", () => {
  const hints = new Map(
    DOCTOR_DEPENDENCIES.map((dependency) => [
      dependency.name,
      dependency.installHint
    ])
  );

  assert.equal(hints.get("Xvfb"), "sudo apt install -y xvfb");
  assert.equal(hints.get("xdpyinfo"), "sudo apt install -y x11-utils");
  assert.equal(hints.get("scrot"), "sudo apt install -y scrot");
  assert.equal(hints.get("xdotool"), "sudo apt install -y xdotool");
  assert.equal(hints.get("wmctrl"), "sudo apt install -y wmctrl");
  assert.equal(hints.get("openbox"), "sudo apt install -y openbox");
  assert.equal(hints.get("xterm"), "sudo apt install -y xterm");
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
        found: false
      }
    ]
  };

  const message = formatMissingRequiredMessage(report);

  assert.match(message, /Missing required dependencies: Xvfb/);
  assert.match(message, /scripts\/install-ubuntu-deps\.sh/);
  assert.match(message, /Xvfb: sudo apt install -y xvfb/);
});
