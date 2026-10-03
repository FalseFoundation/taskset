import * as z from 'zod'
import { CONCERN_CLASSES } from './document.ts'
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
	readonly statuses?: readonly TaskStatus[]
	readonly priorities?: readonly TaskPriority[]
}

export interface CloseoutConfig {
	readonly enforceChildCompletion?: boolean
	readonly blockDoneWithOpenConcerns?: boolean
	readonly requireLessonWhenLabeled?: readonly string[]
}

export interface TaxonomyConfig {
	readonly labels?: readonly string[]
	readonly projects?: readonly string[]
	readonly concernClasses?: readonly string[]
	/** Doctor/create enforcement mode when an allowlist is configured. Default `error`. */
	readonly mode?: 'error' | 'warn'
}

export interface DoctorConfig {
	readonly activeConcernRequiresOwner?: boolean
	/** When set, research in `ready` older than N days without a related follow-up task is reported. */
	readonly staleResearchDays?: number
}

export interface Config {
	readonly project?: ProjectConfig
	readonly tasks?: TasksConfig
	readonly closeout?: CloseoutConfig
	readonly taxonomy?: TaxonomyConfig
	readonly doctor?: DoctorConfig
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

const TrimmedUniqueStringListSchema = z
	.array(
		z
			.string()
			.min(1)
			.refine((value) => value === value.trim(), 'Value must not have surrounding whitespace'),
	)
	.refine(uniqueValues, 'Values must be unique')

const TasksConfigSchema = z
	.strictObject({
		defaults: TaskDefaultsConfigSchema.optional(),
		statuses: z
			.array(z.enum(TASK_STATUSES))
			.min(1, 'At least one status must be configured')
			.refine(uniqueValues, 'Configured statuses must be unique')
			.optional(),
		priorities: z
			.array(z.enum(TASK_PRIORITIES))
			.min(1, 'At least one priority must be configured')
			.refine(uniqueValues, 'Configured priorities must be unique')
			.optional(),
	})
	.superRefine((tasks, context) => {
		const defaultStatus = tasks.defaults?.status ?? 'todo'
		const defaultPriority = tasks.defaults?.priority

		if (tasks.statuses && !tasks.statuses.includes(defaultStatus)) {
			context.addIssue({
				code: 'custom',
				message: 'Default status must be included in configured statuses',
				path: ['defaults', 'status'],
			})
		}

		if (defaultPriority && tasks.priorities && !tasks.priorities.includes(defaultPriority)) {
			context.addIssue({
				code: 'custom',
				message: 'Default priority must be included in configured priorities',
				path: ['defaults', 'priority'],
			})
		}
	})

const CloseoutConfigSchema = z.strictObject({
	enforceChildCompletion: z.boolean().optional(),
	blockDoneWithOpenConcerns: z.boolean().optional(),
	requireLessonWhenLabeled: TrimmedUniqueStringListSchema.optional(),
})

const TaxonomyConfigSchema = z
	.strictObject({
		labels: TrimmedUniqueStringListSchema.optional(),
		projects: TrimmedUniqueStringListSchema.optional(),
		concernClasses: TrimmedUniqueStringListSchema.optional(),
		mode: z.enum(['error', 'warn']).optional(),
	})
	.superRefine((taxonomy, context) => {
		for (const value of taxonomy.concernClasses ?? []) {
			if (!(CONCERN_CLASSES as readonly string[]).includes(value)) {
				context.addIssue({
					code: 'custom',
					path: ['concernClasses'],
					message: `Unknown concern class "${value}"`,
				})
			}
		}
	})

const DoctorConfigSchema = z.strictObject({
	activeConcernRequiresOwner: z.boolean().optional(),
	staleResearchDays: z.number().int().positive().optional(),
})

/**
 * Strict repository behavior configuration. It intentionally excludes storage
 * relocation and canonical entity data.
 */
export const ConfigSchema = z.strictObject({
	project: ProjectConfigSchema.optional(),
	tasks: TasksConfigSchema.optional(),
	closeout: CloseoutConfigSchema.optional(),
	taxonomy: TaxonomyConfigSchema.optional(),
	doctor: DoctorConfigSchema.optional(),
}) satisfies z.ZodType<Config>
