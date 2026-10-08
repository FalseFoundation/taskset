---
id: df2931
title: Report repository considerations in doctor
status: done
priority: high
owner: junkieshuffle
assignees:
  - junkieshuffle
createdAt: 2026-10-08 10:21 UTC
updatedAt: 2026-10-08 10:26 UTC
labels:
  - diagnostics
  - workflow
related:
  - .taskset/tasks/0000048-make-sync-atomic-and-filename-first-e55d6e.md
files:
  - docs/cli-reference.md
directories:
  - packages/core/src/diagnostics
  - packages/cli/src
---

# Outcome

Make `taskset doctor` report valid-but-unresolved work and review queues without turning them into integrity failures.

# Checklist

- [x] Add typed consideration records to the public doctor result.
- [x] Report todo, doing, and blocked tasks.
- [x] Report decisions awaiting approval, research awaiting acceptance, active concerns, and other ready documents.
- [x] Keep considerations non-failing and separate from diagnostics.
- [x] Render considerations in JSON and human CLI output.
- [x] Update CLI, query, closeout, and packaged skill guidance.
- [x] Add core and CLI regression coverage.
- [x] Run focused tests, full tests, lint, formatting checks, build, doctor, and diff checks.

# Verification

The repository doctor is valid with zero diagnostics and reports its remaining open tasks as considerations.
