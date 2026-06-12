import { describe, expect, it } from 'vitest'
import {
	formatTaskTimestamp,
	parseTaskTimestamp,
	TASK_PRIORITIES,
	TASK_STATUSES,
	TaskFileSchema,
	TaskMetadataSchema,
} from './task.ts'

const validMetadata = {
	schemaVersion: 1,
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

describe('TaskMetadataSchema', () => {
	it('accepts the canonical task metadata shape', () => {
		expect(TaskMetadataSchema.parse(validMetadata)).toEqual(validMetadata)
		expect(TASK_STATUSES).toContain('doing')
		expect(TASK_PRIORITIES).toContain('high')
	})

	it.each([
		['schemaVersion', { ...validMetadata, schemaVersion: 2 }],
		['id', { ...validMetadata, id: 'TS-1' }],
		['status', { ...validMetadata, status: 'in-progress' }],
		['priority', { ...validMetadata, priority: 'critical' }],
		['createdAt', { ...validMetadata, createdAt: '2026-02-30' }],
		['updatedAt', { ...validMetadata, updatedAt: '2026-06-12 24:00 UTC' }],
	])('rejects an invalid %s', (_, metadata) => {
		expect(TaskMetadataSchema.safeParse(metadata).success).toBe(false)
	})

	it('accepts legacy ISO timestamps while formatting new timestamps for humans', () => {
		expect(
			TaskMetadataSchema.safeParse({
				...validMetadata,
				createdAt: '2026-06-12T00:00:00.000Z',
				updatedAt: '2026-06-12T01:02:03.004Z',
			}).success,
		).toBe(true)
		expect(parseTaskTimestamp('2026-06-12 01:02 UTC')).toBe(Date.UTC(2026, 5, 12, 1, 2))
		expect(formatTaskTimestamp(new Date('2026-06-12T01:02:03.004Z'))).toBe('2026-06-12 01:02 UTC')
		expect(formatTaskTimestamp(new Date('2026-06-12T01:02:03.004Z'), { includeTime: false })).toBe(
			'2026-06-12',
		)
	})

	it('rejects unknown metadata fields instead of discarding them', () => {
		const result = TaskMetadataSchema.safeParse({
			...validMetadata,
			blocks: ['TS-01J11111111111111111111111'],
		})

		expect(result.success).toBe(false)
	})

	it('accepts omitted optional metadata consistently', () => {
		const {
			dependsOn: _dependsOn,
			files: _files,
			labels: _labels,
			priority: _priority,
			...required
		} = validMetadata

		expect(TaskMetadataSchema.parse(required)).toEqual(required)
	})
})

describe('TaskFileSchema', () => {
	it('keeps Markdown body content separate from metadata', () => {
		const task = {
			metadata: validMetadata,
			body: '# Context\n\nKeep this text human-readable.\n',
		}

		expect(TaskFileSchema.parse(task)).toEqual(task)
	})
})
