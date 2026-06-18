import { randomBytes } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import {
	type TaskFile,
	TaskIdSchema,
	type TaskPriority,
	TaskPrioritySchema,
	type TaskRisk,
	TaskRiskSchema,
	type TaskStatus,
	TaskStatusSchema,
	TaskTimestampSchema,
	TaskTitleSchema,
} from '@taskset/contracts'
import { formatDate } from '@taskset/utils'
import * as z from 'zod'
import { type Repository, RepositorySchema } from '../config/config.ts'
import { buildTaskGraph, TaskGraphError } from '../graph/taskGraph.ts'
import { RepositoryRelativePathSchema } from '../projects/repositoryPath.ts'
import { atomicWriteFileExclusive } from '../repository/atomicWrite.ts'
import { applyFileTransaction, FileTransactionError } from '../repository/fileTransaction.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'
import { parseTaskFile, serializeTaskFile, TaskFileError } from './taskFile.ts'

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const MAX_ULID_TIMESTAMP = 0xffffffffffff

export interface TaskRecord {
	readonly relativePath: string
	readonly task: TaskFile
}

const TrimmedStringSchema = z
	.string()
	.min(1)
	.refine((value) => value === value.trim(), 'Must not have surrounding whitespace')
function uniqueArray<T>(schema: z.ZodType<T>) {
	return z
		.array(schema)
		.refine((values) => new Set(values).size === values.length, 'Values must be unique')
}

const TaskIdListSchema = uniqueArray(TaskIdSchema)
const StringListSchema = uniqueArray(TrimmedStringSchema)
const RepositoryPathListSchema = uniqueArray(RepositoryRelativePathSchema)

export const CreateTaskInputSchema = z.strictObject({
	title: TaskTitleSchema,
	status: TaskStatusSchema.optional(),
	priority: TaskPrioritySchema.optional(),
	labels: StringListSchema.optional(),
	dependsOn: TaskIdListSchema.optional(),
	files: RepositoryPathListSchema.optional(),
	owner: TrimmedStringSchema.optional(),
	assignees: StringListSchema.optional(),
	reviewers: StringListSchema.optional(),
	team: TrimmedStringSchema.optional(),
	estimate: z.number().int().nonnegative().optional(),
	effort: z.number().finite().nonnegative().optional(),
	risk: TaskRiskSchema.optional(),
	dueDate: TaskTimestampSchema.optional(),
	related: TaskIdListSchema.optional(),
	duplicates: TaskIdListSchema.optional(),
	parent: TaskIdSchema.optional(),
	directories: RepositoryPathListSchema.optional(),
	projects: StringListSchema.optional(),
	body: z.string().optional(),
})

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>

export interface CreateTaskOptions {
	readonly createId?: (date: Date) => string
	readonly now?: () => Date
	readonly onWarning?: (warning: CoreWarning) => void
}

const ClockSchema = z.custom<() => Date>((value) => typeof value === 'function')
const WarningHandlerSchema = z.custom<(warning: CoreWarning) => void>(
	(value) => typeof value === 'function',
)

export const CreateTaskOptionsSchema = z.strictObject({
	createId: z.custom<(date: Date) => string>((value) => typeof value === 'function').optional(),
	now: ClockSchema.optional(),
	onWarning: WarningHandlerSchema.optional(),
}) satisfies z.ZodType<CreateTaskOptions>

export const UpdateTaskInputSchema = z
	.strictObject({
		title: TaskTitleSchema.optional(),
		status: TaskStatusSchema.optional(),
		priority: TaskPrioritySchema.nullable().optional(),
		labels: StringListSchema.optional(),
		dependsOn: TaskIdListSchema.optional(),
		files: RepositoryPathListSchema.optional(),
		owner: TrimmedStringSchema.nullable().optional(),
		assignees: StringListSchema.optional(),
		reviewers: StringListSchema.optional(),
		team: TrimmedStringSchema.nullable().optional(),
		estimate: z.number().int().nonnegative().nullable().optional(),
		effort: z.number().finite().nonnegative().nullable().optional(),
		risk: TaskRiskSchema.nullable().optional(),
		dueDate: TaskTimestampSchema.nullable().optional(),
		related: TaskIdListSchema.optional(),
		duplicates: TaskIdListSchema.optional(),
		parent: TaskIdSchema.nullable().optional(),
		directories: RepositoryPathListSchema.optional(),
		projects: StringListSchema.optional(),
		body: z.string().optional(),
	})
	.refine((input) => Object.keys(input).length > 0, 'Task update requires at least one field')

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>

