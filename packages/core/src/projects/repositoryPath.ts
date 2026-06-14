import path from 'node:path'
import * as z from 'zod'
import type { Repository } from '../config/config.ts'

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

export const RepositoryRelativePathSchema = z
	.string()
	.min(1)
	.refine((value) => !value.includes('\\') && !value.includes('\0'), {
		message: 'Path must use repository-relative POSIX separators',
	})
	.refine(
		(value) =>
			!value.startsWith('/') &&
			!/^[A-Za-z]:\//u.test(value) &&
			path.posix.normalize(value) === value &&
			value !== '.' &&
			value !== '..' &&
			!value.startsWith('../'),
		{ message: 'Path must be a normalized repository-relative POSIX path' },
	)

/**
 * Resolves an absolute or repository-relative input into the canonical POSIX
 * representation used by task metadata and query matching.
 */
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

export function repositoryPathsRelate(left: string, right: string): boolean {
	return (
		left === '' ||
		right === '' ||
		left === right ||
		left.startsWith(`${right}/`) ||
		right.startsWith(`${left}/`)
	)
}
