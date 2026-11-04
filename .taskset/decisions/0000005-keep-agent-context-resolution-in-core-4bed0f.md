---
id: 4bed0f
type: decision
title: Keep agent context resolution in core
status: accepted
owner: junkieshuffle
createdAt: 2026-11-04 14:07 UTC
updatedAt: 2026-11-04 14:07 UTC
related:
  - .taskset/tasks/0000050-add-a-bounded-agent-context-query-e7242c.md
files:
  - packages/core/src/agents/agentContext.ts
  - packages/cli/src/cli.ts
  - packages/mcp/src/agentTools.ts
---

# Keep agent context resolution in core

## Context

Agents need one compact task context without independently composing task, program, document, and ownership operations.

## Decision

`resolveAgentContext` in `@taskset/core` owns context semantics. CLI and transport-neutral MCP surfaces validate inputs, delegate to core, and return its result. Canonical Markdown remains authoritative.

## Alternatives

A CLI-only composition would exclude structured tool hosts. An MCP-only composition would duplicate domain behavior and weaken CLI parity. A daemon or secondary index would violate the local Git-native source-of-truth model.

## Consequences

All interfaces share one bounded, deterministic result. Core performs one task load and one document load in parallel. Interface packages remain thin and cannot select repository-specific policy or tools.

## Migration

No persisted format changes are required. Existing commands and repositories remain compatible.

## Status

Accepted.