export interface UpdateTaskOptions {
	readonly now?: () => Date
	readonly onWarning?: (warning: CoreWarning) => void
}

export const UpdateTaskOptionsSchema = z.strictObject({
	now: ClockSchema.optional(),
	onWarning: WarningHandlerSchema.optional(),
}) satisfies z.ZodType<UpdateTaskOptions>

export interface DeleteTaskOptions {
	readonly removeDependencies?: boolean
	readonly now?: () => Date
	readonly onWarning?: (warning: CoreWarning) => void
}

export const DeleteTaskOptionsSchema = z.strictObject({
	removeDependencies: z.boolean().optional(),
	now: ClockSchema.optional(),
	onWarning: WarningHandlerSchema.optional(),
}) satisfies z.ZodType<DeleteTaskOptions>

export interface CoreWarning {
	readonly code: 'generated-view-refresh'
	readonly message: string
	readonly cause?: unknown
}

export interface TaskRepositoryIssue {
	readonly field: string
	readonly message: string
}

export type TaskRepositoryErrorCode =
	| 'not-initialized'
	| 'task-exists'
	| 'task-invalid'
	| 'task-not-found'
	| 'task-transition-invalid'
	| 'task-dependency-blocked'
	| 'task-stale'
	| 'task-read'
	| 'task-write'

export class TaskRepositoryError extends Error {
	readonly code: TaskRepositoryErrorCode
	readonly filePath?: string
	readonly taskId?: string
	readonly issues: readonly TaskRepositoryIssue[]

	constructor(
		code: TaskRepositoryErrorCode,
		message: string,
		options: {
			readonly cause?: unknown
			readonly filePath?: string
			readonly taskId?: string
			readonly issues?: readonly TaskRepositoryIssue[]
		} = {},
	) {
		super(message, { cause: options.cause })
		this.name = 'TaskRepositoryError'
		this.code = code
		this.filePath = options.filePath
		this.taskId = options.taskId
		this.issues = options.issues ?? []
	}
}

function schemaIssues(error: z.ZodError): readonly TaskRepositoryIssue[] {
	return error.issues.map((issue) => ({
		field: issue.path.length > 0 ? issue.path.map(String).join('.') : 'input',
		message: issue.message,
	}))
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown, operation: string): T {
	const result = schema.safeParse(value)

	if (!result.success) {
		throw new TaskRepositoryError('task-invalid', `Invalid ${operation} input`, {
			cause: result.error,
			issues: schemaIssues(result.error),
		})
	}

	return result.data
}

function parseTaskId(taskId: string): string {
	return parseInput(TaskIdSchema, taskId, 'task ID')
}

function resolveOptional<T>(next: T | null | undefined, current: T | undefined): T | undefined {
	return next === null ? undefined : (next ?? current)
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === code
}

function toRepositoryRelativePath(repository: Repository, absolutePath: string): string {
	return path.relative(repository.rootDirectory, absolutePath).split(path.sep).join('/')
}

function freezeRecord(relativePath: string, task: TaskFile): TaskRecord {
	return Object.freeze({ relativePath, task })
}

const STATUS_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = Object.freeze({
	todo: Object.freeze<TaskStatus[]>(['doing', 'blocked', 'canceled']),
	doing: Object.freeze<TaskStatus[]>(['todo', 'blocked', 'done', 'canceled']),
	blocked: Object.freeze<TaskStatus[]>(['todo', 'doing', 'canceled']),
	done: Object.freeze<TaskStatus[]>([]),
	canceled: Object.freeze<TaskStatus[]>([]),
})

