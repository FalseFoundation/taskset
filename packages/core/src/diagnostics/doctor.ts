import type { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { type Repository, RepositorySchema } from '../config/config.ts'
import { inspectTaskGraph } from '../graph/taskGraph.ts'
import { parseTaskFile, TaskFileError } from '../tasks/taskFile.ts'
import type { TaskRecord } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export type RepositoryDiagnosticCode =
	| 'not-initialized'
	| 'read-error'
	| 'unsafe-path'
	| 'frontmatter'
	| 'schema'
	| 'validation'
	| 'duplicate-id'
	| 'missing-dependency'
	| 'missing-reference'
	| 'self-dependency'
	| 'self-reference'
	| 'dependency-cycle'
	| 'parent-cycle'

export interface RepositoryDiagnostic {
	readonly code: RepositoryDiagnosticCode
	readonly severity: 'error'
	readonly message: string
	readonly remediation: string
	readonly path?: string
	readonly field?: string
	readonly taskId?: string
}

export interface DoctorResult {
	readonly valid: boolean
	readonly diagnostics: readonly RepositoryDiagnostic[]
	readonly taskCount: number
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
		severity: 'error',
		path: relativePath,
		field: issue.field,
		message: issue.message,
		remediation:
			issue.field === 'files' || issue.field === 'directories'
				? 'Use normalized repository-relative POSIX paths without traversal.'
				: `Correct the "${issue.field}" field and run taskset doctor again.`,
	}))
}

export async function diagnoseRepository(repository: Repository): Promise<DoctorResult> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'repository diagnostics')
	let entries: Dirent<string>[]

	try {
		entries = await readdir(validatedRepository.tasksDirectory, { withFileTypes: true })
	} catch (error) {
		if (isMissingFile(error)) {
			const diagnostic: RepositoryDiagnostic = {
				code: 'not-initialized',
				severity: 'error',
				message: `Task directory does not exist: ${validatedRepository.tasksDirectory}`,
				remediation: 'Run "taskset init" from the repository root.',
			}

			return Object.freeze({
				valid: false,
				taskCount: 0,
				diagnostics: Object.freeze([diagnostic]),
			})
		}

		throw error
	}

	const diagnostics: RepositoryDiagnostic[] = []
	const records: TaskRecord[] = []
	const orderedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name))

	for (const entry of orderedEntries) {
		const absolutePath = path.join(validatedRepository.tasksDirectory, entry.name)
		const relativePath = path
			.relative(validatedRepository.rootDirectory, absolutePath)
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
			records.push({
				relativePath,
				task: parseTaskFile(await readFile(absolutePath, 'utf8'), { filePath: relativePath }),
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
									? 'Assign one file a new Taskset ID and rename it to match.'
									: diagnostic.code === 'self-dependency'
										? 'Remove the self-dependency from dependsOn.'
										: `Remove the self-reference from ${diagnostic.field ?? 'the relationship'}.`,
		})
	}

	const orderedDiagnostics = diagnostics.sort(
		(left, right) =>
			(left.path ?? '').localeCompare(right.path ?? '') ||
			left.code.localeCompare(right.code) ||
			(left.taskId ?? '').localeCompare(right.taskId ?? ''),
	)

	return Object.freeze({
		valid: orderedDiagnostics.length === 0,
		taskCount: records.length,
		diagnostics: Object.freeze(orderedDiagnostics),
	})
}
