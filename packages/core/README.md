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
	estimateMin: 30,
	impact: true,
})
```

Core owns repository discovery, strict versionless task parsing, deterministic
serialization, atomic mutations, lifecycle rules, relationship projections,
path queries, diagnostics, synchronization, snapshots, indexing, and generated
views.

Key public operations include:

- `createTask`, `readTask`, `updateTask`, `deleteTask`, and `listTasks`
- `queryTasks`, `buildTaskGraph`, `buildTaskIndex`, and `diagnoseRepository`
- `createSnapshot`, `listSnapshots`, and `restoreSnapshot`
- `generateViews`

Public operation inputs are validated with exported Zod schemas where
applicable. Invalid boundary data throws `CoreValidationError` with stable
field-level `issues`; task-domain failures retain their more specific typed
errors. Query ranges are inclusive; repeated values generally use OR within a
field, labels require every requested value, and different filter fields
compose with AND. `order` is the optional explicit task sequence; ordered tasks
sort before unordered tasks with task ID fallback for ties. Task mutations
refresh disposable generated views on a best-effort basis; canonical writes
remain successful if generation fails and callers can surface the warning
callback.
