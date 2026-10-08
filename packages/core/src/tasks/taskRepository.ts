import { randomBytes } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { AsyncQueuer } from '@tanstack/pacer'
import {
	EntityReferenceSchema,
	needsEntityIdMigration,
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
import { type DocumentRecord, listDocuments } from '../documents/documentRepository.ts'
import { buildTaskGraph, TaskGraphError } from '../graph/taskGraph.ts'
import {
	assertEntityFileNameMatchesId,
	generateEntityId,
	nextEntitySequence,
	planEntitySequences,
	resolveEntityFileName,
	slugifyTitle,
} from '../ids/entityId.ts'
import {
	EntityReferenceError,
	EntityReferenceIndex,
	type EntityReferenceTarget,
	normalizeEntityReference,
} from '../ids/entityReference.ts'
import { RepositoryRelativePathSchema } from '../projects/repositoryPath.ts'
import { atomicWriteFileExclusive } from '../repository/atomicWrite.ts'
import { applyFileTransaction, FileTransactionError } from '../repository/fileTransaction.ts'
import { collectTaxonomyViolations } from '../taxonomy/taxonomy.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'
import { collectCloseoutIssues } from './closeout.ts'
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

const TaskIdListSchema = uniqueArray(EntityReferenceSchema)
const StringListSchema = uniqueArray(TrimmedStringSchema)
const RepositoryPathListSchema = uniqueArray(RepositoryRelativePathSchema)

export const CreateTaskInputSchema = z.strictObject({
	title: TaskTitleSchema,
	status: TaskStatusSchema.optional(),
	priority: TaskPrioritySchema.optional(),
	order: z.number().finite().nonnegative().optional(),
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
	parent: EntityReferenceSchema.optional(),
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

export interface TaskIdMigration {
	readonly from: string
	readonly to: string
}

export interface TaskIdMigrationProgress {
	readonly completed: number
	readonly total: number
	readonly percent: number
	readonly phase: 'tasks' | 'references'
}

export interface TaskIdMigrationOptions {
	readonly concurrency?: number
	readonly reservedIds?: Iterable<string>
	readonly onProgress?: (progress: TaskIdMigrationProgress) => void
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
		order: z.number().finite().nonnegative().nullable().optional(),
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
		parent: EntityReferenceSchema.nullable().optional(),
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

function taskReferenceTarget(record: TaskRecord): EntityReferenceTarget {
	return {
		id: record.task.metadata.id,
		relativePath: record.relativePath,
		title: record.task.metadata.title,
		kind: 'task',
		status: record.task.metadata.status,
	}
}

function documentReferenceTarget(record: DocumentRecord): EntityReferenceTarget {
	return {
		id: record.document.metadata.id,
		relativePath: record.relativePath,
		title: record.document.metadata.title,
		kind: record.document.metadata.type,
		status: record.document.metadata.status,
	}
}

function normalizedTaskFile(task: TaskFile, index: EntityReferenceIndex): TaskFile {
	const map = (values: readonly string[] | undefined) =>
		values?.map((value) => normalizeEntityReference(value, index))
	const metadata = task.metadata
	const normalized: TaskFile = {
		metadata: {
			...metadata,
			dependsOn: map(metadata.dependsOn),
			related: map(metadata.related),
			duplicates: map(metadata.duplicates),
			parent: metadata.parent ? normalizeEntityReference(metadata.parent, index) : undefined,
		},
		body: task.body,
	}
	return parseTaskFile(serializeTaskFile(normalized))
}

function resolveInputReferences(
	input: CreateTaskInput | UpdateTaskInput,
	index: EntityReferenceIndex,
): CreateTaskInput | UpdateTaskInput {
	const resolve = (field: string, values: readonly string[] | undefined) => {
		if (values === undefined) return undefined
		try {
			return values.map((value) => index.resolveId(value))
		} catch (error) {
			if (error instanceof EntityReferenceError) {
				throw new TaskRepositoryError('task-invalid', error.message, {
					issues: [{ field, message: error.message }],
				})
			}
			throw error
		}
	}
	let parent = input.parent
	if (typeof parent === 'string') {
		try {
			parent = index.resolveId(parent)
		} catch (error) {
			if (error instanceof EntityReferenceError) {
				throw new TaskRepositoryError('task-invalid', error.message, {
					issues: [{ field: 'parent', message: error.message }],
				})
			}
			throw error
		}
	}
	return {
		...input,
		dependsOn: resolve('dependsOn', input.dependsOn),
		related: resolve('related', input.related),
		duplicates: resolve('duplicates', input.duplicates),
		parent,
	}
}

async function repositoryReferenceIndex(
	repository: Repository,
	tasks: readonly TaskRecord[],
): Promise<EntityReferenceIndex> {
	const documents = await listDocuments(repository)
	return new EntityReferenceIndex([
		...tasks.map(taskReferenceTarget),
		...documents.map(documentReferenceTarget),
	])
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
			`Priority "${priority}" is not enabled by repository configuration`,
		)
	}
}

function validateConfiguredStatus(repository: Repository, status: TaskStatus): void {
	if (!repository.config.tasks.statuses.includes(status)) {
		throw new TaskRepositoryError(
			'task-invalid',
			`Status "${status}" is not enabled by repository configuration`,
		)
	}
}

function validateTaskTaxonomy(
	repository: Repository,
	metadata: {
		readonly labels?: readonly string[]
		readonly projects?: readonly string[]
	},
): void {
	const violations = collectTaxonomyViolations(repository.config.taxonomy, metadata)
	if (violations.length === 0 || repository.config.taxonomy.mode === 'warn') {
		return
	}

	throw new TaskRepositoryError('task-invalid', 'Task taxonomy values are not allowed', {
		issues: violations.map((violation) => ({
			field: violation.field,
			message: violation.message,
		})),
	})
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

const REFERENCE_SCAN_IGNORED_DIRECTORIES = new Set([
	'.git',
	'.next',
	'.turbo',
	'coverage',
	'dist',
	'node_modules',
])

async function repositoryTextFiles(root: string, tasksDirectory: string): Promise<string[]> {
	const files: string[] = []
	const visit = async (directory: string): Promise<void> => {
		let entries: Dirent<string>[]
		try {
			entries = await readdir(directory, { withFileTypes: true })
		} catch {
			return
		}
		for (const entry of entries) {
			const target = path.join(directory, entry.name)
			if (entry.isDirectory()) {
				const disposableTasksetDirectory =
					directory === path.join(root, '.taskset') &&
					['generated', 'index', 'snapshots'].includes(entry.name)
				if (
					target === tasksDirectory ||
					disposableTasksetDirectory ||
					REFERENCE_SCAN_IGNORED_DIRECTORIES.has(entry.name)
				)
					continue
				await visit(target)
			} else if (entry.isFile()) files.push(target)
		}
	}
	await visit(root)
	return files
}

async function pacedMap<T, R>(
	items: readonly T[],
	worker: (item: T, index: number) => Promise<R>,
	concurrency: number,
	onSettled?: (completed: number) => void,
): Promise<R[]> {
	if (items.length === 0) return []
	const results: R[] = new Array(items.length)
	let completed = 0
	let firstError: Error | undefined
	await new Promise<void>((resolve) => {
		const queue = new AsyncQueuer<{ item: T; index: number }>(
			async ({ item, index }) => {
				results[index] = await worker(item, index)
			},
			{
				concurrency,
				started: false,
				throwOnError: false,
				onError: (error) => {
					firstError ??= error
				},
				onSettled: () => {
					completed += 1
					onSettled?.(completed)
					if (completed === items.length) resolve()
				},
			},
		)
		items.forEach((item, index) => {
			queue.addItem({ item, index }, 'back', false)
		})
		queue.start()
	})
	if (firstError) throw firstError
	return results
}

/**
 * Generates a branch-safe Taskset ID by encoding the UTC millisecond timestamp
 * and 80 random bits as an uppercase ULID.
 */
function generateLegacyTaskId(
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
 * Generates a canonical short hex task ID. The optional legacy overloads remain
 * for callers that still construct ULID or sequential fixtures during migration.
 */
export function generateTaskId(existingIds?: Iterable<string>): string
/** @deprecated Compatibility overload for callers migrating from Taskset 3 IDs. */
export function generateTaskId(date?: Date, randomSource?: (size: number) => Uint8Array): string
/** @deprecated Compatibility overload for sequential title-derived IDs. */
export function generateTaskId(title: string, sequence: number): string
export function generateTaskId(
	titleOrDateOrIds: string | Date | Iterable<string> = [],
	sequenceOrRandom?: number | ((size: number) => Uint8Array),
): string {
	if (typeof titleOrDateOrIds !== 'string' && !(titleOrDateOrIds instanceof Date)) {
		return generateEntityId(titleOrDateOrIds)
	}
	if (titleOrDateOrIds instanceof Date || typeof sequenceOrRandom === 'function') {
		return generateLegacyTaskId(
			titleOrDateOrIds instanceof Date ? titleOrDateOrIds : new Date(),
			typeof sequenceOrRandom === 'function' ? sequenceOrRandom : undefined,
		)
	}
	if (
		!Number.isInteger(sequenceOrRandom) ||
		(sequenceOrRandom as number) < 1 ||
		(sequenceOrRandom as number) > 9_999_999
	) {
		throw new RangeError('Task sequence must be an integer from 1 through 9999999')
	}
	return `${String(sequenceOrRandom).padStart(7, '0')}-${slugifyTitle(titleOrDateOrIds)}`
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
			try {
				assertEntityFileNameMatchesId(entry.name, task.metadata.id)
			} catch (error) {
				throw new TaskRepositoryError(
					'task-invalid',
					error instanceof Error ? error.message : 'Task filename does not match its id',
					{ filePath: relativePath, taskId: task.metadata.id },
				)
			}
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

	const orderedRecords = records.sort(
		(left, right) =>
			left.relativePath.localeCompare(right.relativePath) ||
			left.task.metadata.id.localeCompare(right.task.metadata.id),
	)
	const referenceIndex = new EntityReferenceIndex(orderedRecords.map(taskReferenceTarget))
	return Object.freeze(
		orderedRecords.map((record) =>
			freezeRecord(record.relativePath, normalizedTaskFile(record.task, referenceIndex)),
		),
	)
}

/** Reads one validated task by immutable canonical ID. */
export async function readTask(repository: Repository, taskId: string): Promise<TaskRecord> {
	parseCoreInput(RepositorySchema, repository, 'task read repository')
	const records = await listTasks(repository)
	let validatedTaskId: string
	try {
		validatedTaskId = new EntityReferenceIndex(records.map(taskReferenceTarget)).resolveId(taskId)
	} catch (error) {
		if (error instanceof EntityReferenceError) {
			throw new TaskRepositoryError('task-not-found', error.message, { taskId })
		}
		throw error
	}
	const record = records.find((candidate) => candidate.task.metadata.id === validatedTaskId)

	if (!record) {
		throw new TaskRepositoryError('task-not-found', `Task ${validatedTaskId} was not found`, {
			taskId: validatedTaskId,
		})
	}

	return record
}

/**
 * Creates a canonical task after applying repository defaults and validating
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
	const parsedInput = parseInput(CreateTaskInputSchema, input, 'task creation')
	const validatedOptions = parseCoreInput(CreateTaskOptionsSchema, options, 'task creation options')
	const now = validatedOptions.now?.() ?? new Date()
	const existingRecords = await listTasks(validatedRepository)
	const referenceIndex = await repositoryReferenceIndex(validatedRepository, existingRecords)
	const validatedInput = resolveInputReferences(parsedInput, referenceIndex) as CreateTaskInput
	const occupiedIds = new Set(existingRecords.map((record) => record.task.metadata.id))
	const nextSequence = nextEntitySequence(
		existingRecords.map((record) => path.basename(record.relativePath)),
	)
	const taskId = validatedOptions.createId?.(now) ?? generateEntityId(occupiedIds)
	parseTaskId(taskId)
	const fileName = resolveEntityFileName({
		id: taskId,
		title: validatedInput.title,
		sequence: nextSequence,
	})
	const timestamp = formatDate(now)
	const defaults = validatedRepository.config.tasks.defaults
	const priority = validatedInput.priority ?? defaults.priority
	const status = validatedInput.status ?? defaults.status
	const labels = validatedInput.labels ?? defaults.labels

	validateConfiguredStatus(validatedRepository, status)
	validateConfiguredPriority(validatedRepository, priority)
	validateTaskTaxonomy(validatedRepository, {
		...(labels.length > 0 ? { labels } : {}),
		...(validatedInput.projects?.length ? { projects: validatedInput.projects } : {}),
	})

	const task: TaskFile = {
		metadata: {
			id: taskId,
			title: validatedInput.title,
			status,
			...(priority ? { priority } : {}),
			...(validatedInput.order !== undefined ? { order: validatedInput.order } : {}),
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
	const absolutePath = path.join(validatedRepository.tasksDirectory, fileName)
	const relativePath = toRepositoryRelativePath(validatedRepository, absolutePath)
	const writeIndex = new EntityReferenceIndex([
		...referenceIndex.targets,
		{
			id: taskId,
			relativePath,
			title: task.metadata.title,
			kind: 'task',
			status: task.metadata.status,
		},
	])
	const contents = serializeTaskFile(task, {
		filePath: relativePath,
		referencePathForId: (id) => writeIndex.pathForId(id),
	})
	const parsedTask = normalizedTaskFile(
		parseTaskFile(contents, { filePath: relativePath }),
		writeIndex,
	)
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
 * Atomically migrates legacy task IDs to immutable short hex IDs, rewrites
 * relationships and repository text references, normalizes filenames to
 * `{sequence}-{slug}-{id}.md`, and repairs duplicate sequence prefixes by
 * `createdAt`.
 */
export async function migrateTaskIds(
	repository: Repository,
	options: TaskIdMigrationOptions = {},
): Promise<readonly TaskIdMigration[]> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'task ID migration')
	const concurrency = z
		.number()
		.int()
		.min(1)
		.max(32)
		.parse(options.concurrency ?? 8)
	const records = await listTasks(validatedRepository)
	const occupied = new Set<string>([
		...(options.reservedIds ?? []),
		...records.map((record) => record.task.metadata.id),
	])
	const migrations = records
		.filter((record) => needsEntityIdMigration(record.task.metadata.id))
		.map((record) => {
			const to = generateEntityId(occupied)
			occupied.add(to)
			return { from: record.task.metadata.id, to }
		})
	const replacements = new Map(migrations.map((migration) => [migration.from, migration.to]))
	const replace = (id: string) => replacements.get(id) ?? id
	const sequences = planEntitySequences(records, {
		idFor: (record) => replace(record.task.metadata.id),
		createdAtFor: (record) => record.task.metadata.createdAt,
		fileNameFor: (record) => path.basename(record.relativePath),
		legacyIdFor: (record) => record.task.metadata.id,
	})
	const rewrittenRecords = records.map((record) => {
		const id = replace(record.task.metadata.id)
		const sequence = sequences.get(id)
		if (sequence === undefined) {
			throw new TaskRepositoryError(
				'task-invalid',
				`Unable to allocate a display sequence for task ${id}`,
				{ taskId: id, filePath: record.relativePath },
			)
		}
		const fileName = resolveEntityFileName({
			id,
			title: record.task.metadata.title,
			sequence,
		})
		const relativePath = toRepositoryRelativePath(
			validatedRepository,
			path.join(validatedRepository.tasksDirectory, fileName),
		)
		return {
			record,
			id,
			relativePath,
			changed:
				id !== record.task.metadata.id ||
				relativePath !== record.relativePath ||
				(record.task.metadata.dependsOn?.some((value) => replace(value) !== value) ?? false) ||
				(record.task.metadata.related?.some((value) => replace(value) !== value) ?? false) ||
				(record.task.metadata.duplicates?.some((value) => replace(value) !== value) ?? false) ||
				(record.task.metadata.parent !== undefined &&
					replace(record.task.metadata.parent) !== record.task.metadata.parent),
		}
	})
	if (!rewrittenRecords.some((item) => item.changed) && migrations.length === 0) {
		return Object.freeze([])
	}
	const taskOperationGroups = await pacedMap(
		rewrittenRecords,
		async (item) => {
			const oldPath = path.join(validatedRepository.rootDirectory, item.record.relativePath)
			const oldContents = await readTaskContents(
				validatedRepository,
				item.record,
				item.record.task.metadata.id,
			)
			const task: TaskFile = {
				metadata: {
					...item.record.task.metadata,
					id: item.id,
					dependsOn: item.record.task.metadata.dependsOn?.map(replace),
					related: item.record.task.metadata.related?.map(replace),
					duplicates: item.record.task.metadata.duplicates?.map(replace),
					parent: item.record.task.metadata.parent
						? replace(item.record.task.metadata.parent)
						: undefined,
				},
				body: item.record.task.body,
			}
			const newPath = path.join(validatedRepository.rootDirectory, item.relativePath)
			const contents = serializeTaskFile(task, { filePath: item.relativePath })
			if (!item.changed) {
				return []
			}
			return oldPath === newPath
				? [{ targetPath: oldPath, contents, expectedContents: oldContents }]
				: [
						{ targetPath: newPath, contents, expectedContents: null },
						{ targetPath: oldPath, contents: null, expectedContents: oldContents },
					]
		},
		concurrency,
		(completed) => {
			options.onProgress?.({
				completed,
				total: rewrittenRecords.length,
				percent: Math.round((completed / rewrittenRecords.length) * 100),
				phase: 'tasks',
			})
		},
	)
	const files = await repositoryTextFiles(
		validatedRepository.rootDirectory,
		validatedRepository.tasksDirectory,
	)
	const referenceOperations = (
		await pacedMap(
			files,
			async (targetPath) => {
				let source: string
				try {
					source = await readFile(targetPath, 'utf8')
				} catch {
					return undefined
				}
				if (source.includes('\0')) return undefined
				let contents = source
				for (const migration of migrations)
					contents = contents.split(migration.from).join(migration.to)
				return contents === source ? undefined : { targetPath, contents, expectedContents: source }
			},
			concurrency,
			(completed) =>
				options.onProgress?.({
					completed,
					total: files.length,
					percent: Math.round((completed / files.length) * 100),
					phase: 'references',
				}),
		)
	).filter((operation): operation is NonNullable<typeof operation> => operation !== undefined)
	const operations = [...taskOperationGroups.flat(), ...referenceOperations]
	if (operations.length === 0) return Object.freeze([])
	await applyFileTransaction(operations)
	await invalidateTaskIndex(validatedRepository)
	await refreshGeneratedViews(validatedRepository, undefined)
	return Object.freeze(
		migrations.map((migration): TaskIdMigration => Object.freeze({ ...migration })),
	)
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
	const parsedInput = parseInput(UpdateTaskInputSchema, input, 'task update')
	const validatedOptions = parseCoreInput(UpdateTaskOptionsSchema, options, 'task update options')
	const records = await listTasks(validatedRepository)
	const taskIndex = new EntityReferenceIndex(records.map(taskReferenceTarget))
	let validatedTaskId: string
	try {
		validatedTaskId = taskIndex.resolveId(taskId)
	} catch (error) {
		if (error instanceof EntityReferenceError)
			throw new TaskRepositoryError('task-not-found', error.message, { taskId })
		throw error
	}
	const referenceIndex = await repositoryReferenceIndex(validatedRepository, records)
	const validatedInput = resolveInputReferences(parsedInput, referenceIndex) as UpdateTaskInput
	const existing = records.find((record) => record.task.metadata.id === validatedTaskId)

	if (!existing) {
		throw new TaskRepositoryError('task-not-found', `Task ${validatedTaskId} was not found`, {
			taskId: validatedTaskId,
		})
	}

	const absolutePath = path.join(validatedRepository.rootDirectory, existing.relativePath)
	const originalContents = await readTaskContents(validatedRepository, existing, validatedTaskId)
	const current = normalizedTaskFile(
		parseTaskFile(originalContents, { filePath: existing.relativePath }),
		referenceIndex,
	)

	if (current.metadata.id !== validatedTaskId) {
		throw new TaskRepositoryError(
			'task-stale',
			`Task file ${existing.relativePath} changed identity before update`,
			{ filePath: existing.relativePath, taskId: validatedTaskId },
		)
	}

	const nextStatus = validatedInput.status ?? current.metadata.status
	const nextPriority =
		validatedInput.priority === null
			? undefined
			: (validatedInput.priority ?? current.metadata.priority)
	validateStatusTransition(current.metadata.status, nextStatus)
	validateConfiguredStatus(validatedRepository, nextStatus)
	validateConfiguredPriority(validatedRepository, nextPriority)

	const nextLabels = validatedInput.labels ?? current.metadata.labels
	const nextProjects = validatedInput.projects ?? current.metadata.projects
	validateTaskTaxonomy(validatedRepository, {
		...(nextLabels ? { labels: nextLabels } : {}),
		...(nextProjects ? { projects: nextProjects } : {}),
	})

	const updatedTask: TaskFile = {
		metadata: {
			...current.metadata,
			...(validatedInput.title !== undefined ? { title: validatedInput.title } : {}),
			status: nextStatus,
			...(nextPriority !== undefined ? { priority: nextPriority } : { priority: undefined }),
			order: resolveOptional(validatedInput.order, current.metadata.order),
			owner: resolveOptional(validatedInput.owner, current.metadata.owner),
			assignees: validatedInput.assignees ?? current.metadata.assignees,
			reviewers: validatedInput.reviewers ?? current.metadata.reviewers,
			team: resolveOptional(validatedInput.team, current.metadata.team),
			estimate: resolveOptional(validatedInput.estimate, current.metadata.estimate),
			effort: resolveOptional(validatedInput.effort, current.metadata.effort),
			risk: resolveOptional<TaskRisk>(validatedInput.risk, current.metadata.risk),
			dueDate: resolveOptional(validatedInput.dueDate, current.metadata.dueDate),
			updatedAt: formatDate(validatedOptions.now?.() ?? new Date()),
			...(validatedInput.labels !== undefined ? { labels: validatedInput.labels } : {}),
			...(validatedInput.dependsOn !== undefined ? { dependsOn: validatedInput.dependsOn } : {}),
			related: validatedInput.related ?? current.metadata.related,
			duplicates: validatedInput.duplicates ?? current.metadata.duplicates,
			parent: resolveOptional(validatedInput.parent, current.metadata.parent),
			...(validatedInput.files !== undefined ? { files: validatedInput.files } : {}),
			directories: validatedInput.directories ?? current.metadata.directories,
			projects: validatedInput.projects ?? current.metadata.projects,
		},
		body: validatedInput.body ?? current.body,
	}
	const contents = serializeTaskFile(updatedTask, {
		filePath: existing.relativePath,
		referencePathForId: (id) => referenceIndex.pathForId(id),
	})
	const parsedTask = normalizedTaskFile(
		parseTaskFile(contents, { filePath: existing.relativePath }),
		referenceIndex,
	)
	const updatedRecord = freezeRecord(existing.relativePath, parsedTask)
	validateGraph(records.map((record) => (record === existing ? updatedRecord : record)))

	if (nextStatus === 'done' && current.metadata.status !== 'done') {
		const documents = await listDocuments(validatedRepository)
		const closeoutIssues = collectCloseoutIssues(
			validatedRepository.config.closeout,
			parsedTask.metadata,
			records.map((record) => (record === existing ? updatedRecord : record)),
			documents,
		)
		if (closeoutIssues.length > 0) {
			throw new TaskRepositoryError(
				'task-transition-invalid',
				'Task closeout gates blocked the done transition',
				{ taskId: validatedTaskId, issues: closeoutIssues },
			)
		}
	}

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
	const validatedOptions = parseCoreInput(DeleteTaskOptionsSchema, options, 'task deletion options')
	const records = await listTasks(validatedRepository)
	const referenceIndex = await repositoryReferenceIndex(validatedRepository, records)
	let validatedTaskId: string
	try {
		validatedTaskId = new EntityReferenceIndex(records.map(taskReferenceTarget)).resolveId(taskId)
	} catch (error) {
		if (error instanceof EntityReferenceError)
			throw new TaskRepositoryError('task-not-found', error.message, { taskId })
		throw error
	}
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
			metadata.related?.includes(validatedTaskId) === true ||
			metadata.duplicates?.includes(validatedTaskId) === true ||
			metadata.parent === validatedTaskId
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
			const currentTask = normalizedTaskFile(
				parseTaskFile(originalContents, { filePath: record.relativePath }),
				referenceIndex,
			)

			const repairedTask: TaskFile = {
				metadata: {
					...currentTask.metadata,
					updatedAt: timestamp,
					dependsOn: currentTask.metadata.dependsOn?.filter(
						(dependencyId) => dependencyId !== validatedTaskId,
					),
					related: currentTask.metadata.related?.filter(
						(relatedId) => relatedId !== validatedTaskId,
					),
					duplicates: currentTask.metadata.duplicates?.filter(
						(duplicateId) => duplicateId !== validatedTaskId,
					),
					parent:
						currentTask.metadata.parent === validatedTaskId
							? undefined
							: currentTask.metadata.parent,
				},
				body: currentTask.body,
			}

			return {
				targetPath: absolutePath,
				contents: serializeTaskFile(repairedTask, {
					filePath: record.relativePath,
					referencePathForId: (id) => referenceIndex.pathForId(id),
				}),
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
