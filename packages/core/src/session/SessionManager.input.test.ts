import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { XvfbDisplayOptions } from "../display/XvfbDisplay.js";
import { InputService } from "../input/InputService.js";
import type { InputBackend } from "../input/types.js";
import type {
  ClickAction,
  DesktopSession,
  HotkeyAction,
  InputActionResult,
  ScrollAction,
  TypeTextAction,
} from "../types.js";
import { isoNow } from "../utils/time.js";
import { DisplayAllocator } from "./displayAllocator.js";
import { SessionManager } from "./SessionManager.js";

class MockInputBackend implements InputBackend {
  async click(session: DesktopSession, action: ClickAction): Promise<InputActionResult> {
    return makeResult(session, "input.click", { ...action });
  }

  async doubleClick(session: DesktopSession, action: ClickAction): Promise<InputActionResult> {
    return makeResult(session, "input.double_click", { ...action });
  }

  async typeText(session: DesktopSession, action: TypeTextAction): Promise<InputActionResult> {
    return makeResult(session, "input.type_text", {
      text: action.text,
      unsafeBackendDetail: true,
    });
  }

  async hotkey(session: DesktopSession, action: HotkeyAction): Promise<InputActionResult> {
    return makeResult(session, "input.hotkey", { ...action });
  }

  async scroll(session: DesktopSession, action: ScrollAction): Promise<InputActionResult> {
    return makeResult(session, "input.scroll", { ...action });
  }
}

test("SessionManager redacts secret typeText action logs", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "agent-desktop-harness-input-"));
  const manager = new SessionManager({
    displayAllocator: new DisplayAllocator({
      min: 190,
      max: 190,
      isDisplayInUse: () => false,
    }),
    displayBackend: {
      start: async ({ display, width, height, depth }: XvfbDisplayOptions) => ({
        display,
        width,
        height,
        depth,
        xvfbProcess: { pid: 1000 } as ChildProcess,
        warnings: [],
      }),
    } as never,
    inputService: new InputService({
      backend: new MockInputBackend(),
    }),
  });

  try {
    const session = await manager.createSession({
      workspacePath,
    });

    await manager.typeText(session.id, {
      text: "super-secret",
      secret: true,
      label: "password",
    });

    const actionsPath = join(session.evidencePath, "actions.jsonl");
    const actions = await readFile(actionsPath, "utf8");

    assert.match(actions, /"type":"input.type_text"/);
    assert.match(actions, /"redacted":true/);
    assert.match(actions, /"textLength":12/);
    assert.doesNotMatch(actions, /super-secret/);
    assert.doesNotMatch(actions, /unsafeBackendDetail/);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

function makeResult(
  session: DesktopSession,
  actionType: string,
  details: Readonly<Record<string, unknown>>,
): InputActionResult {
  return {
    sessionId: session.id,
    actionType,
    createdAt: isoNow(),
    success: true,
    details,
  };
}
