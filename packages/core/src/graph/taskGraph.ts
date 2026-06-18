import { TaskFileSchema } from '@taskset/contracts'
import * as z from 'zod'
import type { TaskRecord } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export const TaskRecordSchema = z.strictObject({
	relativePath: z.string().min(1),
	task: TaskFileSchema,
}) satisfies z.ZodType<TaskRecord>

export const TaskRecordsSchema = z.array(TaskRecordSchema)
const TaskGraphDirectionSchema = z.enum(['dependencies', 'blocks', 'children'])

export type TaskGraphDiagnosticCode =
	| 'duplicate-id'
	| 'missing-dependency'
	| 'missing-reference'
	| 'self-dependency'
	| 'self-reference'
	| 'dependency-cycle'
	| 'parent-cycle'

export interface TaskGraphDiagnostic {
	readonly code: TaskGraphDiagnosticCode
	readonly field?: 'dependsOn' | 'related' | 'duplicates' | 'parent'
	readonly message: string
	readonly path?: string
	readonly taskId: string
	readonly relatedTaskId?: string
	readonly cycle?: readonly string[]
}

export interface DerivedTaskRelationships {
	readonly blockedBy: readonly string[]
	readonly blocks: readonly string[]
	readonly children: readonly string[]
	readonly subtasks: readonly string[]
}

export class TaskGraphError extends Error {
	readonly diagnostics: readonly TaskGraphDiagnostic[]

	constructor(diagnostics: readonly TaskGraphDiagnostic[]) {
		super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'))
		this.name = 'TaskGraphError'
		this.diagnostics = Object.freeze([...diagnostics])
	}
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0
}

function canonicalCycle(cycle: readonly string[]): readonly string[] {
	const nodes = cycle.slice(0, -1)
	const first = [...nodes].sort(compareText)[0]
	const offset = first ? nodes.indexOf(first) : 0
	const rotated = [...nodes.slice(offset), ...nodes.slice(0, offset)]
	return Object.freeze([...rotated, rotated[0] ?? ''])
}

function inspectCycles(
	recordsById: ReadonlyMap<string, TaskRecord>,
	duplicateIds: ReadonlySet<string>,
	edgesFor: (record: TaskRecord) => readonly string[],
	options: {
		readonly code: 'dependency-cycle' | 'parent-cycle'
		readonly field: 'dependsOn' | 'parent'
		readonly label: string
	},
): readonly TaskGraphDiagnostic[] {
	const diagnostics: TaskGraphDiagnostic[] = []
	const state = new Map<string, 'visiting' | 'visited'>()
	const stack: string[] = []
	const cycleKeys = new Set<string>()

	// A depth-first walk reports each logical cycle once, independent of file
	// order or the node where traversal first enters that cycle.
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
					code: options.code,
					field: options.field,
					taskId: cycle[0] ?? taskId,
					cycle,
					path: recordsById.get(cycle[0] ?? taskId)?.relativePath,
					message: `Task ${options.label} cycle detected: ${cycle.join(' -> ')}`,
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

		for (const relatedTaskId of [...edgesFor(record)].sort(compareText)) {
			if (recordsById.has(relatedTaskId) && relatedTaskId !== taskId) {
				visit(relatedTaskId)
			}
		}

		stack.pop()
		state.set(taskId, 'visited')
	}

	for (const taskId of [...recordsById.keys()].sort(compareText)) {
		visit(taskId)
	}

	return diagnostics
}

/**
 * Inspects repository-wide task relationships without throwing so `doctor`
 * can report all graph failures in one deterministic pass.
 */
export function inspectTaskGraph(records: readonly TaskRecord[]): readonly TaskGraphDiagnostic[] {
	const validatedRecords = parseCoreInput(TaskRecordsSchema, records, 'task graph inspection')
	const orderedRecords = [...validatedRecords].sort(
		(left, right) =>
			compareText(left.task.metadata.id, right.task.metadata.id) ||
			compareText(left.relativePath, right.relativePath),
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
		const { metadata } = record.task
		const taskId = metadata.id
		const relationships = [
			{ field: 'dependsOn' as const, values: metadata.dependsOn ?? [] },
			{
				field: 'related' as const,
				values: metadata.related ?? [],
			},
			{
				field: 'duplicates' as const,
				values: metadata.duplicates ?? [],
			},
			{
				field: 'parent' as const,
				values: metadata.parent !== undefined ? [metadata.parent] : [],
			},
		]

		for (const relationship of relationships) {
			for (const relatedTaskId of [...relationship.values].sort(compareText)) {
				if (relatedTaskId === taskId) {
					diagnostics.push({
						code: relationship.field === 'dependsOn' ? 'self-dependency' : 'self-reference',
						field: relationship.field,
						taskId,
						relatedTaskId,
						path: record.relativePath,
						message: `Task ${taskId} cannot reference itself through ${relationship.field}`,
					})
				} else if (!recordsById.has(relatedTaskId)) {
					diagnostics.push({
						code: relationship.field === 'dependsOn' ? 'missing-dependency' : 'missing-reference',
						field: relationship.field,
						taskId,
						relatedTaskId,
						path: record.relativePath,
						message: `Task ${taskId} references missing task ${relatedTaskId} through ${relationship.field}`,
					})
				}
			}
		}
	}

	diagnostics.push(
		...inspectCycles(recordsById, duplicateIds, (record) => record.task.metadata.dependsOn ?? [], {
			code: 'dependency-cycle',
			field: 'dependsOn',
			label: 'dependency',
		}),
		...inspectCycles(
			recordsById,
			duplicateIds,
			(record) => {
				const { metadata } = record.task
				return metadata.parent ? [metadata.parent] : []
			},
			{ code: 'parent-cycle', field: 'parent', label: 'parent' },
		),
	)

	return Object.freeze(
		diagnostics.sort(
			(left, right) =>
				compareText(left.taskId, right.taskId) ||
				compareText(left.code, right.code) ||
				compareText(left.field ?? '', right.field ?? '') ||
				compareText(left.relatedTaskId ?? '', right.relatedTaskId ?? ''),
		),
	)
}