function validateStatusTransition(current: TaskStatus, next: TaskStatus): void {
	if (current === next) {
		return
	}

	if (!STATUS_TRANSITIONS[current].includes(next)) {
		throw new TaskRepositoryError(
			'task-transition-invalid',
			`Task status cannot transition from "${current}" to "${next}"`,
		)
	}
}

function validateConfiguredPriority(
	repository: Repository,
	priority: TaskPriority | undefined,
): void {
	if (priority && !repository.config.tasks.priorities.includes(priority)) {
		throw new TaskRepositoryError(
			'task-invalid',
			`Priority "${priority}" is not enabled by taskset.config.ts`,
		)
	}
}

function validateConfiguredStatus(repository: Repository, status: TaskStatus): void {
	if (!repository.config.tasks.statuses.includes(status)) {
		throw new TaskRepositoryError(
			'task-invalid',
			`Status "${status}" is not enabled by taskset.config.ts`,
		)
	}
}

function mapGraphError(error: unknown): never {
	if (error instanceof TaskGraphError) {
		const diagnostic = error.diagnostics[0]
		throw new TaskRepositoryError(
			'task-invalid',
			diagnostic?.message ?? 'Task relationships are invalid',
			{
				cause: error,
				filePath: diagnostic?.path,
				taskId: diagnostic?.taskId,
			},
		)
	}

	throw error
}

function validateGraph(records: readonly TaskRecord[]): void {
	try {
		buildTaskGraph(records)
	} catch (error) {
		mapGraphError(error)
	}
}

async function invalidateTaskIndex(repository: Repository): Promise<void> {
	try {
		await rm(path.join(repository.dataDirectory, 'cache', 'task-index-v1.json'), { force: true })
	} catch {
		// Cache state is disposable and fingerprint-validated on the next read.
	}
}

async function refreshGeneratedViews(
	repository: Repository,
	onWarning: ((warning: CoreWarning) => void) | undefined,
): Promise<void> {
	try {
		const { generateViews } = await import('../generated/generatedViews.ts')
		await generateViews(repository)
	} catch (error) {
		onWarning?.(
			Object.freeze({
				code: 'generated-view-refresh',
				message: `Canonical task mutation succeeded, but generated views could not be refreshed: ${
					error instanceof Error ? error.message : 'unknown generation failure'
				}`,
				cause: error,
			}),
		)
	}
}

async function readTaskContents(
	repository: Repository,
	record: TaskRecord,
	taskId: string,
): Promise<string> {
	try {
		return await readFile(path.join(repository.rootDirectory, record.relativePath), 'utf8')
	} catch (error) {
		throw new TaskRepositoryError(
			isNodeError(error, 'ENOENT') ? 'task-stale' : 'task-read',
			isNodeError(error, 'ENOENT')
				? `Task file disappeared before mutation: ${record.relativePath}`
				: `Failed to read task file ${record.relativePath}`,
			{ cause: error, filePath: record.relativePath, taskId },
		)
	}
}

/**
 * Generates a branch-safe Taskset ID by encoding the UTC millisecond timestamp
 * and 80 random bits as an uppercase ULID.
 */
export function generateTaskId(
	date = new Date(),
	randomSource: (size: number) => Uint8Array = randomBytes,
): string {
	const timestamp = date.getTime()

	if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > MAX_ULID_TIMESTAMP) {
		throw new RangeError('Task IDs require a valid timestamp within the ULID range')
	}

	const random = randomSource(10)

	if (random.length !== 10) {
		throw new RangeError('Task ID random source must return exactly 10 bytes')
	}

	let value = BigInt(timestamp)

	for (const byte of random) {
		value = (value << 8n) | BigInt(byte)
	}

	const characters = Array<string>(26)

	for (let index = characters.length - 1; index >= 0; index -= 1) {
		const character = ULID_ALPHABET[Number(value & 31n)]

		if (!character) {
			throw new RangeError('Task ID encoding produced an invalid character')
		}

		characters[index] = character
		value >>= 5n
	}

	return `TS-${characters.join('')}`
}

