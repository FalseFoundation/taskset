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
		priorities: ['low', 'medium', 'high', 'urgent'],
	},
})
