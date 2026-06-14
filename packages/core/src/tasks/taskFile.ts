import {
	type TaskFile,
	TaskFileSchema,
	type TaskMetadata,
	TaskMetadataSchema,
} from '@taskset/contracts'
import { FrontmatterError, parseDate, parseFrontmatter, serializeFrontmatter } from '@taskset/utils'

export type TaskFileErrorCode = 'frontmatter' | 'schema' | 'validation'

export interface TaskFileIssue {
	readonly field: string
	readonly message: string
}

export interface ParseTaskFileOptions {
	readonly filePath?: string
}

export class TaskFileError extends Error {
	readonly code: TaskFileErrorCode
	readonly filePath?: string
	readonly issues: readonly TaskFileIssue[]

	constructor(
		code: TaskFileErrorCode,
		message: string,
		options: {
			readonly cause?: unknown
			readonly filePath?: string
			readonly issues?: readonly TaskFileIssue[]
		} = {},
	) {
		const location = options.filePath ? ` in ${options.filePath}` : ''

		super(`${message}${location}`, { cause: options.cause })
		this.name = 'TaskFileError'
		this.code = code
		this.filePath = options.filePath
		this.issues = options.issues ?? []
	}
}

function findDuplicate(values: readonly string[]): string | undefined {
	const seen = new Set<string>()

	for (const value of values) {
		if (seen.has(value)) {
			return value
		}

		seen.add(value)
	}

	return undefined
}

