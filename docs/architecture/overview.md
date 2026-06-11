---
title: Architecture Overview
description: Taskset package boundaries, runtime flow, and code organization.
---

# Architecture Overview

Taskset is a local-first modular system built around canonical Markdown files.

```text
CLI / TUI / MCP / Extension / Kanban / Office
                    |
             @taskset/core
                    |
       parse -> validate -> operate -> serialize
                    |
          .taskset/ Markdown files
                    |
         disposable indexes and views
```

## Package Direction

```text
types        utils
   \          /
      core
       |
cli  tui  mcp  extension  kanban  office
```

- `@taskset/types` owns shared contracts and schemas.
- `@taskset/utils` owns domain-light reusable primitives.
- `@taskset/core` owns domain behavior and persistence orchestration.
- Interface packages own input, rendering, transport, and interaction.
- Client packages do not become domain APIs for each other.

## Client Organization

UI and interaction surfaces use feature-based architecture. Each feature
colocates its components, state, adapters, fixtures, and tests. Shared code is
promoted only when several features genuinely depend on it.

## Core and Server Organization

Core uses a DDD-lite modular monolith:

```text
src/
├── tasks/
│   ├── domain/
│   ├── application/
│   └── infrastructure/
├── graph/
├── projects/
├── search/
└── repository/
```

This is not ceremonial DDD:

- organize by domain module first
- keep pure invariants in `domain`
- coordinate use cases in `application`
- isolate filesystem, Git, and framework code in `infrastructure`
- omit layers that have no meaningful behavior
- keep one process and deployable unit

If hosted collaboration requires a server, `apps/server` becomes a thin
composition root over core. It owns transport, authentication, authorization,
repository checkout, concurrency, and process lifecycle, not duplicate domain
rules.

## Documentation

The root `docs/` tree is canonical. `apps/www` renders it directly and may add
marketing routes around it. See the
[documentation platform decision](decisions/0001-documentation-platform.md).

## Decisions

- [Documentation platform](decisions/0001-documentation-platform.md)
- [Client FBA and modular core/server](decisions/0002-code-architecture.md)
- [Snapshot policy](decisions/0003-snapshot-policy.md)
