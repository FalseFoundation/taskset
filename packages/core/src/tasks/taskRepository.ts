import { randomBytes } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import {
	formatTaskTimestamp,
	type TaskFile,
	type TaskPriority,
	type TaskStatus,
} from '@taskset/contracts'
import type { Repository } from '../config/config.ts'
import { buildTaskGraph, TaskGraphError } from '../graph/taskGraph.ts'
import { atomicWriteFileExclusive } from '../repository/atomicWrite.ts'
import { applyFileTransaction, FileTransactionError } from '../repository/fileTransaction.ts'
import { parseTaskFile, serializeTaskFile, TaskFileError } from './taskFile.ts'

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const MAX_ULID_TIMESTAMP = 0xffffffffffff

export interface TaskRecord {
	readonly relativePath: string
	readonly task: TaskFile
}

export interface CreateTaskInput {
	readonly title: string
	readonly status?: TaskStatus
	readonly priority?: TaskPriority
	readonly labels?: readonly string[]
	readonly dependsOn?: readonly string[]
	readonly files?: readonly string[]
	readonly body?: string
}

export interface CreateTaskOptions {
	readonly createId?: (date: Date) => string
	readonly now?: () => Date
}

export interface UpdateTaskInput {
	readonly title?: string
	readonly status?: TaskStatus
	readonly priority?: TaskPriority | null
	readonly labels?: readonly string[]
	readonly dependsOn?: readonly string[]
	readonly files?: readonly string[]
	readonly body?: string
}

export interface UpdateTaskOptions {
	readonly now?: () => Date
}

export interface DeleteTaskOptions {
	readonly removeDependencies?: boolean
	readonly now?: () => Date
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

