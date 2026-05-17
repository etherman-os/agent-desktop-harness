# ADR 0003: MCP, HTTP, and CLI Interfaces

## Status

Accepted.

## Context

Different coding agents and development workflows need different integration surfaces. MCP is useful for agent tools, HTTP is useful for local services and test harnesses, and CLI is useful for scripts and debugging.

## Decision

Expose one shared core engine through three adapters:

- MCP stdio server.
- HTTP JSON API.
- CLI.

## Consequences

- Policy, evidence, session lifecycle, and driver routing live in the core.
- Adapters should stay thin.
- Behavior should remain consistent across agent clients and local workflows.
