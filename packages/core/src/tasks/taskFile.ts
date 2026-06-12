import {
	parseTaskTimestamp,
	type TaskFile,
	TaskFileSchema,
	type TaskMetadata,
	TaskMetadataSchema,
} from '@taskset/contracts'
import { FrontmatterError, parseFrontmatter, serializeFrontmatter } from '@taskset/utils'

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
	const createdAt = parseTaskTimestamp(metadata.createdAt)
	const updatedAt = parseTaskTimestamp(metadata.updatedAt)

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
	] as const) {
		if (!values) {
			continue
		}

		const duplicate = findDuplicate(values)

		if (duplicate) {
			throw validationError(field, `contains the duplicate value "${duplicate}"`, filePath)
		}
	}

	for (const label of metadata.labels ?? []) {
		if (label !== label.trim()) {
			throw validationError('labels', `"${label}" has surrounding whitespace`, filePath)
		}
	}

	if (metadata.dependsOn?.includes(metadata.id)) {
		throw validationError('dependsOn', 'a task cannot depend on itself', filePath)
	}

	for (const file of metadata.files ?? []) {
		if (!isRepositoryRelativePosixPath(file)) {
			throw validationError(
				'files',
				`"${file}" must be a normalized repository-relative POSIX path`,
				filePath,
			)
		}
	}
}

function freezeTaskFile(task: TaskFile): TaskFile {
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

	orderedMetadata.createdAt = metadata.createdAt
	orderedMetadata.updatedAt = metadata.updatedAt

	if (metadata.labels !== undefined) {
		orderedMetadata.labels = metadata.labels
	}

	if (metadata.dependsOn !== undefined) {
		orderedMetadata.dependsOn = metadata.dependsOn
	}

	if (metadata.files !== undefined) {
		orderedMetadata.files = metadata.files
	}

	return serializeFrontmatter(orderedMetadata, taskResult.data.body)
}
