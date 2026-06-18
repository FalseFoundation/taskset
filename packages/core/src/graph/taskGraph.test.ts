import type { TaskFile } from '@taskset/contracts'
import { describe, expect, it } from 'vitest'
import type { TaskRecord } from '../tasks/taskRepository.ts'
import { buildTaskGraph, inspectTaskGraph, TaskGraphError } from './taskGraph.ts'

function task(
	id: string,
	options: {
		readonly dependsOn?: readonly string[]
		readonly parent?: string
		readonly related?: readonly string[]
	} = {},
): TaskRecord {
	const value: TaskFile = {
		metadata: {
			id,
			title: id,
			status: 'todo',
			createdAt: '2026-06-12',
			updatedAt: '2026-06-12',
			...(options.dependsOn?.length ? { dependsOn: options.dependsOn } : {}),
			...(options.parent ? { parent: options.parent } : {}),
			...(options.related?.length ? { related: options.related } : {}),
		},
		body: '',
	}

	return {
		relativePath: `.taskset/tasks/${id}.md`,
		task: value,
	}
}

const first = 'TS-01J00000000000000000000000'
const second = 'TS-01J00000000000000000000001'
const third = 'TS-01J00000000000000000000002'

describe('task graph', () => {
	it('derives stable dependency and blocking traversal', () => {
		const graph = buildTaskGraph([
			task(third, { dependsOn: [second], parent: second }),
			task(first),
			task(second, { dependsOn: [first], parent: first }),
		])

		expect(graph.dependencies.get(third)).toEqual([second])
		expect(graph.blocks.get(first)).toEqual([second])
		expect(graph.traverse(third, 'dependencies')).toEqual([first, second])
		expect(graph.traverse(first, 'blocks')).toEqual([second, third])
		expect(graph.derive(first)).toEqual({
			blockedBy: [],
			blocks: [second],
			children: [second],
			subtasks: [second, third],
		})
	})

	it('reports duplicate IDs, missing targets, self-dependencies, and cycles', () => {
		const diagnostics = inspectTaskGraph([
			task(first),
			{ ...task(first), relativePath: '.taskset/tasks/duplicate.md' },
			task(second),
			task(third, {
				dependsOn: [third, 'TS-01J00000000000000000000003'],
				related: ['TS-01J00000000000000000000004'],
			}),
		])

		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			'duplicate-id',
			'missing-dependency',
			'missing-reference',
			'self-dependency',
		])
		expect(() =>
			buildTaskGraph([task(first, { dependsOn: [second] }), task(second, { dependsOn: [first] })]),
		).toThrow(TaskGraphError)
		expect(() =>
			buildTaskGraph([task(first, { parent: second }), task(second, { parent: first })]),
		).toThrow(TaskGraphError)
	})
})
