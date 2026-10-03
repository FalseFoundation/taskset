import { parseDate } from '@taskset/utils'
import * as z from 'zod'
import { EntityIdSchema } from './entityId.ts'
import {
	type TASK_PRIORITIES,
	type TASK_RISKS,
	TaskIdSchema,
	TaskPrioritySchema,
	TaskRiskSchema,
} from './task.ts'

export const DOCUMENT_KINDS = ['story', 'flow', 'decision', 'research', 'runbook'] as const
export const DOCUMENT_STATUSES = [
	'draft',
	'ready',
	'active',
	'accepted',
	'superseded',
	'archived',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export interface DocumentMetadata {
	readonly id: string
	readonly type: DocumentKind
	readonly title: string
	readonly status: DocumentStatus
	readonly priority?: (typeof TASK_PRIORITIES)[number]
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
	readonly risk?: (typeof TASK_RISKS)[number]
	readonly dueDate?: string
	readonly related?: readonly string[]
	readonly duplicates?: readonly string[]
	readonly parent?: string
	readonly directories?: readonly string[]
	readonly projects?: readonly string[]
}

export interface DocumentFile {
	readonly metadata: DocumentMetadata
	readonly body: string
}

const TrimmedValueSchema = z
	.string()
	.min(1)
	.refine((value) => value === value.trim(), 'Value must not have surrounding whitespace')
const uniqueArray = <T>(schema: z.ZodType<T>) =>
	z
		.array(schema)
		.refine((values) => new Set(values).size === values.length, 'Values must be unique')

/** Document IDs share the same immutable short-hex contract as task IDs. */
export const DocumentIdSchema = EntityIdSchema
export const DocumentKindSchema = z.enum(DOCUMENT_KINDS)
export const DocumentStatusSchema = z.enum(DOCUMENT_STATUSES)
export const DocumentTitleSchema = TrimmedValueSchema
export const DocumentTimestampSchema = z
	.string()
	.refine((value) => parseDate(value) !== undefined, 'Expected a valid UTC timestamp')

export const DocumentMetadataSchema = z.strictObject({
	id: DocumentIdSchema,
	type: DocumentKindSchema,
	title: DocumentTitleSchema,
	status: DocumentStatusSchema,
	priority: TaskPrioritySchema.optional(),
	order: z.number().finite().nonnegative().optional(),
	createdAt: DocumentTimestampSchema,
	updatedAt: DocumentTimestampSchema,
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
	dueDate: DocumentTimestampSchema.optional(),
	related: uniqueArray(TaskIdSchema).optional(),
	duplicates: uniqueArray(TaskIdSchema).optional(),
	parent: TaskIdSchema.optional(),
	directories: uniqueArray(TrimmedValueSchema).optional(),
	projects: uniqueArray(TrimmedValueSchema).optional(),
}) satisfies z.ZodType<DocumentMetadata>

export const DocumentFileSchema = z.strictObject({
	metadata: DocumentMetadataSchema,
	body: z.string(),
}) satisfies z.ZodType<DocumentFile>
