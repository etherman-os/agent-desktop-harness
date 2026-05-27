import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

test("Tauri docs describe WebDriver support as experimental", async () => {
  const [readme, workflow, spike, roadmap] = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("docs/TAURI_WORKFLOW.md"),
    readRepoFile("docs/TAURI_DRIVER_SPIKE.md"),
    readRepoFile("docs/ROADMAP.md"),
  ]);
  const combined = [readme, workflow, spike, roadmap].join("\n");

  assert.match(readme, /Tauri X11 fallback\s+\|\s+Verified/);
  assert.match(readme, /Tauri WebDriver driver\s+\|\s+Experimental \/ configured-app verified/);
  assert.match(workflow, /X11 Fallback Remains The Default Reliable Path/);
  assert.match(spike, /## Status\s+Experimental\./i);
  assert.match(spike, /does not claim production-grade Tauri semantic support yet/);
  assert.doesNotMatch(combined, /Tauri WebDriver driver\s+\|\s+Verified/);
});

test("Electron docs describe Playwright support as experimental", async () => {
  const [readme, spike, roadmap, mcp] = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("docs/ELECTRON_DRIVER_SPIKE.md"),
    readRepoFile("docs/ROADMAP.md"),
    readRepoFile("docs/MCP_USAGE.md"),
  ]);
  const combined = [readme, spike, roadmap, mcp].join("\n");

  assert.match(readme, /Electron semantic driver\s+\|\s+Experimental \/ sample verified/);
  assert.match(spike, /## Status\s+Experimental\./i);
  assert.match(spike, /does not claim production-grade packaged Electron support yet/);
  assert.match(roadmap, /Add experimental Playwright Electron readiness detection\. Done\./);
  assert.match(mcp, /Experimental Electron MCP Workflow/);
  assert.doesNotMatch(combined, /Electron Playwright driver\s+\|\s+Verified/);
});

test("driver router docs describe explicit fallback reporting", async () => {
  const [readme, router, roadmap, mcp] = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("docs/DRIVER_ROUTER.md"),
    readRepoFile("docs/ROADMAP.md"),
    readRepoFile("docs/MCP_USAGE.md"),
  ]);

  assert.match(readme, /Driver router\s+\|\s+Verified/);
  assert.match(router, /selectedDriver/);
  assert.match(router, /fallbackUsed/);
  assert.match(router, /X11 fallback currently has no OCR/);
  assert.match(roadmap, /## v0\.2 Driver Router/);
  assert.match(mcp, /Driver Router MCP Workflow/);
});

test("visual QA docs describe screenshot diff, baselines, and annotation assertions", async () => {
  const [readme, visualQa, baselines, roadmap, mcp, handoff] = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("docs/VISUAL_QA_ASSERTIONS.md"),
    readRepoFile("docs/VISUAL_BASELINES.md"),
    readRepoFile("docs/ROADMAP.md"),
    readRepoFile("docs/MCP_USAGE.md"),
    readRepoFile("docs/VISUAL_ANNOTATION_HANDOFF.md"),
  ]);

  assert.match(readme, /Visual diff\s+\|\s+Verified/);
  assert.match(readme, /Visual baselines\s+\|\s+Verified/);
  assert.match(visualQa, /visualCompare/);
  assert.match(visualQa, /visualAssertChanged/);
  assert.match(visualQa, /visualAssertChangeContained/);
  assert.match(visualQa, /visual-diffs/);
  assert.match(baselines, /visual_compare_baseline/);
  assert.match(baselines, /smoke:visual-baseline/);
  assert.match(roadmap, /## v0\.2 Visual QA Assertions/);
  assert.match(roadmap, /Add local visual baselines/);
  assert.match(mcp, /Visual QA MCP Workflow/);
  assert.match(mcp, /visual_assert_annotation_changed/);
  assert.match(handoff, /visual-assertions\.jsonl/);
});

test("live observer docs describe local-only optional noVNC support", async () => {
  const [readme, liveObserver, security, roadmap, mcp, troubleshooting] = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("docs/LIVE_OBSERVER.md"),
    readRepoFile("docs/SECURITY.md"),
    readRepoFile("docs/ROADMAP.md"),
    readRepoFile("docs/MCP_USAGE.md"),
    readRepoFile("docs/TROUBLESHOOTING_LINUX.md"),
  ]);

  assert.match(readme, /noVNC live observer\s+\|\s+Optional \/ dependency-gated/);
  assert.match(liveObserver, /x11vnc/);
  assert.match(liveObserver, /127\.0\.0\.1/);
  assert.match(liveObserver, /pnpm smoke:observer/);
  assert.match(security, /Live Observer Local Binding/);
  assert.match(roadmap, /## v0\.2 noVNC Live Observer/);
  assert.match(mcp, /observer_start/);
  assert.match(troubleshooting, /Live Observer Issues/);
});

test("v0.2 release docs describe cockpit workflow and verification set", async () => {
  const [readme, releaseNotes, cockpit, checklist] = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("docs/releases/v0.2.0.md"),
    readRepoFile("docs/AGENT_GUI_QA_COCKPIT.md"),
    readRepoFile("docs/RELEASE_CHECKLIST.md"),
  ]);

  assert.match(readme, /Linux-first GUI QA and visual handoff cockpit/);
  assert.match(readme, /Let agents see, click, verify, and prove GUI changes/);
  assert.match(releaseNotes, /# v0\.2\.0 Release Notes/);
  assert.match(releaseNotes, /Driver Router/);
  assert.match(releaseNotes, /pnpm smoke:visual-baseline/);
  assert.match(releaseNotes, /Optional or Dependency-Gated Checks/);
  assert.match(cockpit, /Agent GUI QA Cockpit/);
  assert.match(cockpit, /Visual Annotation Handoff/);
  assert.match(cockpit, /visual_assert_change_contained/);
  assert.match(checklist, /## v0\.2 Required Checks/);
  assert.match(checklist, /pnpm smoke:observer/);
});
