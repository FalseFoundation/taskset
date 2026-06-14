# @taskset/contracts

Shared runtime schemas and TypeScript contracts for Taskset. See
[taskset.false.foundation](https://taskset.false.foundation/) for the canonical
schema documentation.

```bash
pnpm add @taskset/contracts
```

```typescript
import { TaskMetadataSchema, type TaskMetadataV2 } from '@taskset/contracts'

const metadata: TaskMetadataV2 = TaskMetadataSchema.parse(input)
```

The package owns strict Zod schemas, enums, task/configuration types, and
provider-neutral synchronization contracts. It has no filesystem, process,
lifecycle, adapter implementation, or UI behavior.

Task metadata schema versions 1 and 2 are readable. New and modified tasks use
schema v2. Unknown fields remain errors; inverse graph fields such as `blocks`
and `children` are projections and are never accepted as canonical metadata.

Strict date parsing is provided by `@taskset/utils`; the removed
`parseTaskTimestamp` and `formatTaskTimestamp` contract exports have no
compatibility aliases.
