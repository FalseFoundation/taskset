import type { TaskFile } from '@taskset/contracts'
import { describe, expect, it } from 'vitest'
import type { TaskRecord } from '../tasks/taskRepository.ts'
import { buildTaskGraph, inspectTaskGraph, TaskGraphError } from './taskGraph.ts'

function task(id: string, dependsOn: readonly string[] = []): TaskRecord {
	const value: TaskFile = {
		metadata: {
			schemaVersion: 1,
			id,
			title: id,
			status: 'todo',
			createdAt: '2026-06-12',
			updatedAt: '2026-06-12',
			...(dependsOn.length > 0 ? { dependsOn } : {}),
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
		const graph = buildTaskGraph([task(third, [second]), task(first), task(second, [first])])

		expect(graph.dependencies.get(third)).toEqual([second])
		expect(graph.blocks.get(first)).toEqual([second])
		expect(graph.traverse(third, 'dependencies')).toEqual([first, second])
		expect(graph.traverse(first, 'blocks')).toEqual([second, third])
	})

	it('reports duplicate IDs, missing targets, self-dependencies, and cycles', () => {
		const diagnostics = inspectTaskGraph([
			task(first),
			{ ...task(first), relativePath: '.taskset/tasks/duplicate.md' },
			task(second),
			task(third, [third, 'TS-01J00000000000000000000003']),
		])

		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			'duplicate-id',
			'missing-dependency',
			'self-dependency',
		])
		expect(() => buildTaskGraph([task(first, [second]), task(second, [first])])).toThrow(
			TaskGraphError,
		)
	})
})
