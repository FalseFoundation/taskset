import { describe, expect, it } from 'vitest'
import {
	TASK_PRIORITIES,
	TASK_RISKS,
	TASK_STATUSES,
	TaskFileSchema,
	TaskMetadataSchema,
} from './task.ts'

const validV1Metadata = {
	id: 'TS-01J00000000000000000000000',
	title: 'Add deterministic task parsing',
	status: 'doing',
	priority: 'high',
	createdAt: '2026-06-12',
	updatedAt: '2026-06-12 01:02 UTC',
	labels: ['core'],
	dependsOn: [],
	files: ['packages/core/src/tasks/taskFile.ts'],
} as const

const validV2Metadata = {
	...validV1Metadata,
	owner: 'platform',
	assignees: ['maintainer'],
	reviewers: ['reviewer'],
	team: 'core',
	estimate: 90,
	effort: 3,
	risk: 'high',
	dueDate: '2026-06-30',
	related: ['TS-01J00000000000000000000001'],
	duplicates: ['TS-01J00000000000000000000002'],
	parent: 'TS-01J00000000000000000000003',
	directories: ['packages/core'],
	projects: ['taskset'],
} as const

describe('TaskMetadataSchema', () => {
	it('accepts the strict canonical task shape', () => {
		expect(TaskMetadataSchema.parse(validV2Metadata)).toEqual(validV2Metadata)
		expect(TASK_STATUSES).toContain('doing')
		expect(TASK_PRIORITIES).toContain('high')
		expect(TASK_RISKS).toContain('critical')
	})

	it.each([
		['schemaVersion', { ...validV1Metadata, schemaVersion: 2 }],
		['id', { ...validV1Metadata, id: 'TS-1' }],
		['status', { ...validV1Metadata, status: 'in-progress' }],
		['priority', { ...validV1Metadata, priority: 'critical' }],
		['createdAt', { ...validV1Metadata, createdAt: '2026-02-30' }],
		['updatedAt', { ...validV1Metadata, updatedAt: '2026-06-12 24:00 UTC' }],
		['estimate', { ...validV2Metadata, estimate: 1.5 }],
		['effort', { ...validV2Metadata, effort: -1 }],
		['risk', { ...validV2Metadata, risk: 'severe' }],
		['dueDate', { ...validV2Metadata, dueDate: 'tomorrow' }],
		['assignees', { ...validV2Metadata, assignees: ['maintainer', 'maintainer'] }],
	])('rejects an invalid %s', (_, metadata) => {
		expect(TaskMetadataSchema.safeParse(metadata).success).toBe(false)
	})

	it('rejects unknown derived fields', () => {
		expect(TaskMetadataSchema.safeParse({ ...validV2Metadata, blocks: [] }).success).toBe(false)
	})

	it('accepts documented legacy ISO timestamps', () => {
		expect(
			TaskMetadataSchema.safeParse({
				...validV2Metadata,
				createdAt: '2026-06-12T00:00:00.000Z',
				updatedAt: '2026-06-12T01:02:03.004Z',
			}).success,
		).toBe(true)
	})
})

describe('TaskFileSchema', () => {
	it('keeps Markdown body content separate from metadata', () => {
		const task = {
			metadata: validV2Metadata,
			body: '# Context\n\nKeep this text human-readable.\n',
		}

		expect(TaskFileSchema.parse(task)).toEqual(task)
	})
})
