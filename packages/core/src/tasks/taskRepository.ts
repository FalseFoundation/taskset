import { randomBytes } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
	formatTaskTimestamp,
	type TaskFile,
	type TaskPriority,
	type TaskStatus,
} from '@taskset/contracts'
import type { Repository } from '../config/config.ts'
import { atomicWriteFileExclusive } from '../repository/atomicWrite.ts'
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

export type TaskRepositoryErrorCode =
	| 'not-initialized'
	| 'task-exists'
	| 'task-invalid'
	| 'task-not-found'

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

			throw error
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

	if (priority && !repository.config.tasks.priorities.includes(priority)) {
		throw new TaskRepositoryError(
			'task-invalid',
			`Priority "${priority}" is not enabled by taskset.config.ts`,
		)
	}

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

	return freezeRecord(relativePath, parseTaskFile(contents, { filePath: relativePath }))
}
