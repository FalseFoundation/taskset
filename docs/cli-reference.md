---
title: CLI Reference
description: Complete reference for the taskset command-line interface.
---

# CLI Reference

The `taskset` command is a thin adapter over `@taskset/core`. It parses
arguments, validates command options, calls core operations, and renders human
or JSON output.

Use `pnpm exec taskset <command>` when Taskset is installed as a project
dependency. The examples below use `taskset` directly for brevity.

## Common Behavior

```bash
taskset help
taskset --help
taskset -h
```

Running without a command also prints usage. These help paths exit with code
`0`.

Most repository commands accept:

| Option | Description |
| --- | --- |
| `--cwd <path>` | Resolve repository discovery from another working directory. |
| `--json` | Emit structured JSON instead of human-readable text where supported. |

Stdout is reserved for requested output. Diagnostics, validation failures, and
best-effort generated-view refresh warnings are written to stderr.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Command succeeded. |
| `1` | Repository or domain operation failed, such as invalid task state or delete blockers. |
| `2` | CLI usage, argument validation, path normalization, or parse validation failed. |

## Repository Commands

### `init`

```bash
taskset init [--cwd <path>]
```

Initializes a Taskset repository in the target directory. The command creates
`taskset.config.ts`, `.taskset/tasks/`, and `.taskset/.gitignore` when they do
not already exist.

Human output:

```text
Initialized Taskset in <root-directory>
```

### `config`

```bash
taskset config [--json] [--cwd <path>]
```

Discovers the nearest `taskset.config.ts` by walking upward from the working
directory.

Human output is the config file path. JSON output contains:

```json
{
  "rootDirectory": "...",
  "configPath": "...",
  "dataDirectory": "...",
  "config": {}
}
```

### `doctor`

```bash
taskset doctor [--json] [--cwd <path>]
```

Validates the repository without modifying files. It scans canonical task
metadata, paths, and graph relationships.

Human success output:

```text
Taskset repository is valid (<count> tasks)
```

Human failure output is tab-separated:

```text
<code>	<path-or->	<message>	<remediation>
```

JSON output is the full doctor result, including `valid`, `taskCount`, and
diagnostics.

### `generate`

```bash
taskset generate [--json] [--cwd <path>]
```

Rebuilds disposable generated views under `.taskset/generated/`.

Human output:

```text
Generated <count> views in <directory>
```

JSON output is the generated-views result with the target directory and written
files.

## Snapshot Commands

Snapshots are non-authoritative safety checkpoints under `.taskset/snapshots/`.
Git remains the normal history and collaboration mechanism.

### `snapshot create`

```bash
taskset snapshot create [--json] [--cwd <path>]
```

Creates an immutable archive of canonical task files.

Human output is the snapshot ID. JSON output is the snapshot manifest.

### `snapshot list`

```bash
taskset snapshot list [--json] [--cwd <path>]
```

Lists available snapshots.

Human output is tab-separated:

```text
<snapshot-id>	<created-at>	<file-count>
```

JSON output is an array of snapshot manifests.

### `snapshot restore`

```bash
taskset snapshot restore <snapshot-id> [--apply] [--json] [--cwd <path>]
```

Previews or restores canonical task files from a snapshot. The default is a dry
run. Use `--apply` to mutate task files.

Human output:

```text
Would restore <count> task files from <snapshot-id>
Restored <count> task files from <snapshot-id>
```

JSON output is the restore result, including `applied` and `changes`.

## Task Metadata Options

`task create` and `task update` accept the same metadata options unless noted.
Array options are repeatable.

