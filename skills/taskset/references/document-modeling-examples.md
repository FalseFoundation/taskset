# Document Modeling Examples

Use these examples to choose document kinds and when to create them mid-work.
IDs in commands are placeholders for IDs returned by Taskset.

## Research Versus Task Notes

Bad: while comparing queue providers, paste a long evidence dump into the task
body and leave the recommendation only in chat.

Good: create a research document, keep the task focused on the delivery outcome,
and link both.

```bash
pnpm taskset document create research --title "Evaluate queue providers" --related <task-id>
pnpm taskset task update <task-id> --related <research-id>
```

## Decision Versus Research

Bad: write an ADR before evidence exists, or leave a chosen architecture only as
unchecked notes in a task checklist.

Good: capture investigation as `research` first when options are still open.
When the choice is made, create or update a `decision` (`adr`) with context,
alternatives, and consequences, then `--related` the research and the task.

```bash
pnpm taskset document create adr --title "Use transactional outbox" --related <task-id> --related <research-id>
```

## Runbook Versus Checklist

Bad: discover a recovery procedure during an incident-fix task and leave the
steps as a one-off checklist that disappears when the task closes.

Good: create a `runbook` with symptoms, checks, actions, rollback, and
verification, keep it `active`, and relate it to the task that produced it.

```bash
pnpm taskset document create runbook --title "Recover consumer lag" --related <task-id>
```

## Keep Scratch In The Task

Bad: create a research document for “rename helper and re-run tests”.

Good: keep tiny execution steps as checklist items on the task. Use documents
only when another person or future agent would reuse the material outside that
task’s completion.

## Story Or Flow Versus Implementation Task

Bad: model “Member signs in via SSO” only as an implementation task with no
acceptance context.

Good: keep the user outcome in a `story` or journey in a `flow`, then create
implementation tasks that `--related` that document and carry the code work.

```bash
pnpm taskset document create story --title "Member signs in via SSO"
pnpm taskset task create --title "Add SSO callback handler" --related <story-id> --file packages/api/src/auth.ts
```
