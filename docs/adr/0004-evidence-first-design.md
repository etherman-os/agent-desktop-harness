# ADR 0004: Evidence-First Design

## Status

Accepted.

## Context

Agent-driven GUI work needs reviewable output. A final text summary is not enough to understand what the agent saw, clicked, typed, or verified.

## Decision

Treat evidence as a core product feature. Sessions should produce screenshots, action logs, metadata, and `report.md`.

## Consequences

- Evidence paths and artifact ids become part of public contracts.
- Screenshot capture is not just a debugging helper.
- Reports can support human review, CI artifacts, and future audit workflows.
