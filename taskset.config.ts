import { defineConfig } from '@taskset/core'

export default defineConfig({
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
})
