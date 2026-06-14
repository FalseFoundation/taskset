import type { TaskRecord } from '../tasks/taskRepository.ts'

export type TaskGraphDiagnosticCode =
	| 'duplicate-id'
	| 'missing-dependency'
	| 'self-dependency'
	| 'cycle'

export interface TaskGraphDiagnostic {
	readonly code: TaskGraphDiagnosticCode
	readonly message: string
	readonly path?: string
	readonly taskId: string
	readonly relatedTaskId?: string
	readonly cycle?: readonly string[]
}

export class TaskGraphError extends Error {
	readonly diagnostics: readonly TaskGraphDiagnostic[]

	constructor(diagnostics: readonly TaskGraphDiagnostic[]) {
		super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'))
		this.name = 'TaskGraphError'
		this.diagnostics = Object.freeze([...diagnostics])
	}
}

function canonicalCycle(cycle: readonly string[]): readonly string[] {
	const nodes = cycle.slice(0, -1)
	const first = [...nodes].sort((left, right) => left.localeCompare(right))[0]
	const offset = first ? nodes.indexOf(first) : 0
	const rotated = [...nodes.slice(offset), ...nodes.slice(0, offset)]
	return Object.freeze([...rotated, rotated[0] ?? ''])
}

export function inspectTaskGraph(records: readonly TaskRecord[]): readonly TaskGraphDiagnostic[] {
	const orderedRecords = [...records].sort(
		(left, right) =>
			left.task.metadata.id.localeCompare(right.task.metadata.id) ||
			left.relativePath.localeCompare(right.relativePath),
	)
	const recordsById = new Map<string, TaskRecord>()
	const duplicateIds = new Set<string>()
	const diagnostics: TaskGraphDiagnostic[] = []

	for (const record of orderedRecords) {
		const taskId = record.task.metadata.id
		const existing = recordsById.get(taskId)

		if (existing) {
			duplicateIds.add(taskId)
			diagnostics.push({
				code: 'duplicate-id',
				taskId,
				path: record.relativePath,
				message: `Duplicate task ID ${taskId} exists in ${existing.relativePath} and ${record.relativePath}`,
			})
		} else {
			recordsById.set(taskId, record)
		}
	}

	for (const record of orderedRecords) {
		const taskId = record.task.metadata.id

		for (const dependencyId of [...(record.task.metadata.dependsOn ?? [])].sort()) {
			if (dependencyId === taskId) {
				diagnostics.push({
					code: 'self-dependency',
					taskId,
					relatedTaskId: dependencyId,
					path: record.relativePath,
					message: `Task ${taskId} cannot depend on itself`,
				})
			} else if (!recordsById.has(dependencyId)) {
				diagnostics.push({
					code: 'missing-dependency',
					taskId,
					relatedTaskId: dependencyId,
					path: record.relativePath,
					message: `Task ${taskId} depends on missing task ${dependencyId}`,
				})
			}
		}
	}

	const state = new Map<string, 'visiting' | 'visited'>()
	const stack: string[] = []
	const cycleKeys = new Set<string>()

	function visit(taskId: string): void {
		if (duplicateIds.has(taskId) || state.get(taskId) === 'visited') {
			return
		}

		if (state.get(taskId) === 'visiting') {
			const cycleStart = stack.indexOf(taskId)
			const cycle = canonicalCycle([...stack.slice(cycleStart), taskId])
			const key = cycle.join('>')

			if (!cycleKeys.has(key)) {
				cycleKeys.add(key)
				diagnostics.push({
					code: 'cycle',
					taskId: cycle[0] ?? taskId,
					cycle,
					path: recordsById.get(cycle[0] ?? taskId)?.relativePath,
					message: `Task dependency cycle detected: ${cycle.join(' -> ')}`,
				})
			}

			return
		}

		const record = recordsById.get(taskId)

		if (!record) {
			return
		}

		state.set(taskId, 'visiting')
		stack.push(taskId)

		for (const dependencyId of [...(record.task.metadata.dependsOn ?? [])].sort()) {
			if (recordsById.has(dependencyId) && dependencyId !== taskId) {
				visit(dependencyId)
			}
		}

		stack.pop()
		state.set(taskId, 'visited')
	}

	for (const taskId of [...recordsById.keys()].sort()) {
		visit(taskId)
	}

	return Object.freeze(
		diagnostics.sort(
			(left, right) =>
				left.taskId.localeCompare(right.taskId) ||
				left.code.localeCompare(right.code) ||
				(left.relatedTaskId ?? '').localeCompare(right.relatedTaskId ?? ''),
		),
	)
}

function freezeMapValues(source: Map<string, string[]>): ReadonlyMap<string, readonly string[]> {
	return new Map(
		[...source.entries()].map(([taskId, values]) => [
			taskId,
			Object.freeze([...values].sort((left, right) => left.localeCompare(right))),
		]),
	)
}

export class TaskGraph {
	readonly records: ReadonlyMap<string, TaskRecord>
	readonly dependencies: ReadonlyMap<string, readonly string[]>
	readonly blocks: ReadonlyMap<string, readonly string[]>

	constructor(records: readonly TaskRecord[]) {
		const diagnostics = inspectTaskGraph(records)

		if (diagnostics.length > 0) {
			throw new TaskGraphError(diagnostics)
		}

		const recordsById = new Map<string, TaskRecord>()
		const dependencies = new Map<string, string[]>()
		const blocks = new Map<string, string[]>()

		for (const record of [...records].sort((left, right) =>
			left.task.metadata.id.localeCompare(right.task.metadata.id),
		)) {
			const taskId = record.task.metadata.id
			const taskDependencies = [...(record.task.metadata.dependsOn ?? [])].sort()
			recordsById.set(taskId, record)
			dependencies.set(taskId, taskDependencies)
			blocks.set(taskId, [])
		}

		for (const [taskId, taskDependencies] of dependencies) {
			for (const dependencyId of taskDependencies) {
				blocks.get(dependencyId)?.push(taskId)
			}
		}

		this.records = recordsById
		this.dependencies = freezeMapValues(dependencies)
		this.blocks = freezeMapValues(blocks)
	}

	traverse(taskId: string, direction: 'dependencies' | 'blocks'): readonly string[] {
		if (!this.records.has(taskId)) {
			return Object.freeze([])
		}

		const relationships = direction === 'dependencies' ? this.dependencies : this.blocks
		const visited = new Set<string>()
		const pending = [...(relationships.get(taskId) ?? [])]

		while (pending.length > 0) {
			pending.sort((left, right) => left.localeCompare(right))
			const current = pending.shift()

			if (!current || visited.has(current)) {
				continue
			}

			visited.add(current)
			pending.push(...(relationships.get(current) ?? []))
		}

		return Object.freeze([...visited].sort((left, right) => left.localeCompare(right)))
	}
}

export function buildTaskGraph(records: readonly TaskRecord[]): TaskGraph {
	return new TaskGraph(records)
}