/**
 * Reads and validates every canonical task file, rejecting duplicate IDs and
 * returning records in stable ID order.
 */
export async function listTasks(repository: Repository): Promise<readonly TaskRecord[]> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'task repository')
	let entries: Dirent<string>[]

	try {
		entries = await readdir(validatedRepository.tasksDirectory, { withFileTypes: true })
	} catch (error) {
		if (isNodeError(error, 'ENOENT')) {
			throw new TaskRepositoryError(
				'not-initialized',
				`Taskset is not initialized in ${validatedRepository.rootDirectory}; run "taskset init"`,
			)
		}

		throw error
	}

	const records: TaskRecord[] = []
	const taskIds = new Map<string, string>()

	for (const entry of entries
		.filter((candidate) => candidate.isFile() && candidate.name.endsWith('.md'))
		.sort((left, right) => left.name.localeCompare(right.name))) {
		const absolutePath = path.join(validatedRepository.tasksDirectory, entry.name)
		const relativePath = toRepositoryRelativePath(validatedRepository, absolutePath)

		try {
			const task = parseTaskFile(await readFile(absolutePath, 'utf8'), { filePath: relativePath })
			validateConfiguredStatus(validatedRepository, task.metadata.status)
			const existingPath = taskIds.get(task.metadata.id)

			if (existingPath) {
				throw new TaskRepositoryError(
					'task-invalid',
					`Duplicate task ID ${task.metadata.id} exists in ${existingPath} and ${relativePath}`,
					{ filePath: relativePath, taskId: task.metadata.id },
				)
			}

			taskIds.set(task.metadata.id, relativePath)
			records.push(freezeRecord(relativePath, task))
		} catch (error) {
			if (error instanceof TaskRepositoryError) {
				throw error
			}

			if (error instanceof TaskFileError) {
				throw new TaskRepositoryError(
					'task-invalid',
					`Invalid task file ${relativePath}: ${error.message}`,
					{ cause: error, filePath: relativePath },
				)
			}

			throw new TaskRepositoryError('task-read', `Failed to read task file ${relativePath}`, {
				cause: error,
				filePath: relativePath,
			})
		}
	}

	return Object.freeze(
		records.sort((left, right) => left.task.metadata.id.localeCompare(right.task.metadata.id)),
	)
}

/** Reads one validated task by immutable canonical ID. */
export async function readTask(repository: Repository, taskId: string): Promise<TaskRecord> {
	parseCoreInput(RepositorySchema, repository, 'task read repository')
	const validatedTaskId = parseTaskId(taskId)
	const record = (await listTasks(repository)).find(
		(candidate) => candidate.task.metadata.id === validatedTaskId,
	)

	if (!record) {
		throw new TaskRepositoryError('task-not-found', `Task ${validatedTaskId} was not found`, {
			taskId: validatedTaskId,
		})
	}

	return record
}

/**
 * Creates a schema-v2 task after applying repository defaults and validating
 * the resulting graph. The canonical write is exclusive; cache invalidation
 * and generated-view refresh are best effort.
 */
