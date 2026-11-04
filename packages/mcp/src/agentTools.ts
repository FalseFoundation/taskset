import {
	type AgentContext,
	type AgentContextInput,
	AgentContextInputSchema,
	resolveAgentContext,
} from '@taskset/core'

export interface TasksetAgentTool<Output> {
	readonly name: string
	readonly description: string
	readonly inputSchema: typeof AgentContextInputSchema
	readonly execute: (input: unknown) => Promise<Output>
}

export interface TasksetAgentToolDependencies {
	readonly resolveContext?: (input: AgentContextInput) => Promise<AgentContext>
}

export interface TasksetAgentTools {
	readonly 'taskset.context.resolve': TasksetAgentTool<AgentContext>
}

/** Creates transport-neutral tools without starting a server or owning repository state. */
export function createTasksetAgentTools(
	dependencies: TasksetAgentToolDependencies = {},
): TasksetAgentTools {
	const resolveContext = dependencies.resolveContext ?? resolveAgentContext
	return Object.freeze({
		'taskset.context.resolve': Object.freeze({
			name: 'taskset.context.resolve',
			description: 'Resolve compact, bounded Taskset context for one task.',
			inputSchema: AgentContextInputSchema,
			execute: async (input: unknown) => resolveContext(AgentContextInputSchema.parse(input)),
		}),
	})
}
