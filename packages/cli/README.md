# @taskset/cli

The public command-line adapter for Taskset, the Git-native workspace for plans, research, decisions, runbooks, lessons, concerns, audits, and executable tasks. Full documentation is on [taskset.false.foundation](https://taskset.false.foundation/), including the [CLI reference](./docs/cli-reference.md), [document types](./docs/document-types.md), [memory model](./docs/memory-model.md), and [agent guide](./docs/agents/index.md).

The published package ships the repository `docs/` and `skills/` trees beside the CLI so agents can load offline references from `node_modules/@taskset/cli/docs` and `node_modules/@taskset/cli/skills`.

## Install

```bash
npx @taskset/cli@latest init
pnpm dlx @taskset/cli init
pnpm add --save-dev @taskset/cli
npm install --global @taskset/cli
```

```bash
taskset document create research --title "Evaluate release options"
taskset task create --title "Ship the release notes" --related your_research_id_here
taskset document list --json
taskset task list --json
```

The package owns argument tokenization, Zod-backed command validation, output, and exit-code mapping. Repository behavior is delegated to `@taskset/core`.

## Commands

- `taskset init`, `config`, `doctor`, `generate`, and `sync`
- `taskset task create|list|show|update|status|delete|migrate-ids`
- `taskset document create|import|batch|list|show|update|status|delete` (`doc` is an alias)
- `taskset snapshot create|list|restore`

`init` creates `.taskset/` for tasks, stories, flows, decisions, research, runbooks, lessons, concerns, and audits without requiring a config file. Pass `--config` for optional `taskset.config.ts`.

Exit code `0` means success, `1` means a repository or domain failure, and `2` means invalid CLI usage. Commands reserve stdout for requested output and send diagnostics to stderr.

## Optional config helper

`defineConfig` is re-exported for optional `taskset.config.ts`:

```typescript
import { defineConfig } from '@taskset/cli'

export default defineConfig({})
```
