import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DoctorReport } from "./doctor.js";
import {
  parseStudioCaptureContractArgs,
  runSmokeStudioCaptureContract,
} from "./studioCaptureContractSmoke.js";

test("parseStudioCaptureContractArgs uses deterministic output defaults", () => {
  const parsed = parseStudioCaptureContractArgs([]);

  assert.equal(parsed.title, "Hermes Studio Capture Contract");
  assert.equal(parsed.port, 0);
  assert.equal(parsed.width, 1280);
  assert.equal(parsed.height, 800);
  assert.match(parsed.outputPath, /\.desktop-harness\/studio-capture-contract\/screenshot\.png$/);
});

test("parseStudioCaptureContractArgs accepts explicit contract options", () => {
  const parsed = parseStudioCaptureContractArgs([
    "--workspace",
    "/tmp/workspace",
    "--output",
    "/tmp/output.png",
    "--title",
    "Custom Contract",
    "--port",
    "7361",
    "--width",
    "1024",
    "--height",
    "768",
  ]);

  assert.equal(parsed.workspacePath, "/tmp/workspace");
  assert.equal(parsed.outputPath, "/tmp/output.png");
  assert.equal(parsed.title, "Custom Contract");
  assert.equal(parsed.port, 7361);
  assert.equal(parsed.width, 1024);
  assert.equal(parsed.height, 768);
});

test("parseStudioCaptureContractArgs requires png output", () => {
  assert.throws(
    () => parseStudioCaptureContractArgs(["--output", "/tmp/output.txt"]),
    /--output must point to a \.png file/,
  );
});

test("runSmokeStudioCaptureContract returns structured failure when required dependencies are missing", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "studio-capture-contract-test-"));
  const outputPath = join(tempDir, "contract.png");
  const doctorReport: DoctorReport = {
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

  try {
    const result = await runSmokeStudioCaptureContract(["--output", outputPath], {
      doctorReport,
      detectBrowser: async () => {
        throw new Error("detectBrowser should not run when required dependencies are missing");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.type, "screenshot");
    assert.equal(result.local_path, outputPath);
    assert.equal(result.metadata.verified_exists, false);
    assert.match(result.errors.join("\n"), /Missing required dependencies: Xvfb/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
