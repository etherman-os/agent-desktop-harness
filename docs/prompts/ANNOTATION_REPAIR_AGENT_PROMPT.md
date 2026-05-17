# Annotation Repair Agent Prompt

Use this prompt with Codex, Hermes, Claude Code, or another coding agent when a human has created a visual annotation handoff.

```md
You are fixing a GUI issue using Agent Desktop Harness visual evidence.

Read:
- visual-handoff.md
- the referenced screenshot
- the referenced crop
- related source files

Task:
- Understand the human annotation.
- Make the smallest targeted code change.
- Do not rewrite unrelated UI.
- Rerun the app through Agent Desktop Harness.
- Capture before/after screenshots.
- Report changed files and evidence paths.

Constraints:
- Do not use the real desktop.
- Use the isolated Agent Desktop Harness session.
- Preserve existing behavior outside the annotated issue.
- Treat screenshots and evidence as potentially sensitive.
```

## HTTP Workflow

1. Start the local HTTP server on `127.0.0.1`.
2. Use `GET /sessions/:sessionId/visual-handoff`.
3. Inspect the `text`, screenshot path, and crop path.
4. Make the minimal code change.
5. Run the app again through the HTTP API.
6. Capture a new screenshot.
7. Stop the session and report evidence paths.

## MCP Workflow

1. Use `desktop_get_visual_handoff`.
2. Inspect the markdown text and referenced files.
3. Make the minimal code change.
4. Use the desktop harness MCP tools to rerun the app.
5. Capture a new screenshot.
6. Stop the session and report evidence paths.

## Expected Report

```md
Changed files:
- path/to/file

Evidence:
- Before screenshot: ...
- Annotation crop: ...
- Visual handoff: ...
- After screenshot: ...

Summary:
- What the annotation pointed to
- What changed
- What verification was run
```
