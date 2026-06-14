import path from 'node:path'
import type { Repository } from '../config/config.ts'
import { buildTaskGraph } from '../graph/taskGraph.ts'
import { listTasks, type TaskRecord } from '../tasks/taskRepository.ts'

export type RepositoryPathErrorCode = 'empty' | 'outside-repository' | 'not-normalized'

export class RepositoryPathError extends Error {
	readonly code: RepositoryPathErrorCode
	readonly inputPath: string

	constructor(code: RepositoryPathErrorCode, message: string, inputPath: string) {
		super(message)
		this.name = 'RepositoryPathError'
		this.code = code
		this.inputPath = inputPath
	}
}

export interface TaskImpactOptions {
	readonly includeImpact?: boolean
}

export interface TaskImpactResult {
	readonly path: string
	readonly direct: readonly TaskRecord[]
	readonly impacted: readonly TaskRecord[]
}

export function normalizeRepositoryPath(repository: Repository, inputPath: string): string {
	if (inputPath.length === 0 || inputPath.includes('\0')) {
		throw new RepositoryPathError('empty', 'Repository path must not be empty', inputPath)
	}

	let candidate: string

	if (path.isAbsolute(inputPath)) {
		const relative = path.relative(repository.rootDirectory, path.resolve(inputPath))

		if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
			throw new RepositoryPathError(
				'outside-repository',
				`Path is outside repository ${repository.rootDirectory}: ${inputPath}`,
				inputPath,
			)
		}

		candidate = relative.split(path.sep).join('/')
	} else {
		if (inputPath.includes('\\')) {
			throw new RepositoryPathError(
				'not-normalized',
				`Path must use repository-relative POSIX separators: ${inputPath}`,
				inputPath,
			)
		}

		candidate = inputPath
	}

	if (candidate === '.') {
		return ''
	}

	const normalized = path.posix.normalize(candidate)

	if (
		normalized !== candidate ||
		normalized === '..' ||
		normalized.startsWith('../') ||
		normalized.startsWith('/')
	) {
		throw new RepositoryPathError(
			'not-normalized',
			`Path must be an unambiguous normalized repository-relative path: ${inputPath}`,
			inputPath,
		)
	}

	return normalized
}

function pathsRelate(left: string, right: string): boolean {
	return (
		left === '' ||
		right === '' ||
		left === right ||
		left.startsWith(`${right}/`) ||
		right.startsWith(`${left}/`)
	)
}

export async function tasksForFile(
	repository: Repository,
	inputPath: string,
	options: TaskImpactOptions = {},
): Promise<TaskImpactResult> {
	const normalizedPath = normalizeRepositoryPath(repository, inputPath)
	const records = await listTasks(repository)
	const direct = records.filter((record) =>
		record.task.metadata.files?.some((file) => pathsRelate(file, normalizedPath)),
	)
	const directIds = new Set(direct.map((record) => record.task.metadata.id))
	const impactedIds = new Set<string>()

	if (options.includeImpact) {
		const graph = buildTaskGraph(records)

		for (const taskId of directIds) {
			for (const impactedId of graph.traverse(taskId, 'blocks')) {
				if (!directIds.has(impactedId)) {
					impactedIds.add(impactedId)
				}
			}
		}
	}

	return Object.freeze({
		path: normalizedPath,
		direct: Object.freeze(
			[...direct].sort((left, right) =>
				left.task.metadata.id.localeCompare(right.task.metadata.id),
			),
		),
		impacted: Object.freeze(
			records
				.filter((record) => impactedIds.has(record.task.metadata.id))
				.sort((left, right) => left.task.metadata.id.localeCompare(right.task.metadata.id)),
		),
	})
}
