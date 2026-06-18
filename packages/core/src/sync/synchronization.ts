import { createHash } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import {
	SYNC_TASK_FIELDS,
	type SyncAdapter,
	type SyncApplyResult,
	type SyncChange,
	type SyncCheckpoint,
	type SyncConflict,
	type SyncDeletionBehavior,
	SyncDeletionBehaviorSchema,
	type SyncDirection,
	SyncDirectionSchema,
	type SyncExternalRecord,
	SyncExternalRecordSchema,
	type SyncFieldConflict,
	type SyncIdentity,
	type SyncPlan,
	SyncPlanSchema,
	type SyncTaskData,
	type SyncTaskField,
	type TaskFile,
} from '@taskset/contracts'
import { formatDate } from '@taskset/utils'
import * as z from 'zod'
import type { Repository } from '../config/config.ts'
import { buildTaskGraph } from '../graph/taskGraph.ts'
import { applyFileTransaction } from '../repository/fileTransaction.ts'
import { parseTaskFile, serializeTaskFile } from '../tasks/taskFile.ts'
import { listTasks, type TaskRecord } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export type SynchronizationErrorCode = 'adapter-invalid' | 'conflict' | 'stale' | 'local-invalid'

export class SynchronizationError extends Error {
	readonly code: SynchronizationErrorCode
	readonly conflicts: readonly SyncConflict[]

	constructor(
		code: SynchronizationErrorCode,
		message: string,
		options: { readonly cause?: unknown; readonly conflicts?: readonly SyncConflict[] } = {},
	) {
		super(message, { cause: options.cause })
		this.name = 'SynchronizationError'
		this.code = code
		this.conflicts = Object.freeze([...(options.conflicts ?? [])])
	}
}

export interface PlanSynchronizationOptions {
	readonly direction: SyncDirection
	readonly deletionBehavior?: SyncDeletionBehavior
	readonly now?: () => Date
}

export const PlanSynchronizationOptionsSchema = z.strictObject({
	direction: SyncDirectionSchema,
	deletionBehavior: SyncDeletionBehaviorSchema.optional(),
	now: z.custom<() => Date>((value) => typeof value === 'function').optional(),
})

function taskData(record: TaskRecord): SyncTaskData {
	const { metadata } = record.task

	return Object.freeze({
		title: metadata.title,
		status: metadata.status,
		...(metadata.priority ? { priority: metadata.priority } : {}),
		...(metadata.labels ? { labels: Object.freeze([...metadata.labels]) } : {}),
		...(metadata.dependsOn ? { dependsOn: Object.freeze([...metadata.dependsOn]) } : {}),
		...(metadata.files ? { files: Object.freeze([...metadata.files]) } : {}),
		...(metadata.owner ? { owner: metadata.owner } : {}),
		...(metadata.assignees ? { assignees: Object.freeze([...metadata.assignees]) } : {}),
		...(metadata.reviewers ? { reviewers: Object.freeze([...metadata.reviewers]) } : {}),
		...(metadata.team ? { team: metadata.team } : {}),
		...(metadata.estimate !== undefined ? { estimate: metadata.estimate } : {}),
		...(metadata.effort !== undefined ? { effort: metadata.effort } : {}),
		...(metadata.risk ? { risk: metadata.risk } : {}),
		...(metadata.dueDate ? { dueDate: metadata.dueDate } : {}),
		...(metadata.related ? { related: Object.freeze([...metadata.related]) } : {}),
		...(metadata.duplicates ? { duplicates: Object.freeze([...metadata.duplicates]) } : {}),
		...(metadata.parent ? { parent: metadata.parent } : {}),
		...(metadata.directories ? { directories: Object.freeze([...metadata.directories]) } : {}),
		...(metadata.projects ? { projects: Object.freeze([...metadata.projects]) } : {}),
		body: record.task.body,
	})
}

