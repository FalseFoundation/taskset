---
id: 81c92d
type: decision
title: "Operational memory: lesson, concern, and audit document kinds"
status: accepted
createdAt: 2026-10-03 10:11 UTC
updatedAt: 2026-10-03 10:11 UTC
---

# Operational memory: lesson, concern, and audit document kinds

## Context

Agent-heavy monorepos need delivery memory (tasks), decision memory (research/ADR/runbook/story/flow), and operational memory (recurring mistakes, open risks, program gates) in one `.taskset/` store. Lessons and residual risks today leak into chat, closed task bodies, or ad-hoc skill edits.

## Decision

Add three document kinds under the existing document command surface:

1. `lesson` (alias `antipattern`) in `.taskset/lessons/` — durable register of recurring mistakes and correct patterns.
2. `concern` in `.taskset/concerns/` — living open/residual risk register.
3. `audit` in `.taskset/audits/` — structured spot-check / inventory evidence.

Also ship program rollup (`taskset task program`), optional config-driven closeout gates, taxonomy allowlists, doctor checks, and skill-promotion metadata (`relatedSkills`, `packs`) that never auto-edit consumer skills.

## Alternatives

- Research subtype `subtype: audit` only — rejected; schema cost of a real kind is low and discovery is clearer.
- Freeform `note` / `epic` / `spec` kinds — rejected; out of scope and would dilute the memory model.
- Second tracker / cloud DB — rejected; Markdown-in-repo remains SoT.

## Consequences

- `DOCUMENT_KINDS` and sync directories grow; zero-config repos stay compatible.
- Optional closeout and taxonomy config default off/permissive.
- Agents gain queryable operational memory without replacing research/ADR/runbook.

## Migration

`taskset sync` creates the new directories. Existing repositories need no config. Import recognizes `lessons/`, `concerns/`, and `audits/` parent directories.

## Status

Accepted for implementation.
