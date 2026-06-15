import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TaskFile } from '@taskset/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import { createTask, type TaskRecord } from '../tasks/taskRepository.ts'
import { queryTaskRecords, queryTasks } from './taskQuery.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

function record(
	id: string,
	title: string,
	options: {
		readonly assignees?: readonly string[]
		readonly body?: string
		readonly createdAt?: string
		readonly directories?: readonly string[]
		readonly dueDate?: string
		readonly duplicates?: readonly string[]
		readonly effort?: number
		readonly estimate?: number
		readonly files?: readonly string[]
		readonly labels?: readonly string[]
		readonly owner?: string
		readonly priority?: 'low' | 'medium' | 'high' | 'urgent'
		readonly projects?: readonly string[]
		readonly risk?: 'low' | 'medium' | 'high' | 'critical'
		readonly status?: 'todo' | 'doing' | 'blocked' | 'done' | 'canceled'
		readonly updatedAt?: string
	} = {},
): TaskRecord {
	const task: TaskFile = {
		metadata: {
			schemaVersion: 2,
			id,
			title,
			status: options.status ?? 'todo',
			...(options.priority ? { priority: options.priority } : {}),
			createdAt: options.createdAt ?? '2026-06-12',
			updatedAt: options.updatedAt ?? '2026-06-12',
			...(options.labels ? { labels: options.labels } : {}),
			...(options.owner ? { owner: options.owner } : {}),
			...(options.assignees ? { assignees: options.assignees } : {}),
			...(options.risk ? { risk: options.risk } : {}),
			...(options.estimate !== undefined ? { estimate: options.estimate } : {}),
			...(options.effort !== undefined ? { effort: options.effort } : {}),
			...(options.dueDate ? { dueDate: options.dueDate } : {}),
			...(options.duplicates ? { duplicates: options.duplicates } : {}),
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

	it('filters inclusive planning and timestamp ranges plus duplicate relationships', () => {
		const duplicateId = 'TS-01J00000000000000000000009'
		const records = [
			record('TS-01J00000000000000000000000', 'Match', {
				estimate: 90,
				effort: 3,
				dueDate: '2026-06-20',
				createdAt: '2026-06-10',
				updatedAt: '2026-06-15',
				duplicates: [duplicateId],
			}),
			record('TS-01J00000000000000000000001', 'Outside', {
				estimate: 30,
				effort: 8,
				dueDate: '2026-06-30',
				createdAt: '2026-06-01',
				updatedAt: '2026-06-25',
			}),
		]

		expect(
			queryTaskRecords(records, {
				duplicate: duplicateId,
				estimateMin: 90,
				estimateMax: 90,
				effortMin: 3,
				effortMax: 3,
				dueAfter: '2026-06-20',
				dueBefore: '2026-06-20',
				createdAfter: '2026-06-10',
				createdBefore: '2026-06-10',
				updatedAfter: '2026-06-15',
				updatedBefore: '2026-06-15',
			}).map((item) => item.task.metadata.title),
		).toEqual(['Match'])
	})

	it('normalizes repository paths, composes path groups, and expands impact after direct filters', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-query-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const directId = 'TS-01J00000000000000000000000'
		const impactedId = 'TS-01J00000000000000000000001'

		await createTask(
			repository,
			{
				title: 'Direct',
				owner: 'platform',
				files: ['packages/core/src/index.ts'],
				directories: ['packages/core'],
			},
			{ createId: () => directId },
		)
		await createTask(
			repository,
			{
				title: 'Impacted',
				owner: 'other',
				dependsOn: [directId],
				files: ['packages/cli/src/cli.ts'],
			},
			{ createId: () => impactedId },
		)

		const result = await queryTasks(repository, {
			owners: ['platform'],
			files: [path.join(rootDirectory, 'packages/core'), 'packages/missing'],
			directories: ['packages/core/src'],
			impact: true,
		})

		expect(result.direct.map((item) => item.task.metadata.id)).toEqual([directId])
		expect(result.impacted.map((item) => item.task.metadata.id)).toEqual([impactedId])
		expect((await queryTasks(repository, { files: ['packages/missing'] })).direct).toEqual([])
	})
})
