# Competitor Matrix

This project focuses on the gap between generic computer-use tools and coding-agent GUI QA workflows.

| Category | Typical Strengths | Typical Limits | How This Project Is Positioned |
| --- | --- | --- | --- |
| Generic computer-use MCPs | Broad mouse, keyboard, and screenshot automation | Often oriented around controlling an existing desktop; evidence and policy may be secondary | Focuses on isolated sessions, typed policy, and audit-ready GUI QA evidence |
| Playwright MCP | Strong browser automation and semantic inspection | Browser-only; does not cover native desktop windows well | Uses browser semantics in the future driver-router when available, but is not limited to browsers |
| VNC-based MCPs | Remote viewing and control of desktops | Can be too general for agent QA; may not produce structured evidence by default | Plans optional observer flows while keeping the core session and evidence model explicit |
| Screenshot-only MCPs | Simple visual inspection | Limited semantic context and weak action auditability | Treats screenshots as one evidence type, alongside action logs, metadata, and reports |
| Browser-only Xvfb tools | Good CI fit for web apps | Usually centered on browser testing, not desktop app harnessing | Starts with Xvfb but targets browser, Tauri, Electron, and native fallback workflows |
| `agent-desktop-harness` | Isolated Linux sessions, shared core, evidence-first design, MCP stdio adapter, HTTP JSON API | Early-stage; semantic drivers and noVNC observer are not implemented yet | A serious harness for coding-agent GUI verification rather than a generic screen-clicking tool |
