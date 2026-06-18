---
id: TS-01KVDV8X2KEBNTKQFNQ005ZCWQ
title: Split agent skills into smaller navigable references
status: todo
priority: high
createdAt: 2026-06-18 17:08 UTC
updatedAt: 2026-06-18 17:08 UTC
labels:
  - docs
  - skills
  - ai
files:
  - skills/standards/SKILL.md
  - skills/standards/references/architecture.md
  - skills/standards/references/conventions.md
  - skills/standards/references/workflows.md
---

## Context

The `./skills` directory should be chunked into smaller, task-oriented references so agent context loads are smaller and navigation is clearer. Keep `$standards` authoritative while reducing how much unrelated material must be loaded for ordinary work.

## Acceptance Criteria

- [ ] Audit `skills/standards/SKILL.md` and its references for oversized or mixed-purpose sections.
- [ ] Propose a smaller reference structure with clear routing rules for planning, implementation, testing, documentation, release, and architecture work.
- [ ] Preserve the existing repository invariants and make sure agents still know which references to load for each task type.
- [ ] Update any affected skill links or instructions without introducing duplicate or conflicting standards.
- [ ] Validate that the resulting skill files are easier to load selectively and remain consistent with maintainer documentation.

## Planning Note

Define the restructuring before moving or rewriting the skill content.