function freezeMapValues(source: Map<string, string[]>): ReadonlyMap<string, readonly string[]> {
	return new Map(
		[...source.entries()].map(([taskId, values]) => [
			taskId,
			Object.freeze([...values].sort(compareText)),
		]),
	)
}

/**
 * Validated, disposable graph projection built entirely from canonical task
 * records. Inverse relationships are derived and never written to task files.
 */
export class TaskGraph {
	readonly records: ReadonlyMap<string, TaskRecord>
	readonly dependencies: ReadonlyMap<string, readonly string[]>
	readonly blocks: ReadonlyMap<string, readonly string[]>
	readonly parents: ReadonlyMap<string, readonly string[]>
	readonly children: ReadonlyMap<string, readonly string[]>

	constructor(records: readonly TaskRecord[]) {
		const validatedRecords = parseCoreInput(TaskRecordsSchema, records, 'task graph construction')
		const diagnostics = inspectTaskGraph(validatedRecords)

		if (diagnostics.length > 0) {
			throw new TaskGraphError(diagnostics)
		}

		const recordsById = new Map<string, TaskRecord>()
		const dependencies = new Map<string, string[]>()
		const blocks = new Map<string, string[]>()
		const parents = new Map<string, string[]>()
		const children = new Map<string, string[]>()

		for (const record of [...validatedRecords].sort((left, right) =>
			compareText(left.task.metadata.id, right.task.metadata.id),
		)) {
			const { metadata } = record.task
			const taskId = metadata.id
			const parent = metadata.parent ? [metadata.parent] : []
			recordsById.set(taskId, record)
			dependencies.set(taskId, [...(metadata.dependsOn ?? [])])
			blocks.set(taskId, [])
			parents.set(taskId, parent)
			children.set(taskId, [])
		}

		for (const [taskId, taskDependencies] of dependencies) {
			for (const dependencyId of taskDependencies) {
				blocks.get(dependencyId)?.push(taskId)
			}
		}

		for (const [taskId, taskParents] of parents) {
			for (const parentId of taskParents) {
				children.get(parentId)?.push(taskId)
			}
		}

		this.records = recordsById
		this.dependencies = freezeMapValues(dependencies)
		this.blocks = freezeMapValues(blocks)
		this.parents = freezeMapValues(parents)
		this.children = freezeMapValues(children)
	}

	traverse(taskId: string, direction: 'dependencies' | 'blocks' | 'children'): readonly string[] {
		const validatedTaskId = parseCoreInput(z.string().min(1), taskId, 'task graph task ID')
		const validatedDirection = parseCoreInput(
			TaskGraphDirectionSchema,
			direction,
			'task graph direction',
		)

		if (!this.records.has(validatedTaskId)) {
			return Object.freeze([])
		}

		const relationships =
			validatedDirection === 'dependencies'
				? this.dependencies
				: validatedDirection === 'blocks'
					? this.blocks
					: this.children
		const visited = new Set<string>()
		const pending = [...(relationships.get(validatedTaskId) ?? [])]

		while (pending.length > 0) {
			pending.sort(compareText)
			const current = pending.shift()

			if (!current || visited.has(current)) {
				continue
			}

			visited.add(current)
			pending.push(...(relationships.get(current) ?? []))
		}

		return Object.freeze([...visited].sort(compareText))
	}

	/**
	 * Projects canonical and transitive inverse relationships for one task
	 * without persisting derived fields.
	 */
	derive(taskId: string): DerivedTaskRelationships {
		const validatedTaskId = parseCoreInput(z.string().min(1), taskId, 'task graph task ID')

		return Object.freeze({
			blockedBy: Object.freeze([...(this.dependencies.get(validatedTaskId) ?? [])]),
			blocks: Object.freeze([...(this.blocks.get(validatedTaskId) ?? [])]),
			children: Object.freeze([...(this.children.get(validatedTaskId) ?? [])]),
			subtasks: this.traverse(validatedTaskId, 'children'),
		})
	}
}

export function buildTaskGraph(records: readonly TaskRecord[]): TaskGraph {
	return new TaskGraph(records)
}
