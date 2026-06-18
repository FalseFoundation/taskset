import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import * as z from 'zod'
import type { Repository } from '../config/config.ts'
import { RepositorySchema } from '../config/config.ts'
import { buildTaskGraph, type TaskGraph, TaskRecordsSchema } from '../graph/taskGraph.ts'
import { applyFileTransaction } from '../repository/fileTransaction.ts'
import { queryTaskRecords, type TaskQuery } from '../search/taskQuery.ts'
import { parseTaskFile, serializeTaskFile } from '../tasks/taskFile.ts'
import { listTasks, type TaskRecord } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

const TASK_INDEX_SCHEMA_VERSION = 1
const TASK_INDEX_CACHE_NAME = 'task-index-v1.json'

interface SerializedTaskIndex {
	readonly schemaVersion: 1
	readonly fingerprint: string
	readonly records: readonly {
		readonly relativePath: string
		readonly source: string
	}[]
}

export interface BuildTaskIndexOptions {
	readonly cache?: boolean
}

export const BuildTaskIndexOptionsSchema = z.strictObject({
	cache: z.boolean().optional(),
}) satisfies z.ZodType<BuildTaskIndexOptions>

function fingerprintRecords(records: readonly TaskRecord[]): string {
	const hash = createHash('sha256')

	for (const record of records) {
		hash.update(record.relativePath)
		hash.update('\0')
		hash.update(serializeTaskFile(record.task, { filePath: record.relativePath }))
		hash.update('\0')
	}

	return hash.digest('hex')
}

function serializeIndex(records: readonly TaskRecord[], fingerprint: string): SerializedTaskIndex {
	return {
		schemaVersion: TASK_INDEX_SCHEMA_VERSION,
		fingerprint,
		records: records.map((record) => ({
			relativePath: record.relativePath,
			source: serializeTaskFile(record.task, { filePath: record.relativePath }),
		})),
	}
}

function parseCachedIndex(source: string, fingerprint: string): readonly TaskRecord[] | undefined {
	try {
		const value = JSON.parse(source) as Partial<SerializedTaskIndex>

		if (
			value.schemaVersion !== TASK_INDEX_SCHEMA_VERSION ||
			value.fingerprint !== fingerprint ||
			!Array.isArray(value.records)
		) {
			return undefined
		}

		return Object.freeze(
			value.records.map((record) => {
				if (
					typeof record !== 'object' ||
					record === null ||
					typeof record.relativePath !== 'string' ||
					typeof record.source !== 'string'
				) {
					throw new TypeError('Invalid cached task index record')
				}

				return Object.freeze({
					relativePath: record.relativePath,
					task: parseTaskFile(record.source, { filePath: record.relativePath }),
				})
			}),
		)
	} catch {
		return undefined
	}
}

/**
 * Immutable disposable read model over canonical task records. Its graph and
 * fingerprint are derived at construction and contain no authoritative state.
 */
export class TaskIndex {
	readonly records: readonly TaskRecord[]
	readonly byId: ReadonlyMap<string, TaskRecord>
	readonly graph: TaskGraph
	readonly fingerprint: string

	constructor(records: readonly TaskRecord[], fingerprint = fingerprintRecords(records)) {
		const validatedRecords = parseCoreInput(TaskRecordsSchema, records, 'task index construction')
		const validatedFingerprint = parseCoreInput(
			z.string().regex(/^[a-f0-9]{64}$/u),
			fingerprint,
			'task index fingerprint',
		)
		this.records = Object.freeze([...validatedRecords])
		this.byId = new Map(validatedRecords.map((record) => [record.task.metadata.id, record]))
		this.graph = buildTaskGraph(validatedRecords)
		this.fingerprint = validatedFingerprint
	}

	query(query: TaskQuery = {}): readonly TaskRecord[] {
		return queryTaskRecords(this.records, query)
	}
}

/**
 * Rebuilds an index from canonical files. Optional cache reads are accepted
 * only when their fingerprint matches; corrupt or unwritable cache state is
 * ignored because it is never required for correctness.
 */
export async function buildTaskIndex(
	repository: Repository,
	options: BuildTaskIndexOptions = {},
): Promise<TaskIndex> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'task index repository')
	const validatedOptions = parseCoreInput(
		BuildTaskIndexOptionsSchema,
		options,
		'task index options',
	)
	const canonicalRecords = await listTasks(validatedRepository)
	const fingerprint = fingerprintRecords(canonicalRecords)

	if (!validatedOptions.cache) {
		return new TaskIndex(canonicalRecords, fingerprint)
	}

	const cacheDirectory = path.join(validatedRepository.dataDirectory, 'cache')
	const cachePath = path.join(cacheDirectory, TASK_INDEX_CACHE_NAME)
	let existingCache: string | null = null

	try {
		existingCache = await readFile(cachePath, 'utf8')
		const cachedRecords = parseCachedIndex(existingCache, fingerprint)

		if (cachedRecords) {
			return new TaskIndex(cachedRecords, fingerprint)
		}
	} catch (error) {
		if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
			existingCache = null
		}
	}

	try {
		await mkdir(cacheDirectory, { recursive: true })
		const cacheContents = `${JSON.stringify(serializeIndex(canonicalRecords, fingerprint), null, 2)}\n`
		await applyFileTransaction([
			{
				targetPath: cachePath,
				contents: cacheContents,
				expectedContents: existingCache,
			},
		])
	} catch {
		// Cache persistence is optional; canonical records already produced the index.
	}

	return new TaskIndex(canonicalRecords, fingerprint)
}
