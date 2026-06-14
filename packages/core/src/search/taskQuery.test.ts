import type { TaskFile } from '@taskset/contracts'
import { describe, expect, it } from 'vitest'
import type { TaskRecord } from '../tasks/taskRepository.ts'
import { queryTaskRecords } from './taskQuery.ts'

function record(
	id: string,
	title: string,
	options: {
		readonly assignees?: readonly string[]
		readonly body?: string
		readonly directories?: readonly string[]
		readonly files?: readonly string[]
		readonly labels?: readonly string[]
		readonly owner?: string
		readonly priority?: 'low' | 'medium' | 'high' | 'urgent'
		readonly projects?: readonly string[]
		readonly risk?: 'low' | 'medium' | 'high' | 'critical'
		readonly status?: 'todo' | 'doing' | 'blocked' | 'done' | 'canceled'
	} = {},
): TaskRecord {
	const task: TaskFile = {
		metadata: {
			schemaVersion: 2,
			id,
			title,
			status: options.status ?? 'todo',
			...(options.priority ? { priority: options.priority } : {}),
			createdAt: '2026-06-12',
			updatedAt: '2026-06-12',
			...(options.labels ? { labels: options.labels } : {}),
			...(options.owner ? { owner: options.owner } : {}),
			...(options.assignees ? { assignees: options.assignees } : {}),
			...(options.risk ? { risk: options.risk } : {}),
			...(options.files ? { files: options.files } : {}),
			...(options.directories ? { directories: options.directories } : {}),
			...(options.projects ? { projects: options.projects } : {}),
		},
		body: options.body ?? '',
	}

	return { relativePath: `.taskset/tasks/${id}.md`, task }
}

describe('task queries', () => {
	it('combines filters and keeps deterministic sort ordering', () => {
		const records = [
			record('TS-01J00000000000000000000002', 'Zulu', {
				labels: ['core', 'query'],
				priority: 'high',
				status: 'doing',
			}),
			record('TS-01J00000000000000000000001', 'Alpha', {
				labels: ['core'],
				priority: 'high',
				status: 'doing',
			}),
			record('TS-01J00000000000000000000000', 'Other', { status: 'done' }),
		]

		expect(
			queryTaskRecords(records, {
				statuses: ['doing'],
				priorities: ['high'],
				labels: ['core'],
				sortBy: 'title',
			}).map((item) => item.task.metadata.title),
		).toEqual(['Alpha', 'Zulu'])
		expect(queryTaskRecords(records, { labels: ['missing'] })).toEqual([])
	})

	it('searches normalized Unicode titles and Markdown bodies', () => {
		const records = [
			record('TS-01J00000000000000000000000', 'Unicode', {
				body: '# Context\n\nسلام دنیا\n',
			}),
		]

		expect(queryTaskRecords(records, { text: 'سلام' })).toHaveLength(1)
		expect(queryTaskRecords(records, { text: 'UNICODE' })).toHaveLength(1)
	})

	it('filters new metadata and file or directory containment', () => {
		const records = [
			record('TS-01J00000000000000000000000', 'Core', {
				owner: 'platform',
				assignees: ['maintainer'],
				risk: 'high',
				files: ['packages/core/src/index.ts'],
				directories: ['packages/core/src'],
				projects: ['taskset'],
			}),
			record('TS-01J00000000000000000000001', 'CLI'),
		]

		expect(
			queryTaskRecords(records, {
				owners: ['platform'],
				assignees: ['maintainer'],
				risks: ['high'],
				projects: ['taskset'],
				files: ['packages/core'],
			}).map((item) => item.task.metadata.title),
		).toEqual(['Core'])
		expect(queryTaskRecords(records, { directories: ['packages/core/src/index.ts'] })).toHaveLength(
			1,
		)
	})
})
