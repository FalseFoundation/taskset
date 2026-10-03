import type { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseDate } from '@taskset/utils'
import {
	DOCUMENT_DIRECTORY_NAMES,
	documentKindDirectory,
	type Repository,
	RepositorySchema,
} from '../config/config.ts'
import { type DocumentRecord, listDocuments } from '../documents/documentRepository.ts'
import { missingDocumentHeadings } from '../documents/documentTemplate.ts'
import { inspectDocumentGraph } from '../graph/documentGraph.ts'
import { inspectTaskGraph } from '../graph/taskGraph.ts'
import { parseTaskFile, TaskFileError } from '../tasks/taskFile.ts'
import type { TaskRecord } from '../tasks/taskRepository.ts'
import {
	collectTaxonomyViolations,
	taxonomyFromDocument,
	taxonomyFromTask,
} from '../taxonomy/taxonomy.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export type RepositoryDiagnosticCode =
	| 'not-initialized'
	| 'read-error'
	| 'unsafe-path'
	| 'frontmatter'
	| 'schema'
	| 'validation'
	| 'disabled-status'
	| 'duplicate-id'
	| 'missing-dependency'
	| 'missing-reference'
	| 'self-dependency'
	| 'self-reference'
	| 'dependency-cycle'
	| 'parent-cycle'
	| 'missing-template-heading'
	| 'unknown-taxonomy'
	| 'missing-owner'
	| 'stale-research'
	| 'closeout-gap'

export interface RepositoryDiagnostic {
	readonly code: RepositoryDiagnosticCode
	readonly severity: 'error' | 'warn'
	readonly message: string
	readonly remediation: string
	readonly path?: string
	readonly field?: string
	readonly taskId?: string
	readonly documentId?: string
}

export interface DoctorResult {
	readonly valid: boolean
	readonly diagnostics: readonly RepositoryDiagnostic[]
	readonly taskCount: number
	readonly documentCount: number
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function taskFileDiagnostics(
	error: TaskFileError,
	relativePath: string,
): readonly RepositoryDiagnostic[] {
	if (error.issues.length === 0) {
		return [
			{
				code: error.code,
				severity: 'error',
				path: relativePath,
				message: error.message,
				remediation: 'Correct the task frontmatter and run taskset doctor again.',
			},
		]
	}

	return error.issues.map((issue) => ({
		code:
			issue.field === 'files' || issue.field === 'directories'
				? 'unsafe-path'
				: issue.field === 'dependsOn' && issue.message.includes('itself')
					? 'self-dependency'
					: error.code,
		severity: 'error' as const,
		path: relativePath,
		field: issue.field,
		message: issue.message,
		remediation:
			issue.field === 'files' || issue.field === 'directories'
				? 'Use normalized repository-relative POSIX paths without traversal.'
				: `Correct the "${issue.field}" field and run taskset doctor again.`,
	}))
}

async function loadTaskRecords(
	repository: Repository,
	diagnostics: RepositoryDiagnostic[],
): Promise<TaskRecord[]> {
	let entries: Dirent<string>[]

	try {
		entries = await readdir(repository.tasksDirectory, { withFileTypes: true })
	} catch (error) {
		if (isMissingFile(error)) {
			diagnostics.push({
				code: 'not-initialized',
				severity: 'error',
				message: `Task directory does not exist: ${repository.tasksDirectory}`,
				remediation: 'Run "taskset init" from the repository root.',
			})
			return []
		}

		throw error
	}

	const records: TaskRecord[] = []
	const orderedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name))

	for (const entry of orderedEntries) {
		const absolutePath = path.join(repository.tasksDirectory, entry.name)
		const relativePath = path
			.relative(repository.rootDirectory, absolutePath)
			.split(path.sep)
			.join('/')

		if (entry.isSymbolicLink() || (entry.name.endsWith('.md') && !entry.isFile())) {
			diagnostics.push({
				code: 'unsafe-path',
				severity: 'error',
				path: relativePath,
				message: `Task path must be a regular file: ${relativePath}`,
				remediation: 'Replace the entry with a regular Markdown task file inside .taskset/tasks/.',
			})
			continue
		}

		if (!entry.isFile() || !entry.name.endsWith('.md')) {
			continue
		}

		try {
			const task = parseTaskFile(await readFile(absolutePath, 'utf8'), { filePath: relativePath })

			if (!repository.config.tasks.statuses.includes(task.metadata.status)) {
				diagnostics.push({
					code: 'disabled-status',
					severity: 'error',
					path: relativePath,
					field: 'status',
					taskId: task.metadata.id,
					message: `Status "${task.metadata.status}" is not enabled by repository configuration`,
					remediation:
						'Enable the status in tasks.statuses or update the task to an enabled status.',
				})
			}

			records.push({
				relativePath,
				task,
			})
		} catch (error) {
			if (error instanceof TaskFileError) {
				diagnostics.push(...taskFileDiagnostics(error, relativePath))
				continue
			}

			diagnostics.push({
				code: 'read-error',
				severity: 'error',
				path: relativePath,
				message: `Failed to read task file ${relativePath}: ${
					error instanceof Error ? error.message : 'Unknown filesystem error'
				}`,
				remediation: 'Restore read access to the canonical task file and run doctor again.',
			})
		}
	}

	return records
}

