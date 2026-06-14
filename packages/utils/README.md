# @taskset/utils

Domain-light reusable primitives for Taskset. See
[taskset.false.foundation](https://taskset.false.foundation/) for project
documentation.

```bash
pnpm add @taskset/utils
```

```typescript
import { formatDate, parseDate, parseFrontmatter } from '@taskset/utils'

const timestamp = parseDate('2026-06-12 09:30 UTC')
const persisted = formatDate(new Date())
```

The package owns deterministic YAML frontmatter handling and generic strict UTC
date parsing/formatting. Task lifecycle, repository policy, graph behavior, and
entity migrations belong in `@taskset/core`.

`parseDate` accepts `YYYY-MM-DD`, `YYYY-MM-DD HH:mm UTC`, and the documented
legacy millisecond ISO UTC form. `formatDate` emits deterministic UTC values.