function stableValue(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableValue).join(',')}]`
	}

	if (value && typeof value === 'object') {
		return `{${Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
			.join(',')}}`
	}

	return JSON.stringify(value)
}

function equal(left: unknown, right: unknown): boolean {
	return stableValue(left) === stableValue(right)
}

function fingerprintLocal(records: readonly TaskRecord[]): string {
	const hash = createHash('sha256')

	for (const record of [...records].sort((left, right) =>
		left.task.metadata.id.localeCompare(right.task.metadata.id),
	)) {
		hash.update(record.task.metadata.id)
		hash.update('\0')
		hash.update(record.task.metadata.updatedAt)
		hash.update('\0')
		hash.update(stableValue(taskData(record)))
		hash.update('\0')
	}

	return hash.digest('hex')
}

function fingerprintExternal(records: readonly SyncExternalRecord[]): string {
	const hash = createHash('sha256')

	for (const record of [...records].sort((left, right) =>
		left.identity.externalId.localeCompare(right.identity.externalId),
	)) {
		hash.update(stableValue(record))
		hash.update('\0')
	}

	return hash.digest('hex')
}

function deterministicTaskId(provider: string, externalId: string): string {
	const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
	const bytes = createHash('sha256').update(provider).update('\0').update(externalId).digest()
	let value = 0n

	for (const byte of bytes.subarray(0, 17)) {
		value = (value << 8n) | BigInt(byte)
	}

	const characters = Array<string>(26)

	for (let index = characters.length - 1; index >= 0; index -= 1) {
		characters[index] = alphabet[Number(value & 31n)] ?? '0'
		value >>= 5n
	}

	return `TS-${characters.join('')}`
}

function changedFields(
	baseline: SyncTaskData | null,
	current: SyncTaskData | null,
): readonly (SyncTaskField | 'record')[] {
	if (baseline === null || current === null) {
		return equal(baseline, current) ? [] : ['record']
	}

	return SYNC_TASK_FIELDS.filter((field) => !equal(baseline[field], current[field]))
}

function fieldConflicts(
	baseline: SyncTaskData | null,
	local: SyncTaskData | null,
	external: SyncTaskData | null,
): readonly SyncFieldConflict[] {
	if (baseline === null || local === null || external === null) {
		return equal(local, external) ? [] : [{ field: 'record', baseline, local, external }]
	}

	return SYNC_TASK_FIELDS.filter(
		(field) =>
			!equal(baseline[field], local[field]) &&
			!equal(baseline[field], external[field]) &&
			!equal(local[field], external[field]),
	).map((field) => ({
		field,
		baseline: baseline[field],
		local: local[field],
		external: external[field],
	}))
}

function changedFieldConflicts(
	fields: readonly (SyncTaskField | 'record')[],
	baseline: SyncTaskData | null,
	local: SyncTaskData | null,
	external: SyncTaskData | null,
): readonly SyncFieldConflict[] {
	return fields.map((field) =>
		field === 'record'
			? { field, baseline, local, external }
			: {
					field,
					baseline: baseline?.[field],
					local: local?.[field],
					external: external?.[field],
				},
	)
}

function mergeData(
	baseline: SyncTaskData,
	local: SyncTaskData,
	external: SyncTaskData,
): SyncTaskData {
	const merged = { ...baseline } as Record<SyncTaskField, unknown>

	for (const field of SYNC_TASK_FIELDS) {
		const localChanged = !equal(baseline[field], local[field])
		const externalChanged = !equal(baseline[field], external[field])
		merged[field] = externalChanged
			? external[field]
			: localChanged
				? local[field]
				: baseline[field]
	}

	return merged as unknown as SyncTaskData
}

function change(
	target: 'local' | 'external',
	action: 'create' | 'update' | 'delete',
	identity: SyncIdentity,
	taskId: string,
	options: {
		readonly data?: SyncTaskData
		readonly expectedRevision?: string
		readonly expectedUpdatedAt?: string
	} = {},
): SyncChange {
	return Object.freeze({ target, action, identity, taskId, ...options })
}

function conflict(
	identity: SyncIdentity,
	taskId: string | undefined,
	fields: readonly SyncFieldConflict[],
): SyncConflict {
	return Object.freeze({
		identity,
		...(taskId ? { taskId } : {}),
		fields: Object.freeze([...fields]),
		message: `Synchronization conflict for ${identity.provider}:${identity.externalId} in ${fields
			.map((field) => field.field)
			.join(', ')}`,
	})
}

function checkpoint(
	record: SyncExternalRecord,
	taskId: string,
	data: SyncTaskData | null,
	localUpdatedAt: string,
): SyncCheckpoint {
	return Object.freeze({
		identity: { ...record.identity, taskId },
		taskId,
		expectedRevision: record.revision,
		baseline: {
			data,
			localUpdatedAt,
			externalRevision: record.revision,
		},
	})
}

function validateExternalRecords(
	adapter: SyncAdapter,
	records: readonly SyncExternalRecord[],
): readonly SyncExternalRecord[] {
	const externalIds = new Set<string>()
	const taskIds = new Set<string>()

	return Object.freeze(
		records
			.map((record) => {
				const parsed = SyncExternalRecordSchema.safeParse(record)

				if (!parsed.success) {
					throw new SynchronizationError(
						'adapter-invalid',
						`Adapter ${adapter.id} returned an invalid synchronization record`,
						{ cause: parsed.error },
					)
				}

				if (parsed.data.identity.provider !== adapter.id) {
					throw new SynchronizationError(
						'adapter-invalid',
						`Adapter ${adapter.id} returned identity for provider ${parsed.data.identity.provider}`,
					)
				}

				if (externalIds.has(parsed.data.identity.externalId)) {
					throw new SynchronizationError(
						'adapter-invalid',
						`Adapter ${adapter.id} returned duplicate external ID ${parsed.data.identity.externalId}`,
					)
				}

				if (parsed.data.identity.taskId && taskIds.has(parsed.data.identity.taskId)) {
					throw new SynchronizationError(
						'adapter-invalid',
						`Adapter ${adapter.id} maps more than one record to ${parsed.data.identity.taskId}`,
					)
				}

				externalIds.add(parsed.data.identity.externalId)

				if (parsed.data.identity.taskId) {
					taskIds.add(parsed.data.identity.taskId)
				}

				return parsed.data
			})
			.sort((left, right) => left.identity.externalId.localeCompare(right.identity.externalId)),
	)
}

/**
 * Produces a deterministic, non-mutating synchronization plan with field-level
 * conflicts and optimistic fingerprints for both local and external state.
 */
export async function planSynchronization(
	repository: Repository,
	adapter: SyncAdapter,
	options: PlanSynchronizationOptions,
): Promise<SyncPlan> {
	const validatedOptions = parseCoreInput(
		PlanSynchronizationOptionsSchema,
		options,
		'synchronization planning options',
	)
	const localRecords = await listTasks(repository)
	const externalRecords = validateExternalRecords(adapter, await adapter.read())
	const localById = new Map(localRecords.map((record) => [record.task.metadata.id, record]))
	const mappedTaskIds = new Set<string>()
	const changes: SyncChange[] = []
	const checkpoints: SyncCheckpoint[] = []
	const unchanged: SyncIdentity[] = []
	const conflicts: SyncConflict[] = []
	const generatedAt = formatDate(validatedOptions.now?.() ?? new Date())
	const deletionBehavior = validatedOptions.deletionBehavior ?? 'preserve'

	for (const externalRecord of externalRecords) {
		const mappedTaskId = externalRecord.identity.taskId
		const localRecord = mappedTaskId ? localById.get(mappedTaskId) : undefined
		const local = localRecord ? taskData(localRecord) : null
		const external = externalRecord.data
		const taskId =
			mappedTaskId ?? deterministicTaskId(adapter.id, externalRecord.identity.externalId)
		const identity = Object.freeze({ ...externalRecord.identity, taskId })

		if (mappedTaskId) {
			mappedTaskIds.add(mappedTaskId)
		}

		if (equal(local, external)) {
			unchanged.push(identity)
			continue
		}

		if (!mappedTaskId && external) {
			if (validatedOptions.direction === 'push') {
				unchanged.push(identity)
			} else {
				changes.push(change('local', 'create', identity, taskId, { data: external }))
				checkpoints.push(checkpoint(externalRecord, taskId, external, generatedAt))
			}
			continue
		}

		if (!local && external) {
			if (
				validatedOptions.direction === 'push' ||
				(validatedOptions.direction === 'bidirectional' && deletionBehavior === 'delete')
			) {
				const baseline = externalRecord.baseline?.data

				if (baseline && !equal(external, baseline)) {
					conflicts.push(
						conflict(identity, taskId, [{ field: 'record', baseline, local: null, external }]),
					)
				} else if (deletionBehavior === 'delete') {
					changes.push(
						change('external', 'delete', identity, taskId, {
							expectedRevision: externalRecord.revision,
						}),
					)
				} else {
					unchanged.push(identity)
				}
			} else {
				changes.push(change('local', 'create', identity, taskId, { data: external }))
				checkpoints.push(checkpoint(externalRecord, taskId, external, generatedAt))
			}
			continue
		}

		if (local && !external) {
			if (
				validatedOptions.direction === 'pull' ||
				(validatedOptions.direction === 'bidirectional' && deletionBehavior === 'delete')
			) {
				const baseline = externalRecord.baseline?.data

				if (baseline && !equal(local, baseline)) {
					conflicts.push(
						conflict(identity, taskId, [{ field: 'record', baseline, local, external: null }]),
					)
				} else if (deletionBehavior === 'delete') {
					changes.push(
						change('local', 'delete', identity, taskId, {
							expectedUpdatedAt: localRecord?.task.metadata.updatedAt,
						}),
					)
				} else {
					unchanged.push(identity)
				}
			} else {
				changes.push(
					change('external', 'create', identity, taskId, {
						data: local,
						expectedRevision: externalRecord.revision,
					}),
				)
			}
			continue
		}

		if (!local || !external || !localRecord) {
			continue
		}

		if (validatedOptions.direction === 'pull') {
			const localChanges = changedFields(externalRecord.baseline?.data ?? external, local)

			if (localChanges.length > 0) {
				const directConflicts = fieldConflicts(
					externalRecord.baseline?.data ?? external,
					local,
					external,
				)
				conflicts.push(
					conflict(
						identity,
						taskId,
						directConflicts.length > 0
							? directConflicts
							: changedFieldConflicts(
									localChanges,
									externalRecord.baseline?.data ?? external,
									local,
									external,
								),
					),
				)
			} else {
				changes.push(
					change('local', 'update', identity, taskId, {
						data: external,
						expectedUpdatedAt: localRecord.task.metadata.updatedAt,
					}),
				)
				checkpoints.push(checkpoint(externalRecord, taskId, external, generatedAt))
			}
			continue
		}

		if (validatedOptions.direction === 'push') {
			const externalChanges = changedFields(externalRecord.baseline?.data ?? local, external)

			if (externalChanges.length > 0) {
				const directConflicts = fieldConflicts(
					externalRecord.baseline?.data ?? local,
					local,
					external,
				)
				conflicts.push(
					conflict(
						identity,
						taskId,
						directConflicts.length > 0
							? directConflicts
							: changedFieldConflicts(
									externalChanges,
									externalRecord.baseline?.data ?? local,
									local,
									external,
								),
					),
				)
			} else {
				changes.push(
					change('external', 'update', identity, taskId, {
						data: local,
						expectedRevision: externalRecord.revision,
					}),
				)
			}
			continue
		}

		const baseline = externalRecord.baseline?.data

		if (!baseline) {
			conflicts.push(
				conflict(identity, taskId, [{ field: 'record', baseline: null, local, external }]),
			)
			continue
		}

		const conflictsForRecord = fieldConflicts(baseline, local, external)

		if (conflictsForRecord.length > 0) {
			conflicts.push(conflict(identity, taskId, conflictsForRecord))
			continue
		}

		const merged = mergeData(baseline, local, external)

		if (!equal(local, merged)) {
			changes.push(
				change('local', 'update', identity, taskId, {
					data: merged,
					expectedUpdatedAt: localRecord.task.metadata.updatedAt,
				}),
			)
		}

		if (!equal(external, merged)) {
			changes.push(
				change('external', 'update', identity, taskId, {
					data: merged,
					expectedRevision: externalRecord.revision,
				}),
			)
		} else {
			checkpoints.push(checkpoint(externalRecord, taskId, merged, generatedAt))
		}
	}

	if (validatedOptions.direction !== 'pull') {
		for (const localRecord of localRecords) {
			const taskId = localRecord.task.metadata.id

			if (mappedTaskIds.has(taskId)) {
				continue
			}

			const identity = Object.freeze({
				provider: adapter.id,
				externalId: taskId,
				taskId,
			})
			changes.push(change('external', 'create', identity, taskId, { data: taskData(localRecord) }))
		}
	}

	const sortChanges = (left: SyncChange, right: SyncChange) =>
		left.taskId.localeCompare(right.taskId) ||
		left.target.localeCompare(right.target) ||
		left.action.localeCompare(right.action)

	return Object.freeze({
		direction: validatedOptions.direction,
		deletionBehavior,
		generatedAt,
		localFingerprint: fingerprintLocal(localRecords),
		externalFingerprint: fingerprintExternal(externalRecords),
		changes: Object.freeze(changes.sort(sortChanges)),
		checkpoints: Object.freeze(
			checkpoints.sort((left, right) => left.taskId.localeCompare(right.taskId)),
		),
		unchanged: Object.freeze(
			unchanged.sort((left, right) => left.externalId.localeCompare(right.externalId)),
		),
		conflicts: Object.freeze(
			conflicts.sort((left, right) =>
				left.identity.externalId.localeCompare(right.identity.externalId),
			),
		),
	})
}

function taskFromData(
	taskId: string,
	data: SyncTaskData,
	createdAt: string,
	updatedAt: string,
): TaskFile {
	return {
		metadata: {
			id: taskId,
			title: data.title,
			status: data.status,
			...(data.priority ? { priority: data.priority } : {}),
			...(data.owner ? { owner: data.owner } : {}),
			...(data.assignees ? { assignees: data.assignees } : {}),
			...(data.reviewers ? { reviewers: data.reviewers } : {}),
			...(data.team ? { team: data.team } : {}),
			...(data.estimate !== undefined ? { estimate: data.estimate } : {}),
			...(data.effort !== undefined ? { effort: data.effort } : {}),
			...(data.risk ? { risk: data.risk } : {}),
			...(data.dueDate ? { dueDate: data.dueDate } : {}),
			createdAt,
			updatedAt,
			...(data.labels ? { labels: data.labels } : {}),
			...(data.dependsOn ? { dependsOn: data.dependsOn } : {}),
			...(data.related ? { related: data.related } : {}),
			...(data.duplicates ? { duplicates: data.duplicates } : {}),
			...(data.parent ? { parent: data.parent } : {}),
			...(data.files ? { files: data.files } : {}),
			...(data.directories ? { directories: data.directories } : {}),
			...(data.projects ? { projects: data.projects } : {}),
		},
		body: data.body,
	}
}

async function applyLocalChanges(
	repository: Repository,
	changes: readonly SyncChange[],
	generatedAt: string,
): Promise<readonly TaskRecord[]> {
	const existingRecords = await listTasks(repository)
	const finalRecords = new Map(existingRecords.map((record) => [record.task.metadata.id, record]))
	const operations: {
		readonly targetPath: string
		readonly contents: string | null
		readonly expectedContents: string | null
	}[] = []

	for (const change of changes.filter((candidate) => candidate.target === 'local')) {
		const existing = finalRecords.get(change.taskId)

		if (change.action === 'create') {
			if (existing || !change.data) {
				throw new SynchronizationError(
					'stale',
					`Cannot create local task ${change.taskId}; repository state changed`,
				)
			}

			const relativePath = `.taskset/tasks/${change.taskId}.md`
			const task = parseTaskFile(
				serializeTaskFile(taskFromData(change.taskId, change.data, generatedAt, generatedAt), {
					filePath: relativePath,
				}),
				{ filePath: relativePath },
			)
			finalRecords.set(change.taskId, { relativePath, task })
			operations.push({
				targetPath: path.join(repository.rootDirectory, relativePath),
				contents: serializeTaskFile(task, { filePath: relativePath }),
				expectedContents: null,
			})
			continue
		}

		if (!existing || existing.task.metadata.updatedAt !== change.expectedUpdatedAt) {
			throw new SynchronizationError(
				'stale',
				`Cannot ${change.action} local task ${change.taskId}; repository state changed`,
			)
		}

		const targetPath = path.join(repository.rootDirectory, existing.relativePath)
		const originalContents = await readFile(targetPath, 'utf8')

		if (change.action === 'delete') {
			finalRecords.delete(change.taskId)
			operations.push({ targetPath, contents: null, expectedContents: originalContents })
			continue
		}

		if (!change.data) {
			throw new SynchronizationError(
				'local-invalid',
				`Local update for ${change.taskId} has no task data`,
			)
		}

		const task = parseTaskFile(
			serializeTaskFile(
				taskFromData(change.taskId, change.data, existing.task.metadata.createdAt, generatedAt),
				{ filePath: existing.relativePath },
			),
			{ filePath: existing.relativePath },
		)
		finalRecords.set(change.taskId, { relativePath: existing.relativePath, task })
		operations.push({
			targetPath,
			contents: serializeTaskFile(task, { filePath: existing.relativePath }),
			expectedContents: originalContents,
		})
	}

	try {
		buildTaskGraph([...finalRecords.values()])
	} catch (error) {
		throw new SynchronizationError(
			'local-invalid',
			'Synchronization would create invalid task relationships',
			{ cause: error },
		)
	}

	await applyFileTransaction(operations)

	try {
		await rm(path.join(repository.dataDirectory, 'cache', 'task-index-v1.json'), { force: true })
	} catch {
		// Cache state is disposable and fingerprint-validated on the next read.
	}

	return Object.freeze([...finalRecords.values()])
}

/**
 * Applies a previously fingerprinted plan. External mutations happen before
 * the local file transaction, and stale inputs or unresolved conflicts abort.
 */
export async function applySynchronization(
	repository: Repository,
	adapter: SyncAdapter,
	plan: SyncPlan,
): Promise<SyncApplyResult> {
	const planResult = SyncPlanSchema.safeParse(plan)

	if (!planResult.success) {
		throw new SynchronizationError('local-invalid', 'Synchronization plan is invalid', {
			cause: planResult.error,
		})
	}

	const validatedPlan = planResult.data

	if (validatedPlan.conflicts.length > 0) {
		throw new SynchronizationError('conflict', 'Synchronization plan has unresolved conflicts', {
			conflicts: validatedPlan.conflicts,
		})
	}

	const currentLocal = await listTasks(repository)
	const currentExternal = validateExternalRecords(adapter, await adapter.read())

	if (
		fingerprintLocal(currentLocal) !== validatedPlan.localFingerprint ||
		fingerprintExternal(currentExternal) !== validatedPlan.externalFingerprint
	) {
		throw new SynchronizationError(
			'stale',
			'Synchronization inputs changed after the plan was created; create a new dry run',
		)
	}

	const externalChanges = validatedPlan.changes.filter((change) => change.target === 'external')
	const resultingExternal =
		externalChanges.length > 0 || validatedPlan.checkpoints.length > 0
			? validateExternalRecords(
					adapter,
					await adapter.apply(externalChanges, validatedPlan.checkpoints),
				)
			: currentExternal
	const resultingLocal = await applyLocalChanges(
		repository,
		validatedPlan.changes,
		validatedPlan.generatedAt,
	)

	return Object.freeze({
		applied: validatedPlan.changes,
		unchanged: validatedPlan.unchanged,
		localFingerprint: fingerprintLocal(resultingLocal),
		externalFingerprint: fingerprintExternal(resultingExternal),
	})
}
