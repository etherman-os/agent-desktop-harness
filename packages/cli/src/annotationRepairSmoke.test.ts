import assert from "node:assert/strict";
import test from "node:test";
import {
  createRepairDemoAnnotationPayload,
  ensureAnnotationRepairSmokeReady,
  parseSmokeAnnotationRepairArgs,
  REPAIR_DEMO_ANNOTATION_RECT,
} from "./annotationRepairSmoke.js";
import type { DoctorReport } from "./doctor.js";

test("parseSmokeAnnotationRepairArgs uses stable local defaults", () => {
  const parsed = parseSmokeAnnotationRepairArgs([]);

  assert.equal(parsed.vitePort, 5180);
  assert.equal(parsed.httpPort, 7354);
  assert.ok(parsed.workspacePath.length > 0);
});

test("parseSmokeAnnotationRepairArgs validates ports", () => {
  assert.throws(() => parseSmokeAnnotationRepairArgs(["--vite-port", "0"]), /Invalid port/);
  assert.throws(() => parseSmokeAnnotationRepairArgs(["--http-port", "70000"]), /Invalid port/);
});

test("repair demo annotation rectangle is configured for a visible area", () => {
  assert.equal(REPAIR_DEMO_ANNOTATION_RECT.x > 0, true);
  assert.equal(REPAIR_DEMO_ANNOTATION_RECT.y > 0, true);
  assert.equal(REPAIR_DEMO_ANNOTATION_RECT.width > 100, true);
  assert.equal(REPAIR_DEMO_ANNOTATION_RECT.height > 80, true);
});

test("createRepairDemoAnnotationPayload builds a valid synthetic annotation", () => {
  const payload = createRepairDemoAnnotationPayload("0003-repair-demo-before-annotation.png");

  assert.equal(payload.screenshotFileName, "0003-repair-demo-before-annotation.png");
  assert.equal(payload.type, "rectangle");
  assert.equal(payload.note.includes("overlapping badge"), true);
  assert.equal(payload.cropPngBase64.startsWith("data:image/png;base64,"), true);
});

test("ensureAnnotationRepairSmokeReady fails when required dependencies are missing", () => {
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

  assert.throws(
    () => ensureAnnotationRepairSmokeReady(report),
    /Missing required dependencies: Xvfb/,
  );
});