| Option | Field | Notes |
| --- | --- | --- |
| `--title <title>` | `title` | Required for create, optional for update. |
| `--status <status>` | `status` | One of `todo`, `doing`, `blocked`, `done`, `canceled`. |
| `--priority <priority>` | `priority` | One of `low`, `medium`, `high`, `urgent`. |
| `--order <number>` | `order` | Nonnegative finite number. Lower values sort first. |
| `--label <label>` | `labels` | Repeatable. |
| `--depends-on <task-id>` | `dependsOn` | Repeatable. |
| `--file <path>` | `files` | Repeatable; normalized to a repository-relative POSIX path. |
| `--owner <owner>` | `owner` | Trimmed string. |
| `--assignee <assignee>` | `assignees` | Repeatable. |
| `--reviewer <reviewer>` | `reviewers` | Repeatable. |
| `--team <team>` | `team` | Trimmed string. |
| `--estimate <minutes>` | `estimate` | Nonnegative integer. |
| `--effort <value>` | `effort` | Nonnegative finite number. |
| `--risk <risk>` | `risk` | One of `low`, `medium`, `high`. |
| `--due-date <date>` | `dueDate` | `YYYY-MM-DD` or `YYYY-MM-DD HH:mm UTC`. |
| `--related <task-id>` | `related` | Repeatable. |
| `--duplicate <task-id>` | `duplicates` | Repeatable. |
| `--parent <task-id>` | `parent` | Single task ID. |
| `--directory <path>` | `directories` | Repeatable; normalized to a repository-relative POSIX path. |
| `--project <project>` | `projects` | Repeatable. |
| `--body <markdown>` | body | Replaces the Markdown body. |
| `--json` | output | Emit a task record as JSON. |
| `--cwd <path>` | discovery | Resolve repository discovery from another directory. |

## Task Commands

### `task create`

```bash
taskset task create --title <title> [metadata options] [--json] [--cwd <path>]
```

Creates a versionless task file using repository defaults for omitted
configured fields.

Human output is the task ID. JSON output is a task record containing
`relativePath` and metadata fields.

### `task list`

```bash
taskset task list [query options] [--json] [--cwd <path>]
```

Lists tasks using metadata, relationship, planning, timestamp, text, path, and
impact filters.

Filter options:

| Option | Description |
| --- | --- |
| `--status <status>` | Repeatable; OR within statuses. |
| `--priority <priority>` | Repeatable; OR within priorities. |
| `--label <label>` | Repeatable; every requested label must be present. |
| `--owner <owner>` | Repeatable; OR within owners. |
| `--assignee <assignee>` | Repeatable; OR within assignees. |
| `--reviewer <reviewer>` | Repeatable; OR within reviewers. |
| `--team <team>` | Repeatable; OR within teams. |
| `--risk <risk>` | Repeatable; OR within risks. |
| `--project <project>` | Repeatable; OR within projects. |
| `--depends-on <task-id>` | Match a direct dependency. |
| `--related <task-id>` | Match a related task. |
| `--duplicate <task-id>` | Match a duplicate task relationship. |
| `--parent <task-id>` | Match a direct parent. |
| `--file <path>` | Repeatable; unified containment query over `files` and `directories`. |
| `--directory <path>` | Repeatable; containment query over `directories` only. |
| `--estimate-min <minutes>` | Inclusive minimum estimate. |
| `--estimate-max <minutes>` | Inclusive maximum estimate. |
| `--effort-min <value>` | Inclusive minimum effort. |
| `--effort-max <value>` | Inclusive maximum effort. |
| `--due-before <date>` | Inclusive due-date upper bound. |
| `--due-after <date>` | Inclusive due-date lower bound. |
| `--created-before <date>` | Inclusive created-at upper bound. |
| `--created-after <date>` | Inclusive created-at lower bound. |
| `--updated-before <date>` | Inclusive updated-at upper bound. |
| `--updated-after <date>` | Inclusive updated-at lower bound. |
| `--search <text>` | Search task title and Markdown body. |
| `--sort <key>` | Sort key. |
| `--direction <asc|desc>` | Sort direction. |
| `--impact` | Add tasks that transitively depend on direct matches. |
| `--include-derived` | Include derived relationship projections in JSON output. |

