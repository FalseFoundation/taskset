import * as z from 'zod'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from './task.ts'

export interface ProjectConfig {
	readonly name: string
}

export interface TaskDefaultsConfig {
	readonly status?: TaskStatus
	readonly priority?: TaskPriority
	readonly labels?: readonly string[]
}

export interface TasksConfig {
	readonly defaults?: TaskDefaultsConfig
	readonly priorities?: readonly TaskPriority[]
}

export interface Config {
	readonly schemaVersion: 1
	readonly project?: ProjectConfig
	readonly tasks?: TasksConfig
}

const ProjectConfigSchema = z.strictObject({
	name: z
		.string()
		.min(1, 'Project name must not be empty')
		.refine((name) => name === name.trim(), 'Project name must not have surrounding whitespace'),
})

const TaskDefaultsConfigSchema = z.strictObject({
	status: z.enum(TASK_STATUSES).optional(),
	priority: z.enum(TASK_PRIORITIES).optional(),
	labels: z
		.array(z.string().min(1, 'Default labels must not be empty'))
		.refine((labels) => new Set(labels).size === labels.length, 'Default labels must be unique')
		.optional(),
})

function uniqueValues(values: readonly string[]): boolean {
	return new Set(values).size === values.length
}

const TasksConfigSchema = z
	.strictObject({
		defaults: TaskDefaultsConfigSchema.optional(),
		priorities: z
			.array(z.enum(TASK_PRIORITIES))
			.min(1, 'At least one priority must be configured')
			.refine(uniqueValues, 'Configured priorities must be unique')
			.optional(),
	})
	.superRefine((tasks, context) => {
		const defaultPriority = tasks.defaults?.priority

		if (defaultPriority && tasks.priorities && !tasks.priorities.includes(defaultPriority)) {
			context.addIssue({
				code: 'custom',
				message: 'Default priority must be included in configured priorities',
				path: ['defaults', 'priority'],
			})
		}
	})

export const ConfigSchema = z.strictObject({
	schemaVersion: z.literal(1),
	project: ProjectConfigSchema.optional(),
	tasks: TasksConfigSchema.optional(),
}) satisfies z.ZodType<Config>
