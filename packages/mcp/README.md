# @taskset/mcp

Transport-neutral agent tools over `@taskset/core`.

`createTasksetAgentTools()` exposes the validated `taskset.context.resolve`
tool without starting a server, daemon, or network service. The adapter owns
input validation and tool metadata only; core owns repository discovery and
context semantics.

```typescript
import { createTasksetAgentTools } from '@taskset/mcp'

const tools = createTasksetAgentTools()
const context = await tools['taskset.context.resolve'].execute({
	task: '.taskset/tasks/0000001-example-a1b2c3.md',
	cwd: process.cwd(),
	limits: { maxChildren: 10, maxRelated: 10, maxBodyChars: 2_000 },
})
```

Hosts may inject a compatible `resolveContext` function for composition or
testing. The adapter returns the core result unchanged and rejects unknown
input fields before delegation. Canonical Markdown remains the only source of
truth; this package creates no index or persistent state.
