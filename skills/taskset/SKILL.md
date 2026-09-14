---
name: taskset
description: Taskset workflow guidance for agents that need to create, inspect, validate, or update repository tasks stored in .taskset/, including cross-package monorepo work. While executing work, agents must create follow-up tasks or subtasks for newly discovered work.
---

# Taskset

Use this skill when working in a repository that uses Taskset to store work as human-readable Markdown beside the code.

## Core Rules

- Treat `.taskset/tasks/` as the canonical task source of truth.
- Treat `taskset.config.ts` as the repository entrypoint for Taskset behavior and defaults.
- Do not create a second task store, hidden database, or alternate sync layer.
- Use Taskset commands to inspect and mutate tasks instead of editing canonical task files by hand when a command exists.
- Prefer `pnpm taskset` in project repositories; use the repo root `pnpm taskset` script when available.
- While executing or working a task, agents MUST create follow-up Taskset tasks or child subtasks for newly discovered work. Do not leave that work only in chat, memory, or an informal note.

## Recommended Workflow

1. Confirm the repository root and Taskset config.
2. Inspect repository health with `taskset config --json` and `taskset doctor`.
3. List or show tasks before changing them.
4. Create, update, or close tasks with Taskset commands.
5. Re-run validation after edits and keep Git as the collaboration and history layer.

## Common Commands

```bash
pnpm taskset config --json
pnpm taskset doctor
pnpm taskset task list
pnpm taskset task show <task-id>
pnpm taskset task create --title "Describe the work"
pnpm taskset task update <task-id> --status doing
pnpm taskset task status <task-id> done
pnpm taskset task delete <task-id>
pnpm taskset task list --file packages/core --impact
```

## Practical Guidance

- Use `--json` for automation and agent handoffs.
- Use `task list --impact` when file or directory changes should surface dependent work.
- Keep task metadata versionless and let Taskset validate schema and path rules.
- When a task change affects repository behavior, follow up with the relevant tests, docs, and `git diff --check`.

## Task Modeling

- Represent distinct deliverables as separate Taskset tasks instead of placing an entire plan in one raw-text task. Keep one task when the work is genuinely atomic or the items are only completion steps for the same outcome.
- Search existing open and recently completed tasks before creating new ones. Update or relate matching work instead of creating a duplicate; use `--duplicate` only when preserving a separately created duplicate is necessary.
- When a prompt contains many tasks, do not preserve its ordering blindly. Infer the work graph from the requested outcomes and repository context, then assign the appropriate existing labels and projects and record relationships such as `--depends-on`, `--related`, and `--parent`. A task that cannot start until another finishes must depend on that task; prompt order alone does not establish a dependency.
- Use `--depends-on` only for a real execution prerequisite and `--related` for useful context without blocking. Avoid dependency cycles and create prerequisites first when their generated IDs are needed by downstream tasks.
- Inspect existing tasks, labels, projects, and repository conventions before assigning metadata. Reuse established taxonomy and avoid inventing labels, projects, or relationships without supporting context.
- Attach known repository scope with `--file` or `--directory` so impact queries can find the task. Use the narrowest accurate paths and do not guess paths that have not been established.
- Model smaller steps within one task as Markdown checklist items beginning with `- [ ]` in the task body. Use child tasks with `--parent` instead when a subtask needs its own status, ownership, dependencies, or tracking history.
- While working, when new deliverables, prerequisites, blockers, deferred scope, regressions, or verification gaps surface, create follow-up tasks or `--parent` child tasks immediately. Relate them with `--depends-on`, `--related`, or `--parent` as appropriate. Do not finish or abandon the current task without recording that discovered work in Taskset.
- Give each task an outcome-oriented title and enough structured Markdown to make it executable: context or outcome, in-scope work, checklist when useful, observable acceptance criteria, and references. Avoid vague titles and undifferentiated text dumps.
- Preserve links, external URLs, named libraries, and other external mentions from the user's prompt in a `References` section in the relevant task body. Keep enough surrounding description to explain why each reference matters.
- Preserve user-supplied metadata when updating a task unless the requested change supersedes it. Keep the body, checklist state, status, dependencies, and scope consistent; do not mark a task done until its acceptance criteria are satisfied.
- For batch mutations, capture the IDs returned by each successful command and reconcile the current task list after any failure. Resume from the observed state instead of rerunning the whole batch and creating duplicates.
- Prefer closing completed or superseded work through status and relationships so history remains available. Delete a task only when removal is explicitly intended, after checking tasks that depend on it.
- If the prompt is ambiguous about scope or sequencing, record only relationships supported by evidence. Do not turn a guess into a dependency, owner, due date, estimate, or completion claim.
- After creating or changing several tasks, inspect them as a set and verify that identifiers, dependencies, parent-child links, related work, labels, projects, and checklist placement match the inferred work graph.