export async function createTask(
	repository: Repository,
	input: CreateTaskInput,
	options: CreateTaskOptions = {},
): Promise<TaskRecord> {
	const validatedRepository = parseCoreInput(
		RepositorySchema,
		repository,
		'task creation repository',
	)
	const validatedInput = parseInput(CreateTaskInputSchema, input, 'task creation')
	const validatedOptions = parseCoreInput(CreateTaskOptionsSchema, options, 'task creation options')
	const now = validatedOptions.now?.() ?? new Date()
	const taskId = validatedOptions.createId?.(now) ?? generateTaskId(now)
	parseTaskId(taskId)
	const timestamp = formatDate(now)
	const defaults = validatedRepository.config.tasks.defaults
	const priority = validatedInput.priority ?? defaults.priority
	const status = validatedInput.status ?? defaults.status
	const labels = validatedInput.labels ?? defaults.labels

	validateConfiguredStatus(validatedRepository, status)
	validateConfiguredPriority(validatedRepository, priority)

	const task: TaskFile = {
		metadata: {
			schemaVersion: 2,
			id: taskId,
			title: validatedInput.title,
			status,
			...(priority ? { priority } : {}),
			...(validatedInput.owner ? { owner: validatedInput.owner } : {}),
			...(validatedInput.assignees?.length ? { assignees: validatedInput.assignees } : {}),
			...(validatedInput.reviewers?.length ? { reviewers: validatedInput.reviewers } : {}),
			...(validatedInput.team ? { team: validatedInput.team } : {}),
			...(validatedInput.estimate !== undefined ? { estimate: validatedInput.estimate } : {}),
			...(validatedInput.effort !== undefined ? { effort: validatedInput.effort } : {}),
			...(validatedInput.risk ? { risk: validatedInput.risk } : {}),
			...(validatedInput.dueDate ? { dueDate: validatedInput.dueDate } : {}),
			createdAt: timestamp,
			updatedAt: timestamp,
			...(labels.length > 0 ? { labels } : {}),
			...(validatedInput.dependsOn?.length ? { dependsOn: validatedInput.dependsOn } : {}),
			...(validatedInput.related?.length ? { related: validatedInput.related } : {}),
			...(validatedInput.duplicates?.length ? { duplicates: validatedInput.duplicates } : {}),
			...(validatedInput.parent ? { parent: validatedInput.parent } : {}),
			...(validatedInput.files?.length ? { files: validatedInput.files } : {}),
			...(validatedInput.directories?.length ? { directories: validatedInput.directories } : {}),
			...(validatedInput.projects?.length ? { projects: validatedInput.projects } : {}),
		},
		body: validatedInput.body ?? '',
	}
	const absolutePath = path.join(validatedRepository.tasksDirectory, `${taskId}.md`)
	const relativePath = toRepositoryRelativePath(validatedRepository, absolutePath)
	const contents = serializeTaskFile(task, { filePath: relativePath })
	const parsedTask = parseTaskFile(contents, { filePath: relativePath })
	const existingRecords = await listTasks(validatedRepository)

	if (existingRecords.some((record) => record.task.metadata.id === taskId)) {
		throw new TaskRepositoryError('task-exists', `Task ${taskId} already exists`, {
			filePath: relativePath,
			taskId,
		})
	}

	validateGraph([...existingRecords, freezeRecord(relativePath, parsedTask)])

	try {
		await atomicWriteFileExclusive(absolutePath, contents)
	} catch (error) {
		if (isNodeError(error, 'ENOENT')) {
			throw new TaskRepositoryError(
				'not-initialized',
				`Taskset is not initialized in ${validatedRepository.rootDirectory}; run "taskset init"`,
			)
		}

		if (isNodeError(error, 'EEXIST')) {
			throw new TaskRepositoryError('task-exists', `Task ${taskId} already exists`, {
				cause: error,
				filePath: relativePath,
				taskId,
			})
		}

		throw error
	}

	await invalidateTaskIndex(validatedRepository)
	await refreshGeneratedViews(validatedRepository, validatedOptions.onWarning)
	return freezeRecord(relativePath, parsedTask)
}

/**
 * Atomically updates task metadata or Markdown while preserving unspecified
 * values, enforcing lifecycle transitions, and revalidating the full graph.
 */
