import { parseDate } from '@taskset/utils'
import * as z from 'zod'

export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done', 'canceled'] as const
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export const TASK_RISKS = ['low', 'medium', 'high', 'critical'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskRisk = (typeof TASK_RISKS)[number]

export interface TaskMetadata {
	readonly id: string
	readonly title: string
	readonly status: TaskStatus
	readonly priority?: TaskPriority
	readonly order?: number
	readonly createdAt: string
	readonly updatedAt: string
	readonly labels?: readonly string[]
	readonly dependsOn?: readonly string[]
	readonly files?: readonly string[]
	readonly owner?: string
	readonly assignees?: readonly string[]
	readonly reviewers?: readonly string[]
	readonly team?: string
	readonly estimate?: number
	readonly effort?: number
	readonly risk?: TaskRisk
	readonly dueDate?: string
	readonly related?: readonly string[]
	readonly duplicates?: readonly string[]
	readonly parent?: string
	readonly directories?: readonly string[]
	readonly projects?: readonly string[]
}

export interface TaskFile {
	readonly metadata: TaskMetadata
	readonly body: string
}

/** Strict immutable ID contract shared by canonical files and public inputs. */
export const TaskIdSchema = z
	.string()
	.regex(
		/^TS-[0-9A-HJKMNP-TV-Z]{26}$/u,
		'Expected a task ID in the form TS- followed by a 26-character ULID',
	)

export const TaskTitleSchema = z
	.string()
	.min(1, 'Title must not be empty')
	.refine((title) => title === title.trim(), 'Title must not have surrounding whitespace')

export const TaskStatusSchema = z.enum(TASK_STATUSES)
export const TaskPrioritySchema = z.enum(TASK_PRIORITIES)
export const TaskRiskSchema = z.enum(TASK_RISKS)

export const TaskTimestampSchema = z
	.string()
	.refine(
		(value) => parseDate(value) !== undefined,
		'Expected a UTC timestamp as YYYY-MM-DD or YYYY-MM-DD HH:mm UTC',
	)

const TrimmedValueSchema = z
	.string()
	.min(1, 'Value must not be empty')
	.refine((value) => value === value.trim(), 'Value must not have surrounding whitespace')
const uniqueArray = <T>(schema: z.ZodType<T>) =>
	z
		.array(schema)
		.refine((values) => new Set(values).size === values.length, 'Values must be unique')

export const TaskMetadataSchema = z.strictObject({
	id: TaskIdSchema,
	title: TaskTitleSchema,
	status: TaskStatusSchema,
	priority: TaskPrioritySchema.optional(),
	order: z.number().finite().nonnegative().optional(),
	createdAt: TaskTimestampSchema,
	updatedAt: TaskTimestampSchema,
	labels: uniqueArray(TrimmedValueSchema).optional(),
	dependsOn: uniqueArray(TaskIdSchema).optional(),
	files: uniqueArray(TrimmedValueSchema).optional(),
	owner: TrimmedValueSchema.optional(),
	assignees: uniqueArray(TrimmedValueSchema).optional(),
	reviewers: uniqueArray(TrimmedValueSchema).optional(),
	team: TrimmedValueSchema.optional(),
	estimate: z.number().int().nonnegative().optional(),
	effort: z.number().finite().nonnegative().optional(),
	risk: TaskRiskSchema.optional(),
	dueDate: TaskTimestampSchema.optional(),
	related: uniqueArray(TaskIdSchema).optional(),
	duplicates: uniqueArray(TaskIdSchema).optional(),
	parent: TaskIdSchema.optional(),
	directories: uniqueArray(TrimmedValueSchema).optional(),
	projects: uniqueArray(TrimmedValueSchema).optional(),
}) satisfies z.ZodType<TaskMetadata>

/** Canonical task document contract: validated metadata plus authored Markdown. */
export const TaskFileSchema = z.strictObject({
	metadata: TaskMetadataSchema,
	body: z.string(),
}) satisfies z.ZodType<TaskFile>