Sort keys are `id`, `title`, `status`, `priority`, `order`, `owner`, `team`,
`estimate`, `effort`, `risk`, `dueDate`, `createdAt`, and `updatedAt`. With
`--sort order`, tasks without `order` sort after ordered tasks; duplicate
values fall back to task ID ordering.

Different filter categories compose with AND. Repeated enum, person, project,
file, and directory values use OR within their category. Repeated labels are
stricter and require all requested labels.

Without `--impact`, human output is:

```text
<task-id>	<status>	<title>
```

With `--impact`, human output prefixes direct and impacted rows:

```text
direct	<task-id>	<status>	<title>
impact	<task-id>	<status>	<title>
```

JSON output without `--impact` is an array of task records. JSON output with
`--impact` is:

```json
{
  "direct": [],
  "impacted": []
}
```

Use `--include-derived` to include `blockedBy`, `blocks`, `children`, and
`subtasks` projections in each JSON record.

### `task show`

```bash
taskset task show <task-id> [--include-derived] [--json] [--cwd <path>]
```

Shows one task by ID.

Human output is the serialized task Markdown. JSON output contains:

```json
{
  "relativePath": ".taskset/tasks/TS-...",
  "metadata": {},
  "body": "...",
  "derived": {}
}
```

The `derived` property is present only with `--include-derived`.

### `task update`

```bash
taskset task update <task-id> [metadata options] [clear options] [--json] [--cwd <path>]
```

Updates one task. At least one non-control option is required. A field cannot
be set and cleared in the same command.

Clear options:

| Option | Effect |
| --- | --- |
| `--clear-priority` | Remove `priority`. |
| `--clear-order` | Remove `order`. |
| `--clear-labels` | Replace `labels` with an empty list. |
| `--clear-dependencies` | Replace `dependsOn` with an empty list. |
| `--clear-files` | Replace `files` with an empty list. |
| `--clear-owner` | Remove `owner`. |
| `--clear-assignees` | Replace `assignees` with an empty list. |
| `--clear-reviewers` | Replace `reviewers` with an empty list. |
| `--clear-team` | Remove `team`. |
| `--clear-estimate` | Remove `estimate`. |
| `--clear-effort` | Remove `effort`. |
| `--clear-risk` | Remove `risk`. |
| `--clear-due-date` | Remove `dueDate`. |
| `--clear-related` | Replace `related` with an empty list. |
| `--clear-duplicates` | Replace `duplicates` with an empty list. |
| `--clear-parent` | Remove `parent`. |
| `--clear-directories` | Replace `directories` with an empty list. |
| `--clear-projects` | Replace `projects` with an empty list. |

Human output is the task ID. JSON output is the updated task record.

### `task status`

```bash
taskset task status <task-id> <status> [--json] [--cwd <path>]
```

Updates only task status and enforces lifecycle transition rules. `done` and
`canceled` are terminal states.

Human output is the task ID. JSON output is the updated task record.

### `task delete`

```bash
taskset task delete <task-id> [--remove-dependencies] [--json] [--cwd <path>]
```

Deletes one task. By default, deletion is blocked while another task has an
inbound canonical dependency on the target. Use `--remove-dependencies` to
remove those inbound references and delete the target in one mutation.

Human output is the deleted task ID. JSON output contains `deleted: true`
alongside the deleted task record.

## Generated-View Warnings

Task creation, update, status changes, deletion, and snapshot restore apply
mutate canonical Markdown first and then refresh disposable generated views. If
that refresh fails after the canonical mutation succeeds, the command still
succeeds and writes a stderr warning:

```text
warning: <message>
```

Run `taskset generate` later to rebuild generated views explicitly.

## Compatibility Notes

`tasks-for-file` was removed. Use:

```bash
taskset task list --file <path> --impact
```

Task files are versionless. Frontmatter that still contains `schemaVersion` is
invalid and must be converted by removing that field while preserving the rest
of the task metadata and Markdown body. Snapshot restore previews by default;
pass `--apply` only when the displayed plan is the mutation you intend to
commit.
