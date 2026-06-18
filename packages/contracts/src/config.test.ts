import { describe, expect, it } from 'vitest'
import { ConfigSchema } from './config.ts'

describe('ConfigSchema', () => {
	it('accepts the versioned repository configuration', () => {
		const config = {
			schemaVersion: 1,
			project: {
				name: 'taskset',
			},
			tasks: {
				defaults: {
					status: 'todo',
					priority: 'medium',
					labels: ['taskset'],
				},
				statuses: ['todo', 'doing', 'blocked', 'done', 'canceled'],
				priorities: ['low', 'medium', 'high', 'urgent'],
			},
		} as const

		expect(ConfigSchema.parse(config)).toEqual(config)
	})

	it.each([
		['unsupported schema version', { schemaVersion: 2 }],
		['unknown fields', { schemaVersion: 1, storage: '.tasks' }],
		['empty project name', { schemaVersion: 1, project: { name: '' } }],
		[
			'duplicate default labels',
			{
				schemaVersion: 1,
				tasks: { defaults: { labels: ['core', 'core'] } },
			},
		],
		[
			'duplicate configured statuses',
			{
				schemaVersion: 1,
				tasks: { statuses: ['todo', 'todo'] },
			},
		],
		[
			'implicit default status outside configured statuses',
			{
				schemaVersion: 1,
				tasks: {
					statuses: ['doing', 'blocked'],
				},
			},
		],
		[
			'default status outside configured statuses',
			{
				schemaVersion: 1,
				tasks: {
					defaults: { status: 'todo' },
					statuses: ['doing', 'blocked'],
				},
			},
		],
		[
			'duplicate configured priorities',
			{
				schemaVersion: 1,
				tasks: { priorities: ['high', 'high'] },
			},
		],
		[
			'default priority outside configured priorities',
			{
				schemaVersion: 1,
				tasks: {
					defaults: { priority: 'medium' },
					priorities: ['high', 'urgent'],
				},
			},
		],
	])('rejects %s', (_, config) => {
		expect(ConfigSchema.safeParse(config).success).toBe(false)
	})
})
