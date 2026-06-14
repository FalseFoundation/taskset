# @taskset/core

The reusable domain and repository engine for Taskset. See
[taskset.false.foundation](https://taskset.false.foundation/) for user
documentation.

```bash
pnpm add @taskset/core
```

```typescript
import { discoverRepository, queryTasks } from '@taskset/core'

const repository = await discoverRepository(process.cwd())
const result = await queryTasks(repository, {
	files: ['packages/core'],
	impact: true,
})
```

Core owns repository discovery, strict task parsing, schema v1/v2
compatibility, deterministic serialization, atomic mutations, lifecycle rules,
relationship projections, path queries, diagnostics, synchronization,
snapshots, migrations, indexing, and generated views.

Key public operations include:

- `createTask`, `readTask`, `updateTask`, `deleteTask`, and `listTasks`
- `queryTasks`, `buildTaskGraph`, `buildTaskIndex`, and `diagnoseRepository`
- `createSnapshot`, `listSnapshots`, `restoreSnapshot`, and `migrateTasks`
- `generateViews`

Public operation inputs are validated with exported Zod schemas where
applicable. Task mutations refresh disposable generated views on a best-effort
basis; canonical writes remain successful if generation fails and callers can
surface the warning callback.