async function loadDocumentRecords(
	repository: Repository,
	diagnostics: RepositoryDiagnostic[],
): Promise<DocumentRecord[]> {
	try {
		return [...(await listDocuments(repository))]
	} catch (error) {
		diagnostics.push({
			code: 'read-error',
			severity: 'error',
			message: `Failed to read documents: ${
				error instanceof Error ? error.message : 'Unknown document read error'
			}`,
			remediation: 'Fix invalid document files under .taskset/ and run doctor again.',
		})
		return []
	}
}

function entityIds(
	tasks: readonly TaskRecord[],
	documents: readonly DocumentRecord[],
): Set<string> {
	return new Set([
		...tasks.map((record) => record.task.metadata.id),
		...documents.map((record) => record.document.metadata.id),
	])
}

/**
 * Scans every canonical task and document independently and returns all
 * deterministic file, schema, path, duplicate-ID, graph, template, taxonomy,
 * and closeout diagnostics without mutating data.
 */
export async function diagnoseRepository(repository: Repository): Promise<DoctorResult> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'repository diagnostics')
	const diagnostics: RepositoryDiagnostic[] = []
	const records = await loadTaskRecords(validatedRepository, diagnostics)
	const documents = await loadDocumentRecords(validatedRepository, diagnostics)
	const ids = entityIds(records, documents)
	const taxonomyMode = validatedRepository.config.taxonomy.mode

	for (const kind of Object.keys(
		DOCUMENT_DIRECTORY_NAMES,
	) as (keyof typeof DOCUMENT_DIRECTORY_NAMES)[]) {
		const directory = documentKindDirectory(validatedRepository, kind)
		try {
			await readdir(directory)
		} catch (error) {
			if (!isMissingFile(error)) {
				throw error
			}
		}
	}

	for (const diagnostic of inspectTaskGraph(records)) {
		diagnostics.push({
			code: diagnostic.code,
			severity: 'error',
			path: diagnostic.path,
			taskId: diagnostic.taskId,
			message: diagnostic.message,
			remediation:
				diagnostic.code === 'missing-dependency'
					? 'Create the missing task or remove the invalid dependsOn entry.'
					: diagnostic.code === 'missing-reference'
						? `Create the missing task or remove the invalid ${diagnostic.field ?? 'relationship'} entry.`
						: diagnostic.code === 'dependency-cycle'
							? 'Remove at least one dependsOn edge from the reported cycle.'
							: diagnostic.code === 'parent-cycle'
								? 'Remove or change at least one parent edge from the reported cycle.'
								: diagnostic.code === 'duplicate-id'
									? 'Assign one file a new short hex Taskset ID and rename it to `{sequence}-{slug}-{id}.md`.'
									: diagnostic.code === 'self-dependency'
										? 'Remove the self-dependency from dependsOn.'
										: `Remove the self-reference from ${diagnostic.field ?? 'the relationship'}.`,
		})
	}

	for (const diagnostic of inspectDocumentGraph(documents)) {
		diagnostics.push({
			code: diagnostic.code,
			severity: 'error',
			path: diagnostic.path,
			documentId: diagnostic.documentId,
			field: diagnostic.field,
			message: diagnostic.message,
			remediation:
				diagnostic.code === 'missing-dependency' || diagnostic.code === 'missing-reference'
					? 'Create the missing document or remove the invalid relationship entry.'
					: diagnostic.code === 'dependency-cycle'
						? 'Remove at least one dependsOn edge from the reported cycle.'
						: diagnostic.code === 'parent-cycle'
							? 'Remove or change at least one parent edge from the reported cycle.'
							: diagnostic.code === 'duplicate-id'
								? 'Assign one file a new short hex Taskset ID and rename it to `{sequence}-{slug}-{id}.md`.'
								: `Correct the ${diagnostic.field ?? 'relationship'} entry.`,
		})
	}

	for (const record of documents) {
		const { metadata, body } = record.document
		const missing = missingDocumentHeadings(metadata.type, body)
		for (const heading of missing) {
			diagnostics.push({
				code: 'missing-template-heading',
				severity: 'error',
				path: record.relativePath,
				documentId: metadata.id,
				field: 'body',
				message: `Document is missing required heading "## ${heading}"`,
				remediation:
					'Restore the required template section or recreate the document from template.',
			})
		}

		for (const relatedId of metadata.related ?? []) {
			if (!ids.has(relatedId)) {
				diagnostics.push({
					code: 'missing-reference',
					severity: 'error',
					path: record.relativePath,
					documentId: metadata.id,
					field: 'related',
					message: `Related entity ${relatedId} does not exist`,
					remediation: 'Create the missing entity or remove the invalid related entry.',
				})
			}
		}

		for (const violation of collectTaxonomyViolations(
			validatedRepository.config.taxonomy,
			taxonomyFromDocument(metadata),
		)) {
			diagnostics.push({
				code: 'unknown-taxonomy',
				severity: taxonomyMode,
				path: record.relativePath,
				documentId: metadata.id,
				field: violation.field,
				message: violation.message,
				remediation: 'Use an allowlisted value or extend taxonomy configuration.',
			})
		}

		if (
			validatedRepository.config.doctor.activeConcernRequiresOwner &&
			metadata.type === 'concern' &&
			metadata.status === 'active' &&
			!metadata.owner
		) {
			diagnostics.push({
				code: 'missing-owner',
				severity: 'warn',
				path: record.relativePath,
				documentId: metadata.id,
				field: 'owner',
				message: 'Active concern has no owner',
				remediation: 'Assign an owner with document update --owner.',
			})
		}

		const staleDays = validatedRepository.config.doctor.staleResearchDays
		if (staleDays !== undefined && metadata.type === 'research' && metadata.status === 'ready') {
			const updatedAt = parseDate(metadata.updatedAt)
			const ageMs = updatedAt === undefined ? 0 : Date.now() - updatedAt
			const hasFollowUp = records.some(
				(task) =>
					task.task.metadata.related?.includes(metadata.id) ||
					metadata.related?.includes(task.task.metadata.id),
			)
			if (ageMs > staleDays * 24 * 60 * 60 * 1000 && !hasFollowUp) {
				diagnostics.push({
					code: 'stale-research',
					severity: 'warn',
					path: record.relativePath,
					documentId: metadata.id,
					message: `Research has been ready for more than ${staleDays} days without a related follow-up task`,
					remediation:
						'Create a follow-up task and link it with --related, or update the research status.',
				})
			}
		}
	}

	for (const record of records) {
		const { metadata } = record.task
		for (const violation of collectTaxonomyViolations(
			validatedRepository.config.taxonomy,
			taxonomyFromTask(metadata),
		)) {
			diagnostics.push({
				code: 'unknown-taxonomy',
				severity: taxonomyMode,
				path: record.relativePath,
				taskId: metadata.id,
				field: violation.field,
				message: violation.message,
				remediation: 'Use an allowlisted value or extend taxonomy configuration.',
			})
		}

		const requiredLabels = validatedRepository.config.closeout.requireLessonWhenLabeled
		if (
			metadata.status === 'done' &&
			requiredLabels.length > 0 &&
			(metadata.labels ?? []).some((label) => requiredLabels.includes(label))
		) {
			const related = new Set(metadata.related ?? [])
			const hasLesson = documents.some(
				(document) =>
					document.document.metadata.type === 'lesson' &&
					(related.has(document.document.metadata.id) ||
						(document.document.metadata.related?.includes(metadata.id) ?? false)),
			)
			if (!hasLesson) {
				diagnostics.push({
					code: 'closeout-gap',
					severity: 'error',
					path: record.relativePath,
					taskId: metadata.id,
					field: 'related',
					message: 'Done task requires a related lesson but none is linked',
					remediation: 'Create a lesson document and link it with --related.',
				})
			}
		}

		for (const relatedId of metadata.related ?? []) {
			if (!ids.has(relatedId)) {
				diagnostics.push({
					code: 'missing-reference',
					severity: 'error',
					path: record.relativePath,
					taskId: metadata.id,
					field: 'related',
					message: `Related entity ${relatedId} does not exist`,
					remediation: 'Create the missing entity or remove the invalid related entry.',
				})
			}
		}
	}

	const orderedDiagnostics = diagnostics.sort(
		(left, right) =>
			(left.path ?? '').localeCompare(right.path ?? '') ||
			left.code.localeCompare(right.code) ||
			(left.taskId ?? '').localeCompare(right.taskId ?? '') ||
			(left.documentId ?? '').localeCompare(right.documentId ?? ''),
	)

	return Object.freeze({
		valid: !orderedDiagnostics.some((diagnostic) => diagnostic.severity === 'error'),
		taskCount: records.length,
		documentCount: documents.length,
		diagnostics: Object.freeze(orderedDiagnostics),
	})
}
