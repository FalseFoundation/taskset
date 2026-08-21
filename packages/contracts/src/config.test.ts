import { describe, expect, it } from 'vitest'
import { ConfigSchema } from './config.ts'

describe('ConfigSchema', () => {
	it('accepts the versionless repository configuration', () => {
		const config = {
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
		['unknown fields', { storage: '.tasks' }],
		['empty project name', { project: { name: '' } }],
		[
			'duplicate default labels',
			{
				tasks: { defaults: { labels: ['core', 'core'] } },
			},
		],
		[
			'duplicate configured statuses',
			{
				tasks: { statuses: ['todo', 'todo'] },
			},
		],
		[
			'implicit default status outside configured statuses',
			{
				tasks: {
					statuses: ['doing', 'blocked'],
				},
			},
		],
		[
			'default status outside configured statuses',
			{
				tasks: {
					defaults: { status: 'todo' },
					statuses: ['doing', 'blocked'],
				},
			},
		],
		[
			'duplicate configured priorities',
			{
				tasks: { priorities: ['high', 'high'] },
			},
		],
		[
			'default priority outside configured priorities',
			{
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