	constructor(
		code: TaskRepositoryErrorCode,
		message: string,
		options: {
			readonly cause?: unknown
			readonly filePath?: string
			readonly taskId?: string
		} = {},
	) {
		super(message, { cause: options.cause })
		this.name = 'TaskRepositoryError'
		this.code = code
		this.filePath = options.filePath
		this.taskId = options.taskId
	}
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

export async function listTasks(repository: Repository): Promise<readonly TaskRecord[]> {
	let entries: Dirent<string>[]

	try {
		entries = await readdir(repository.tasksDirectory, { withFileTypes: true })
	} catch (error) {
		if (isNodeError(error, 'ENOENT')) {
			throw new TaskRepositoryError(
				'not-initialized',
				`Taskset is not initialized in ${repository.rootDirectory}; run "taskset init"`,
			)
		}

		throw error
	}

	const records: TaskRecord[] = []
	const taskIds = new Map<string, string>()

	for (const entry of entries
		.filter((candidate) => candidate.isFile() && candidate.name.endsWith('.md'))
		.sort((left, right) => left.name.localeCompare(right.name))) {
		const absolutePath = path.join(repository.tasksDirectory, entry.name)
		const relativePath = toRepositoryRelativePath(repository, absolutePath)

		try {
			const task = parseTaskFile(await readFile(absolutePath, 'utf8'), { filePath: relativePath })
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

export async function readTask(repository: Repository, taskId: string): Promise<TaskRecord> {
	const record = (await listTasks(repository)).find(
		(candidate) => candidate.task.metadata.id === taskId,
	)

	if (!record) {
		throw new TaskRepositoryError('task-not-found', `Task ${taskId} was not found`, { taskId })
	}

	return record
}

export async function createTask(
	repository: Repository,
	input: CreateTaskInput,
	options: CreateTaskOptions = {},
): Promise<TaskRecord> {
	const now = options.now?.() ?? new Date()
	const taskId = options.createId?.(now) ?? generateTaskId(now)
	const timestamp = formatTaskTimestamp(now)
	const defaults = repository.config.tasks.defaults
	const priority = input.priority ?? defaults.priority
	const labels = input.labels ?? defaults.labels

	validateConfiguredPriority(repository, priority)

	const task: TaskFile = {
		metadata: {
			schemaVersion: 1,
			id: taskId,
			title: input.title,
			status: input.status ?? defaults.status,
			...(priority ? { priority } : {}),
			createdAt: timestamp,
			updatedAt: timestamp,
			...(labels.length > 0 ? { labels } : {}),
			...(input.dependsOn && input.dependsOn.length > 0 ? { dependsOn: input.dependsOn } : {}),
			...(input.files && input.files.length > 0 ? { files: input.files } : {}),
		},
		body: input.body ?? '',
	}
	const absolutePath = path.join(repository.tasksDirectory, `${taskId}.md`)
	const relativePath = toRepositoryRelativePath(repository, absolutePath)
	const contents = serializeTaskFile(task, { filePath: relativePath })
	const parsedTask = parseTaskFile(contents, { filePath: relativePath })
	const existingRecords = await listTasks(repository)

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
				`Taskset is not initialized in ${repository.rootDirectory}; run "taskset init"`,
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

	await invalidateTaskIndex(repository)
	return freezeRecord(relativePath, parsedTask)
}

export async function updateTask(
	repository: Repository,
	taskId: string,
	input: UpdateTaskInput,
	options: UpdateTaskOptions = {},
): Promise<TaskRecord> {
	const records = await listTasks(repository)
	const existing = records.find((record) => record.task.metadata.id === taskId)

	if (!existing) {
		throw new TaskRepositoryError('task-not-found', `Task ${taskId} was not found`, { taskId })
	}

	const absolutePath = path.join(repository.rootDirectory, existing.relativePath)
	const originalContents = await readTaskContents(repository, existing, taskId)
	const current = parseTaskFile(originalContents, { filePath: existing.relativePath })

	if (current.metadata.id !== taskId) {
		throw new TaskRepositoryError(
			'task-stale',
			`Task file ${existing.relativePath} changed identity before update`,
			{ filePath: existing.relativePath, taskId },
		)
	}

	const nextStatus = input.status ?? current.metadata.status
	const nextPriority =
		input.priority === null ? undefined : (input.priority ?? current.metadata.priority)
	validateStatusTransition(current.metadata.status, nextStatus)
	validateConfiguredPriority(repository, nextPriority)

	const updatedTask: TaskFile = {
		metadata: {
			...current.metadata,
			...(input.title !== undefined ? { title: input.title } : {}),
			status: nextStatus,
			...(nextPriority !== undefined ? { priority: nextPriority } : { priority: undefined }),
			updatedAt: formatTaskTimestamp(options.now?.() ?? new Date()),
			...(input.labels !== undefined ? { labels: input.labels } : {}),
			...(input.dependsOn !== undefined ? { dependsOn: input.dependsOn } : {}),
			...(input.files !== undefined ? { files: input.files } : {}),
		},
		body: input.body ?? current.body,
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
				{ cause: error, filePath: existing.relativePath, taskId },
			)
		}

		throw error
	}

	await invalidateTaskIndex(repository)
	return updatedRecord
}

export async function deleteTask(
	repository: Repository,
	taskId: string,
	options: DeleteTaskOptions = {},
): Promise<TaskRecord> {
	const records = await listTasks(repository)
	const existing = records.find((record) => record.task.metadata.id === taskId)

	if (!existing) {
		throw new TaskRepositoryError('task-not-found', `Task ${taskId} was not found`, { taskId })
	}

	const graph = buildTaskGraph(records)
	const blockers = graph.blocks.get(taskId) ?? []

	if (blockers.length > 0 && !options.removeDependencies) {
		throw new TaskRepositoryError(
			'task-dependency-blocked',
			`Task ${taskId} cannot be deleted because it is required by ${blockers.join(', ')}; use removeDependencies to repair inbound relationships`,
			{ taskId, filePath: existing.relativePath },
		)
	}

	const timestamp = formatTaskTimestamp(options.now?.() ?? new Date())
	const possibleRepairs = await Promise.all(
		records
			.filter((record) => blockers.includes(record.task.metadata.id))
			.map(async (record) => {
				const absolutePath = path.join(repository.rootDirectory, record.relativePath)
				const originalContents = await readTaskContents(repository, record, record.task.metadata.id)
				const currentTask = parseTaskFile(originalContents, { filePath: record.relativePath })

				if (!currentTask.metadata.dependsOn?.includes(taskId)) {
					return undefined
				}

				const repairedTask: TaskFile = {
					metadata: {
						...currentTask.metadata,
						updatedAt: timestamp,
						dependsOn: currentTask.metadata.dependsOn.filter(
							(dependencyId) => dependencyId !== taskId,
						),
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
	const existingAbsolutePath = path.join(repository.rootDirectory, existing.relativePath)
	const existingContents = await readTaskContents(repository, existing, taskId)
	const currentTarget = parseTaskFile(existingContents, { filePath: existing.relativePath })

	if (currentTarget.metadata.id !== taskId) {
		throw new TaskRepositoryError(
			'task-stale',
			`Task file ${existing.relativePath} changed identity before deletion`,
			{ filePath: existing.relativePath, taskId },
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
				{ cause: error, filePath: existing.relativePath, taskId },
			)
		}

		throw error
	}

	await invalidateTaskIndex(repository)
	return existing
}
