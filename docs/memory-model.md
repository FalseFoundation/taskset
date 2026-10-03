---
title: Choose Taskset memory layers
description: When to use task bodies versus research, decisions, runbooks, lessons, and concerns.
contentType: Conceptual
navLabel: Memory Model
---

# Choose Taskset memory layers

Taskset keeps three memory layers in one `.taskset/` store:

| Layer | Kinds | Question it answers |
| --- | --- | --- |
| Delivery | tasks (+ checklist subtasks) | What work is open, blocked, or done? |
| Decision | research, decision/adr, runbook, story, flow | What did we learn, choose, or need to operate? |
| Operational | lesson, concern, audit | What recurring mistakes, open risks, and spot-checks must future agents respect? |

Do not invent freeform kinds such as `note`, `rfc`, `epic`, or `spec`. Map those intents onto the kinds above.

## Quick chooser

| Situation | Put it here |
| --- | --- |
| One-off execution steps for the current outcome | Task body checklist |
| Independently owned or sequenced deliverable | Child task (`--parent`) |
| Options, evidence, recommendation still forming | `research` |
| Lasting architectural or product choice | `decision` / `adr` |
| Repeatable recovery or ops procedure | `runbook` |
| User outcome / journey context | `story` / `flow` |
| Recurring mistake or correct pattern future agents must not rediscover | `lesson` (`antipattern` alias) |
| Open residual risk (security, authz, money, ops, …) | `concern` |
| Structured inventory or spot-check pass/fail evidence | `audit` |

## Anti-examples

Bad: close a security task with the lesson only in chat or the finished task body.

Good: create a `lesson`, `--related` the task (and concern if any), and if `--related-skill` is set, update that skill in the same change.

Bad: track “remaining authz risk” as an unfinished checklist item forever.

Good: create a `concern` with class, trust boundary, residual risk, and review cadence; keep it `active` until mitigated or formally `accepted`.

Bad: dump an ADR program into one epic-shaped Markdown note.

Good: use a parent task as the program root, child tasks for workstreams, related `concern` / `research` / `audit` documents for residual risk and evidence, and `taskset task program <parent-id> --json` for rollup.

Bad: edit a consumer primary skill automatically from Taskset.

Good: store the lesson in Taskset; update the skill only when the consumer opts in via `--related-skill` (or an explicit later promote helper). Taskset never auto-edits skills by default.

## Related docs

- [Document types](document-types.md)
- [Security and compliance tracking](security-compliance-tracking.md)
- [Agent closeout contract](agent-closeout.md)
- [Taxonomy cookbook](taxonomy-cookbook.md)
- [Query recipes for agents](agents/query-recipes.md)
