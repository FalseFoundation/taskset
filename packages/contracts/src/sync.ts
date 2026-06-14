import * as z from 'zod'
import { TaskMetadataSchema } from './task.ts'

export const SYNC_DIRECTIONS = ['pull', 'push', 'bidirectional'] as const
export const SYNC_DELETION_BEHAVIORS = ['preserve', 'delete'] as const
export const SYNC_TASK_FIELDS = [
	'title',
	'status',
	'priority',
	'labels',
	'dependsOn',
	'files',
	'body',
] as const

export type SyncDirection = (typeof SYNC_DIRECTIONS)[number]
export type SyncDeletionBehavior = (typeof SYNC_DELETION_BEHAVIORS)[number]
export type SyncTaskField = (typeof SYNC_TASK_FIELDS)[number]

export interface SyncTaskData {
	readonly title: string
	readonly status: z.infer<typeof TaskMetadataSchema>['status']
	readonly priority?: z.infer<typeof TaskMetadataSchema>['priority']
	readonly labels?: readonly string[]
	readonly dependsOn?: readonly string[]
	readonly files?: readonly string[]
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
export const SyncTaskDataSchema = z.strictObject({
	title: TaskMetadataSchema.shape.title,
	status: TaskMetadataSchema.shape.status,
	priority: TaskMetadataSchema.shape.priority,
	labels: TaskMetadataSchema.shape.labels,
	dependsOn: TaskMetadataSchema.shape.dependsOn,
	files: TaskMetadataSchema.shape.files,
	body: z.string(),
}) satisfies z.ZodType<SyncTaskData>

export const SyncIdentitySchema = z.strictObject({
	provider: z.string().min(1),
	externalId: z.string().min(1),
	taskId: TaskMetadataSchema.shape.id.optional(),
}) satisfies z.ZodType<SyncIdentity>

export const SyncBaselineSchema = z.strictObject({
	data: SyncTaskDataSchema.nullable(),
	localUpdatedAt: TaskMetadataSchema.shape.updatedAt.optional(),
	externalRevision: z.string().min(1).optional(),
}) satisfies z.ZodType<SyncBaseline>

export const SyncExternalRecordSchema = z.strictObject({
	identity: SyncIdentitySchema,
	revision: z.string().min(1),
	data: SyncTaskDataSchema.nullable(),
	baseline: SyncBaselineSchema.optional(),
}) satisfies z.ZodType<SyncExternalRecord>