function isRepositoryRelativePosixPath(value: string): boolean {
	if (
		value.length === 0 ||
		value.startsWith('/') ||
		/^[A-Za-z]:\//u.test(value) ||
		value.includes('\\') ||
		value.includes('\0')
	) {
		return false
	}

	const segments = value.split('/')

	return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

function validationError(field: string, message: string, filePath?: string): TaskFileError {
	return new TaskFileError('validation', `Invalid task field "${field}": ${message}`, {
		filePath,
		issues: [{ field, message }],
	})
}

function validateTaskMetadata(metadata: TaskMetadata, filePath?: string): void {
	const createdAt = parseDate(metadata.createdAt)
	const updatedAt = parseDate(metadata.updatedAt)

	if (createdAt === undefined) {
		throw validationError('createdAt', 'must be a valid UTC task timestamp', filePath)
	}

	if (updatedAt === undefined) {
		throw validationError('updatedAt', 'must be a valid UTC task timestamp', filePath)
	}

	if (updatedAt < createdAt) {
		throw validationError('updatedAt', 'must not be earlier than createdAt', filePath)
	}

	for (const [field, values] of [
		['labels', metadata.labels],
		['dependsOn', metadata.dependsOn],
		['files', metadata.files],
		['assignees', metadata.schemaVersion === 2 ? metadata.assignees : undefined],
		['reviewers', metadata.schemaVersion === 2 ? metadata.reviewers : undefined],
		['related', metadata.schemaVersion === 2 ? metadata.related : undefined],
		['duplicates', metadata.schemaVersion === 2 ? metadata.duplicates : undefined],
		['directories', metadata.schemaVersion === 2 ? metadata.directories : undefined],
		['projects', metadata.schemaVersion === 2 ? metadata.projects : undefined],
	] as const) {
		if (!values) {
			continue
		}

		const duplicate = findDuplicate(values)

		if (duplicate) {
			throw validationError(field, `contains the duplicate value "${duplicate}"`, filePath)
		}
	}

	for (const [field, values] of [
		['labels', metadata.labels],
		['assignees', metadata.schemaVersion === 2 ? metadata.assignees : undefined],
		['reviewers', metadata.schemaVersion === 2 ? metadata.reviewers : undefined],
		['projects', metadata.schemaVersion === 2 ? metadata.projects : undefined],
	] as const) {
		for (const value of values ?? []) {
			if (value !== value.trim()) {
				throw validationError(field, `"${value}" has surrounding whitespace`, filePath)
			}
		}
	}

	if (metadata.dependsOn?.includes(metadata.id)) {
		throw validationError('dependsOn', 'a task cannot depend on itself', filePath)
	}

	if (metadata.schemaVersion === 2) {
		for (const [field, taskIds] of [
			['related', metadata.related],
			['duplicates', metadata.duplicates],
		] as const) {
			if (taskIds?.includes(metadata.id)) {
				throw validationError(field, 'a task cannot relate to itself', filePath)
			}
		}

		if (metadata.parent === metadata.id) {
			throw validationError('parent', 'a task cannot be its own parent', filePath)
		}
	}

	for (const [field, paths] of [
		['files', metadata.files],
		['directories', metadata.schemaVersion === 2 ? metadata.directories : undefined],
	] as const) {
		for (const value of paths ?? []) {
			if (isRepositoryRelativePosixPath(value)) {
				continue
			}

			throw validationError(
				field,
				`"${value}" must be a normalized repository-relative POSIX path`,
				filePath,
			)
		}
	}
}

function freezeTaskFile(task: TaskFile): TaskFile {
	const versionTwoLists =
		task.metadata.schemaVersion === 2
			? {
					...(task.metadata.assignees !== undefined
						? { assignees: Object.freeze([...task.metadata.assignees]) }
						: {}),
					...(task.metadata.reviewers !== undefined
						? { reviewers: Object.freeze([...task.metadata.reviewers]) }
						: {}),
					...(task.metadata.related !== undefined
						? { related: Object.freeze([...task.metadata.related]) }
						: {}),
					...(task.metadata.duplicates !== undefined
						? { duplicates: Object.freeze([...task.metadata.duplicates]) }
						: {}),
					...(task.metadata.directories !== undefined
						? { directories: Object.freeze([...task.metadata.directories]) }
						: {}),
					...(task.metadata.projects !== undefined
						? { projects: Object.freeze([...task.metadata.projects]) }
						: {}),
				}
			: {}
	const metadata = Object.freeze({
		...task.metadata,
		...(task.metadata.labels !== undefined
			? { labels: Object.freeze([...task.metadata.labels]) }
			: {}),
		...(task.metadata.dependsOn !== undefined
			? { dependsOn: Object.freeze([...task.metadata.dependsOn]) }
			: {}),
		...(task.metadata.files !== undefined
			? { files: Object.freeze([...task.metadata.files]) }
			: {}),
		...versionTwoLists,
	})

	return Object.freeze({
		metadata,
		body: task.body,
	})
}

function schemaIssues(error: {
	readonly issues: readonly {
		readonly message: string
		readonly path: readonly PropertyKey[]
	}[]
}): readonly TaskFileIssue[] {
	return error.issues.map((issue) => ({
		field: issue.path.length > 0 ? issue.path.map(String).join('.') : 'metadata',
		message: issue.message,
	}))
}

/**
 * Parses strict v1 or v2 task metadata while preserving the Markdown body.
 * Reads validate but never migrate or repair canonical input.
 */
export function parseTaskFile(source: string, options: ParseTaskFileOptions = {}): TaskFile {
	let parsedFrontmatter: ReturnType<typeof parseFrontmatter>

	try {
		parsedFrontmatter = parseFrontmatter(source)
	} catch (error) {
		if (error instanceof FrontmatterError) {
			throw new TaskFileError('frontmatter', error.message, {
				cause: error,
				filePath: options.filePath,
			})
		}

		throw error
	}

	const metadataResult = TaskMetadataSchema.safeParse(parsedFrontmatter.attributes)

	if (!metadataResult.success) {
		throw new TaskFileError('schema', 'Task metadata does not match the canonical schema', {
			cause: metadataResult.error,
			filePath: options.filePath,
			issues: schemaIssues(metadataResult.error),
		})
	}

	validateTaskMetadata(metadataResult.data, options.filePath)

	return freezeTaskFile({
		metadata: metadataResult.data,
		body: parsedFrontmatter.body,
	})
}

/**
 * Validates and serializes a task with canonical key order, LF line endings,
 * and exactly one final newline.
 */
export function serializeTaskFile(task: TaskFile, options: ParseTaskFileOptions = {}): string {
	const taskResult = TaskFileSchema.safeParse(task)

	if (!taskResult.success) {
		throw new TaskFileError('schema', 'Task file does not match the canonical schema', {
			cause: taskResult.error,
			filePath: options.filePath,
			issues: schemaIssues(taskResult.error),
		})
	}

	validateTaskMetadata(taskResult.data.metadata, options.filePath)

	const { metadata } = taskResult.data
	const orderedMetadata: Record<string, unknown> = {
		schemaVersion: metadata.schemaVersion,
		id: metadata.id,
		title: metadata.title,
		status: metadata.status,
	}

	if (metadata.priority !== undefined) {
		orderedMetadata.priority = metadata.priority
	}

	if (metadata.schemaVersion === 2) {
		if (metadata.owner !== undefined) {
			orderedMetadata.owner = metadata.owner
		}

		if (metadata.assignees !== undefined) {
			orderedMetadata.assignees = metadata.assignees
		}

		if (metadata.reviewers !== undefined) {
			orderedMetadata.reviewers = metadata.reviewers
		}

		if (metadata.team !== undefined) {
			orderedMetadata.team = metadata.team
		}

		if (metadata.estimate !== undefined) {
			orderedMetadata.estimate = metadata.estimate
		}

		if (metadata.effort !== undefined) {
			orderedMetadata.effort = metadata.effort
		}

		if (metadata.risk !== undefined) {
			orderedMetadata.risk = metadata.risk
		}

		if (metadata.dueDate !== undefined) {
			orderedMetadata.dueDate = metadata.dueDate
		}
	}

	orderedMetadata.createdAt = metadata.createdAt
	orderedMetadata.updatedAt = metadata.updatedAt

	if (metadata.labels !== undefined) {
		orderedMetadata.labels = metadata.labels
	}

	if (metadata.dependsOn !== undefined) {
		orderedMetadata.dependsOn = metadata.dependsOn
	}

	if (metadata.schemaVersion === 2) {
		if (metadata.related !== undefined) {
			orderedMetadata.related = metadata.related
		}

		if (metadata.duplicates !== undefined) {
			orderedMetadata.duplicates = metadata.duplicates
		}

		if (metadata.parent !== undefined) {
			orderedMetadata.parent = metadata.parent
		}
	}

	if (metadata.files !== undefined) {
		orderedMetadata.files = metadata.files
	}

	if (metadata.schemaVersion === 2) {
		if (metadata.directories !== undefined) {
			orderedMetadata.directories = metadata.directories
		}

		if (metadata.projects !== undefined) {
			orderedMetadata.projects = metadata.projects
		}
	}

	return serializeFrontmatter(orderedMetadata, taskResult.data.body)
}