export async function updateTask(
	repository: Repository,
	taskId: string,
	input: UpdateTaskInput,
	options: UpdateTaskOptions = {},
): Promise<TaskRecord> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'task update repository')
	const validatedTaskId = parseTaskId(taskId)
	const validatedInput = parseInput(UpdateTaskInputSchema, input, 'task update')
	const validatedOptions = parseCoreInput(UpdateTaskOptionsSchema, options, 'task update options')
	const records = await listTasks(validatedRepository)
	const existing = records.find((record) => record.task.metadata.id === validatedTaskId)

	if (!existing) {
		throw new TaskRepositoryError('task-not-found', `Task ${validatedTaskId} was not found`, {
			taskId: validatedTaskId,
		})
	}

	const absolutePath = path.join(validatedRepository.rootDirectory, existing.relativePath)
	const originalContents = await readTaskContents(validatedRepository, existing, validatedTaskId)
	const current = parseTaskFile(originalContents, { filePath: existing.relativePath })

	if (current.metadata.id !== validatedTaskId) {
		throw new TaskRepositoryError(
			'task-stale',
			`Task file ${existing.relativePath} changed identity before update`,
			{ filePath: existing.relativePath, taskId: validatedTaskId },
		)
	}

	const currentV2 = current.metadata.schemaVersion === 2 ? current.metadata : undefined
	const nextStatus = validatedInput.status ?? current.metadata.status
	const nextPriority =
		validatedInput.priority === null
			? undefined
			: (validatedInput.priority ?? current.metadata.priority)
	validateStatusTransition(current.metadata.status, nextStatus)
	validateConfiguredStatus(validatedRepository, nextStatus)
	validateConfiguredPriority(validatedRepository, nextPriority)

	const updatedTask: TaskFile = {
		metadata: {
			...current.metadata,
			schemaVersion: 2,
			...(validatedInput.title !== undefined ? { title: validatedInput.title } : {}),
			status: nextStatus,
			...(nextPriority !== undefined ? { priority: nextPriority } : { priority: undefined }),
			owner: resolveOptional(validatedInput.owner, currentV2?.owner),
			assignees: validatedInput.assignees ?? currentV2?.assignees,
			reviewers: validatedInput.reviewers ?? currentV2?.reviewers,
			team: resolveOptional(validatedInput.team, currentV2?.team),
			estimate: resolveOptional(validatedInput.estimate, currentV2?.estimate),
			effort: resolveOptional(validatedInput.effort, currentV2?.effort),
			risk: resolveOptional<TaskRisk>(validatedInput.risk, currentV2?.risk),
			dueDate: resolveOptional(validatedInput.dueDate, currentV2?.dueDate),
			updatedAt: formatDate(validatedOptions.now?.() ?? new Date()),
			...(validatedInput.labels !== undefined ? { labels: validatedInput.labels } : {}),
			...(validatedInput.dependsOn !== undefined ? { dependsOn: validatedInput.dependsOn } : {}),
			related: validatedInput.related ?? currentV2?.related,
			duplicates: validatedInput.duplicates ?? currentV2?.duplicates,
			parent: resolveOptional(validatedInput.parent, currentV2?.parent),
			...(validatedInput.files !== undefined ? { files: validatedInput.files } : {}),
			directories: validatedInput.directories ?? currentV2?.directories,
			projects: validatedInput.projects ?? currentV2?.projects,
		},
		body: validatedInput.body ?? current.body,
	}
	const contents = serializeTaskFile(updatedTask, { filePath: existing.relativePath })
	const parsedTask = parseTaskFile(contents, { filePath: existing.relativePath })
	const updatedRecord = freezeRecord(existing.relativePath, parsedTask)
	validateGraph(records.map((record) => (record === existing ? updatedRecord : record)))

	try {
		await applyFileTransaction([
			{
				targetPath: absolutePath,
				contents,
				expectedContents: originalContents,
			},
		])
	} catch (error) {
		if (error instanceof FileTransactionError) {
			throw new TaskRepositoryError(
				error.code === 'stale' ? 'task-stale' : 'task-write',
				error.message,
				{ cause: error, filePath: existing.relativePath, taskId: validatedTaskId },
			)
		}

		throw error
	}

	await invalidateTaskIndex(validatedRepository)
	await refreshGeneratedViews(validatedRepository, validatedOptions.onWarning)
	return updatedRecord
}

/**
 * Atomically deletes a task. Inbound canonical relationships block deletion
 * unless `removeDependencies` requests their transactional repair.
 */
