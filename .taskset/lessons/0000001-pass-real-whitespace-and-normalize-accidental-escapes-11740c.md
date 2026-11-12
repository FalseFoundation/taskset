---
id: 11740c
type: lesson
title: Pass real whitespace and normalize accidental escapes
status: active
owner: junkieshuffle
createdAt: 2026-11-12 11:44 UTC
updatedAt: 2026-11-12 11:46 UTC
related:
  - .taskset/tasks/0000053-normalize-literal-whitespace-escapes-in-entity-bodies-f191de.md
directories:
  - packages/core/src/markdown
relatedSkills:
  - skills/taskset/SKILL.md
---

# Pass real whitespace and normalize accidental escapes

## Trigger / symptom

A caller passes shell-escaped body text, causing canonical Markdown to contain visible `\n`, `\r\n`, or `\t` sequences instead of layout.

## Incorrect pattern

Assume shell quoting will decode a string such as `First\n\nSecond` before it reaches Taskset, or persist that string without inspecting the canonical Markdown.

## Correct pattern

Pass actual whitespace to Taskset. As a defensive boundary, create/update operations normalize unescaped literal whitespace sequences in Markdown prose. Preserve the same sequences inside inline code and fenced code because those are intentional examples.

## Blast radius / severity

Medium. The entity remains parseable, but rendered tasks and documents become unreadable and agents can propagate malformed checklists or headings.

## Prevention

Keep normalization centralized in the core mutation path so CLI, batches, imports, and library callers share the behavior. Test both prose repair and code preservation. Agents still inspect the rendered canonical file after body mutations.

## Evidence

- `packages/core/src/markdown/bodyWhitespace.ts`
- Core task/document integration tests and CLI task-create coverage.
- `skills/taskset/SKILL.md` documents the caller and defensive-boundary contract.
