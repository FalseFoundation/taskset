import * as z from 'zod'
import {
	TaskIdSchema,
	type TaskPriority,
	TaskPrioritySchema,
	type TaskRisk,
	TaskRiskSchema,
	type TaskStatus,
	TaskStatusSchema,
	TaskTimestampSchema,
	TaskTitleSchema,
} from './task.ts'

export const SYNC_DIRECTIONS = ['pull', 'push', 'bidirectional'] as const
export const SYNC_DELETION_BEHAVIORS = ['preserve', 'delete'] as const
export const SYNC_TASK_FIELDS = [
	'title',
	'status',
	'priority',
	'labels',
	'dependsOn',
	'files',
	'owner',
	'assignees',
	'reviewers',
	'team',
	'estimate',
	'effort',
	'risk',
	'dueDate',
	'related',
	'duplicates',
	'parent',
	'directories',
	'projects',
	'body',
] as const

export type SyncDirection = (typeof SYNC_DIRECTIONS)[number]
export type SyncDeletionBehavior = (typeof SYNC_DELETION_BEHAVIORS)[number]
export type SyncTaskField = (typeof SYNC_TASK_FIELDS)[number]

export interface SyncTaskData {
	readonly title: string
	readonly status: TaskStatus
	readonly priority?: TaskPriority
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
	readonly body: string
}

export interface SyncIdentity {
	readonly provider: string
	readonly externalId: string
	readonly taskId?: string
}

export interface SyncBaseline {
	readonly data: SyncTaskData | null
	readonly localUpdatedAt?: string
	readonly externalRevision?: string
}

export interface SyncExternalRecord {
	readonly identity: SyncIdentity
	readonly revision: string
	readonly data: SyncTaskData | null
	readonly baseline?: SyncBaseline
}

export interface SyncFieldConflict {
	readonly field: SyncTaskField | 'record'
	readonly baseline: unknown
	readonly local: unknown
	readonly external: unknown
}

export interface SyncConflict {
	readonly identity: SyncIdentity
	readonly taskId?: string
	readonly fields: readonly SyncFieldConflict[]
	readonly message: string
}

export type SyncChangeAction = 'create' | 'update' | 'delete'
export type SyncChangeTarget = 'local' | 'external'

export interface SyncChange {
	readonly target: SyncChangeTarget
	readonly action: SyncChangeAction
	readonly identity: SyncIdentity
	readonly taskId: string
	readonly data?: SyncTaskData
	readonly expectedRevision?: string
	readonly expectedUpdatedAt?: string
}

export interface SyncCheckpoint {
	readonly identity: SyncIdentity
	readonly taskId: string
	readonly baseline: SyncBaseline
	readonly expectedRevision?: string
}

export interface SyncPlan {
	readonly direction: SyncDirection
	readonly deletionBehavior: SyncDeletionBehavior
	readonly generatedAt: string
	readonly localFingerprint: string
	readonly externalFingerprint: string
	readonly changes: readonly SyncChange[]
	readonly checkpoints: readonly SyncCheckpoint[]
	readonly unchanged: readonly SyncIdentity[]
	readonly conflicts: readonly SyncConflict[]
}

export interface SyncApplyResult {
	readonly applied: readonly SyncChange[]
	readonly unchanged: readonly SyncIdentity[]
	readonly localFingerprint: string
	readonly externalFingerprint: string
}

export interface SyncAdapter {
	readonly id: string
	read(): Promise<readonly SyncExternalRecord[]>
	apply(
		changes: readonly SyncChange[],
		checkpoints: readonly SyncCheckpoint[],
	): Promise<readonly SyncExternalRecord[]>
}

export const SyncDirectionSchema = z.enum(SYNC_DIRECTIONS)
export const SyncDeletionBehaviorSchema = z.enum(SYNC_DELETION_BEHAVIORS)
const TrimmedValueSchema = z
	.string()
	.min(1)
	.refine((value) => value === value.trim(), 'Value must not have surrounding whitespace')
const uniqueArray = <T>(schema: z.ZodType<T>) =>
	z
		.array(schema)
		.refine((values) => new Set(values).size === values.length, 'Values must be unique')
export const SyncTaskDataSchema = z.strictObject({
	title: TaskTitleSchema,
	status: TaskStatusSchema,
	priority: TaskPrioritySchema.optional(),
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
	body: z.string(),
}) satisfies z.ZodType<SyncTaskData>

export const SyncIdentitySchema = z.strictObject({
	provider: z.string().min(1),
	externalId: z.string().min(1),
	taskId: TaskIdSchema.optional(),
}) satisfies z.ZodType<SyncIdentity>

export const SyncBaselineSchema = z.strictObject({
	data: SyncTaskDataSchema.nullable(),
	localUpdatedAt: TaskTimestampSchema.optional(),
	externalRevision: z.string().min(1).optional(),
}) satisfies z.ZodType<SyncBaseline>

export const SyncExternalRecordSchema = z.strictObject({
	identity: SyncIdentitySchema,
	revision: z.string().min(1),
	data: SyncTaskDataSchema.nullable(),
	baseline: SyncBaselineSchema.optional(),
}) satisfies z.ZodType<SyncExternalRecord>

export const SyncChangeSchema = z.strictObject({
	target: z.enum(['local', 'external']),
	action: z.enum(['create', 'update', 'delete']),
	identity: SyncIdentitySchema,
	taskId: TaskIdSchema,
	data: SyncTaskDataSchema.optional(),
	expectedRevision: z.string().min(1).optional(),
	expectedUpdatedAt: TaskTimestampSchema.optional(),
}) satisfies z.ZodType<SyncChange>

export const SyncCheckpointSchema = z.strictObject({
	identity: SyncIdentitySchema,
	taskId: TaskIdSchema,
	baseline: SyncBaselineSchema,
	expectedRevision: z.string().min(1).optional(),
}) satisfies z.ZodType<SyncCheckpoint>

export const SyncConflictSchema = z.strictObject({
	identity: SyncIdentitySchema,
	taskId: TaskIdSchema.optional(),
	fields: z.array(
		z.strictObject({
			field: z.enum([...SYNC_TASK_FIELDS, 'record']),
			baseline: z.unknown(),
			local: z.unknown(),
			external: z.unknown(),
		}),
	),
	message: z.string(),
}) satisfies z.ZodType<SyncConflict>

/**
 * Provider-neutral synchronization plan contract. Changes and checkpoints are
 * validated together before core applies local or adapter mutations.
 */
export const SyncPlanSchema = z.strictObject({
	direction: SyncDirectionSchema,
	deletionBehavior: SyncDeletionBehaviorSchema,
	generatedAt: TaskTimestampSchema,
	localFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
	externalFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
	changes: z.array(SyncChangeSchema),
	checkpoints: z.array(SyncCheckpointSchema),
	unchanged: z.array(SyncIdentitySchema),
	conflicts: z.array(SyncConflictSchema),
}) satisfies z.ZodType<SyncPlan>