For multi-task prompts or uncertainty about task granularity and relationships, read [good and bad task-modeling examples](references/task-modeling-examples.md).

## Monorepo Reasoning

When workspace configuration declares multiple apps or packages:

- Inspect the workspace manifest, relevant package manifests, package dependency graph, root and package-level task-runner configuration, and release configuration before decomposing work. Use declared package names and existing Taskset projects rather than inferring identity from directory names alone.
- Distinguish the workspace dependency graph, build-task graph, and Taskset work graph. A package dependency indicates possible impact but is not automatically a Taskset `--depends-on`; record a task dependency only when that concrete deliverable requires another task's output.
- Trace changes in shared packages outward to direct and transitive consumers. Include compatibility work and consumer validation in the originating task's scope, or create dependent tasks when those outcomes need separate ownership, status, release notes, or delivery.
- Split work by independently deliverable outcome, not mechanically by package. Keep one cross-package task when several package edits form one atomic capability; split it when packages can ship independently or require different owners, sequencing, acceptance criteria, or release treatment.
- Assign every affected workspace through existing `--project` values and attach the narrowest accurate `--file` or `--directory` scopes. Include root configuration only when the task actually changes repository-wide behavior.
- Put package-local implementation and scripts in the owning package. When a task runner such as Turborepo is present, describe task-pipeline or root configuration changes only when orchestration must change; do not compensate for undeclared workspace dependencies with ad hoc execution ordering.
- Make validation follow the impact graph: test the changed package, affected dependents, relevant integration boundaries, and any repository-wide configuration touched. Prefer the repository task runner's package filters or affected mode and record the intended commands or observable checks in acceptance criteria.
- Treat lockfiles, generated artifacts, workspace registration, exports, documentation, and Changesets as supporting parts of the owning outcome unless they are independently assignable deliverables. Do not create noisy standalone tasks for mechanical byproducts.
- Re-evaluate projects, file scopes, dependencies, validation, and Changesets whenever implementation crosses an unexpected package boundary. Record newly independent work as linked Taskset tasks before completing the current task.

For package-graph decomposition, cross-package validation, and new-package examples, read [monorepo task-modeling examples](references/monorepo-task-modeling.md).

## Changesets in Monorepos

When the repository contains `.changeset/config.json`:

- Inspect the Changesets config and affected package manifests before modeling release impact. Follow repository policy for ignored packages, linked or fixed groups, internal dependency bumps, and the base branch.
- Every task that may change a releasable package must include a `Changeset` section in its body. State either the expected package names, SemVer bump levels, and release-note intent, or `Not required` with a concrete reason supported by repository convention.
- Treat the changeset as part of the implementation task's checklist and acceptance criteria unless authoring or coordinating releases is itself a separately owned deliverable. Do not create a detached bookkeeping task for every changeset.
- Base bump levels on externally observable package impact, not task size. Include every directly affected package and account for any internal-dependent bumps required by the repository config.
- Prefer one changeset for one coherent user-facing change, even when it spans multiple packages. Use separate changesets when the changes have independent release-note meaning or may ship separately.
- While executing, update the task's Changeset section if the affected packages or release impact changes. Before marking the task done, create the required changeset, verify its package names, bump levels, and summary, and run the repository's Changesets status or validation command.
- Do not invent a release note for work that repository policy excludes, such as non-published examples or test-only changes. Record the no-changeset rationale so omission is deliberate and reviewable.

For paired examples of required, multi-package, and unnecessary changesets, read [Changesets task examples](references/changesets-examples.md).

## Agent Checklist

- Read the task and the surrounding repository context first.
- While executing, create follow-up tasks or subtasks for every distinct piece of newly discovered work before moving on or closing the current task.
- In monorepos, verify affected packages and consumers against the workspace and task-runner graphs rather than relying only on the initially named directory.
- In repositories using Changesets, reconcile the task's declared Changeset requirement with the actual affected packages before completion.
- Prefer the smallest Taskset command that proves the intended state.
- Avoid editing generated output, caches, or any non-canonical `.taskset/` artifacts.
- Report validation failures plainly and only claim success after the command has run.
