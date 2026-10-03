---
title: Use Taskset command contracts
description: Machine-oriented contracts for discovery, JSON output, clear flags, search, and identifiers.
contentType: Reference
navLabel: Agent Commands
---

# Use Taskset command contracts

This page quotes the contracts agents should rely on. For the full human reference, see [CLI reference](../cli-reference.md).

## Discovery and defaults

| Fact | Contract |
| --- | --- |
| Repository marker | Nearest ancestor `.taskset/` directory |
| Optional config | `taskset.config.ts` beside that root |
| Missing config | Built-in statuses, priorities, and defaults |
| `taskset config --json` | Includes `rootDirectory`, `configPath`, `hasConfig`, `dataDirectory`, `config` |
| `taskset init` | Creates `.taskset/`; `--config` writes optional config |

## Output and exit codes

- Stdout carries requested output
- Stderr carries diagnostics and generation warnings
- Exit `0` means success
- Exit `1` means repository or domain failure
- Exit `2` means usage or validation failure

## Identifiers and file links

- Entity `id` values are immutable 5–6 character lowercase hex strings
- Filenames are `{sequence}-{slug}-{id}.md`
- Commands, frontmatter relationships, and JSON handoffs use the short `id`
- Filename sequence prefixes are display metadata only—never identity
- Markdown hyperlinks to docs, skills, or `.taskset/` entities must use the
  repository-relative filepath (include the `.md` file). Do not use a bare hex
  id as a link target.

## Array updates and clear flags

Array options replace the whole stored array. Repeat the singular option once per desired value. Clear with the exact plural flag:

- `--clear-dependencies`
- `--clear-labels`
- `--clear-assignees`
- `--clear-reviewers`
- `--clear-related`
- `--clear-files`
- `--clear-directories`
- `--clear-projects`
- `--clear-parent`
- `--clear-owner`
- `--clear-severity`
- `--clear-related-skills`
- `--clear-packs`
- `--clear-class`
- `--clear-cadence`

Do not guess a clear flag from the singular setter name.

## Search and impact

- `--search` is token-aware: every normalized term must match title or body
- Terms may appear in any order
- `--impact` expands file, directory, or dependency matches to dependent work

## Document kinds

Use only these kinds:

- `story`
- `flow`
- `decision` (`adr`, `dr` aliases)
- `research`
- `runbook`
- `lesson` (`antipattern` alias)
- `concern`
- `audit`

Document statuses are `draft`, `ready`, `active`, `accepted`, `superseded`, and `archived`.

Lesson options: `--severity`, repeatable `--related-skill`, repeatable `--pack`.
Concern options: `--class`, `--cadence`. List filters include `--class` and `--severity`.

## Program rollup

```bash
taskset task program <parent-id> --json
```

Returns child status counts, blocked deps, related open concerns, research not yet accepted, checklist completion, and `closeoutReady`.

Copy-paste recipes: [Query recipes](query-recipes.md).
