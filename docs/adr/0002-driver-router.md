# ADR 0002: Driver Router

## Status

Accepted.

## Context

A pure pixel-clicking model is fragile. Browser apps, Tauri apps, and Electron apps often expose richer automation surfaces than raw screenshots and coordinates.

## Decision

Use a future driver-router architecture. The router will select the best available driver for a session:

- Browser: Playwright and accessibility.
- Tauri: `tauri-driver` / WebDriver.
- Electron: Playwright Electron or CDP.
- Unknown/native: screenshot plus X11 fallback.

## Consequences

- The harness can start with Xvfb and screenshot fallback without locking into pixel-only automation.
- Driver selection becomes part of session metadata and evidence.
- Each driver can evolve independently behind shared core interfaces.
