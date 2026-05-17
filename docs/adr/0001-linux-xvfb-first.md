# ADR 0001: Linux Xvfb First

## Status

Accepted.

## Context

Coding agents need a predictable GUI environment that works in local development, CI, and Linux server environments. Controlling the user's real desktop creates privacy and safety risks that are not acceptable for v0.1.

## Decision

Use isolated Xvfb-based Linux desktop sessions as the first display backend.

## Consequences

- The v0.1 implementation can focus on a narrow, testable Linux path.
- Sessions can be created without interacting with the user's real desktop.
- Browser, Electron, Tauri, and native Linux apps can share the same basic display environment.
- Wayland and real-desktop control are deferred.