export async function deleteTask(
	repository: Repository,
	taskId: string,
	options: DeleteTaskOptions = {},
): Promise<TaskRecord> {
	const validatedRepository = parseCoreInput(
		RepositorySchema,
		repository,
		'task deletion repository',
	)
	const validatedTaskId = parseTaskId(taskId)
	const validatedOptions = parseCoreInput(DeleteTaskOptionsSchema, options, 'task deletion options')
	const records = await listTasks(validatedRepository)
	const existing = records.find((record) => record.task.metadata.id === validatedTaskId)

	if (!existing) {
		throw new TaskRepositoryError('task-not-found', `Task ${validatedTaskId} was not found`, {
			taskId: validatedTaskId,
		})
	}

	const inboundReferences = records.filter((record) => {
		if (record.task.metadata.id === validatedTaskId) {
			return false
		}

		const { metadata } = record.task
		return (
			metadata.dependsOn?.includes(validatedTaskId) === true ||
			(metadata.schemaVersion === 2 &&
				(metadata.related?.includes(validatedTaskId) === true ||
					metadata.duplicates?.includes(validatedTaskId) === true ||
					metadata.parent === validatedTaskId))
		)
	})

	if (inboundReferences.length > 0 && !validatedOptions.removeDependencies) {
		throw new TaskRepositoryError(
			'task-dependency-blocked',
			`Task ${validatedTaskId} cannot be deleted because it is referenced by ${inboundReferences
				.map((record) => record.task.metadata.id)
				.join(', ')}; use removeDependencies to repair inbound relationships`,
			{ taskId: validatedTaskId, filePath: existing.relativePath },
		)
	}

	const timestamp = formatDate(validatedOptions.now?.() ?? new Date())
	const possibleRepairs = await Promise.all(
		inboundReferences.map(async (record) => {
			const absolutePath = path.join(validatedRepository.rootDirectory, record.relativePath)
			const originalContents = await readTaskContents(
				validatedRepository,
				record,
				record.task.metadata.id,
			)
			const currentTask = parseTaskFile(originalContents, { filePath: record.relativePath })
			const currentV2 = currentTask.metadata.schemaVersion === 2 ? currentTask.metadata : undefined

			const repairedTask: TaskFile = {
				metadata: {
					...currentTask.metadata,
					updatedAt: timestamp,
					dependsOn: currentTask.metadata.dependsOn?.filter(
						(dependencyId) => dependencyId !== validatedTaskId,
					),
					...(currentV2
						? {
								related: currentV2.related?.filter((relatedId) => relatedId !== validatedTaskId),
								duplicates: currentV2.duplicates?.filter(
									(duplicateId) => duplicateId !== validatedTaskId,
								),
								parent: currentV2.parent === validatedTaskId ? undefined : currentV2.parent,
							}
						: {}),
				},
				body: currentTask.body,
			}

			return {
				targetPath: absolutePath,
				contents: serializeTaskFile(repairedTask, { filePath: record.relativePath }),
				expectedContents: originalContents,
			}
		}),
	)
	const operations = possibleRepairs.filter(
		(operation): operation is NonNullable<typeof operation> => operation !== undefined,
	)
	const existingAbsolutePath = path.join(validatedRepository.rootDirectory, existing.relativePath)
	const existingContents = await readTaskContents(validatedRepository, existing, validatedTaskId)
	const currentTarget = parseTaskFile(existingContents, { filePath: existing.relativePath })

	if (currentTarget.metadata.id !== validatedTaskId) {
		throw new TaskRepositoryError(
			'task-stale',
			`Task file ${existing.relativePath} changed identity before deletion`,
			{ filePath: existing.relativePath, taskId: validatedTaskId },
		)
	}

	try {
		await applyFileTransaction([
			...operations,
			{
				targetPath: existingAbsolutePath,
				contents: null,
				expectedContents: existingContents,
			},
		])
	} catch (error) {
		if (error instanceof FileTransactionError) {
			throw new TaskRepositoryError(
				error.code === 'stale' ? 'task-stale' : 'task-write',
				error.message,
				{ cause: error, filePath: existing.relativePath, taskId: validatedTaskId },
			)
		}

		throw error
	}

	await invalidateTaskIndex(validatedRepository)
	await refreshGeneratedViews(validatedRepository, validatedOptions.onWarning)
	return existing
}
