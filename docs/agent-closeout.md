---
title: Follow the agent closeout contract
description: Subtasks done, related docs created, taxonomy valid, optional lesson and skill promotion.
contentType: How-to
navLabel: Agent Closeout
---

# Follow the agent closeout contract

Before marking a Taskset task `done`, agents must leave the repository in a state another agent can trust.

## Required

1. Every checklist item for the outcome is checked (`- [x]`), or intentionally removed with rationale.
2. Every child task is `done` or `canceled` (not left `todo` / `doing` / `blocked`).
3. Durable outputs exist as documents when the work produced them:
   - evidence → `research`
   - lasting choice → `decision` / `adr`
   - procedure → `runbook`
   - product context → `story` / `flow`
   - recurring mistake → `lesson`
   - residual risk → `concern`
   - inventory / spot-check → `audit`
4. Documents and tasks are linked with `--related` using canonical repository-relative filenames.
5. Markdown prose that points at those files uses repository-relative filepaths, not bare hex ids.
6. Labels and projects reuse repository taxonomy; do not invent one-off tags when an allowlist exists.
7. `taskset doctor --json` reports no errors for the paths you touched.
8. Review doctor `considerations` and disposition remaining tasks, pending
   decisions, ready documents, and active concerns that affect the handoff.

## Optional config gates

When enabled in `taskset.config.ts`, core blocks `done` transitions that violate:

```typescript
closeout: {
  enforceChildCompletion: true,
  blockDoneWithOpenConcerns: true,
  requireLessonWhenLabeled: ['requires-lesson'],
}
```

Defaults are off so existing repositories keep current behavior.

## Skill promotion bridge

Lessons may declare skill targets:

```bash
taskset document create lesson \
  --title "…" \
  --related-skill .agents/skills/foo/SKILL.md \
  --related <task-id>
```

Contract:

- Taskset stores the lesson evidence and correct pattern.
- The consumer primary skill stores lasting how-to.
- Agents update the skill in the same change when `--related-skill` is present.
- Taskset does not auto-edit skills unless a future promote helper is explicitly applied with config opt-in.

## Program closeout

For multi-task programs:

```bash
taskset task program <parent-id> --json
```

Treat `closeoutReady: false` as a signal to finish children, accept or archive open concerns, accept research, and complete checklist items before marking the parent done.
