import { describe, expect, it } from 'vitest'
import { SyncExternalRecordSchema, SyncIdentitySchema, SyncTaskDataSchema } from './sync.ts'

describe('synchronization contracts', () => {
	it('validates external identity mappings and task data without defining another store', () => {
		expect(
			SyncExternalRecordSchema.parse({
				identity: {
					provider: 'fixture',
					externalId: 'remote-1',
					taskId: 'TS-01J00000000000000000000000',
				},
				revision: '1',
				data: {
					title: 'External task',
					status: 'todo',
					body: '',
				},
			}),
		).toMatchObject({
			identity: { provider: 'fixture', externalId: 'remote-1' },
			revision: '1',
		})
	})

	it('rejects unknown fields and malformed mappings', () => {
		expect(() =>
			SyncTaskDataSchema.parse({
				title: 'Task',
				status: 'todo',
				body: '',
				blocks: [],
			}),
		).toThrow()
		expect(() => SyncIdentitySchema.parse({ provider: '', externalId: '' })).toThrow()
	})
})
