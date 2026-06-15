import path from 'node:path'
import * as z from 'zod'
import { type Repository, RepositorySchema } from '../config/config.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

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
	const validatedRepository = parseCoreInput(
		RepositorySchema,
		repository,
		'repository path repository',
	)
	const validatedInputPath = parseCoreInput(z.string(), inputPath, 'repository path')
	if (validatedInputPath.length === 0 || validatedInputPath.includes('\0')) {
		throw new RepositoryPathError('empty', 'Repository path must not be empty', validatedInputPath)
	}

	let candidate: string

	if (path.isAbsolute(validatedInputPath)) {
		const relative = path.relative(
			validatedRepository.rootDirectory,
			path.resolve(validatedInputPath),
		)

		if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
			throw new RepositoryPathError(
				'outside-repository',
				`Path is outside repository ${validatedRepository.rootDirectory}: ${validatedInputPath}`,
				validatedInputPath,
			)
		}

		candidate = relative.split(path.sep).join('/')
	} else {
		if (validatedInputPath.includes('\\')) {
			throw new RepositoryPathError(
				'not-normalized',
				`Path must use repository-relative POSIX separators: ${validatedInputPath}`,
				validatedInputPath,
			)
		}

		candidate = validatedInputPath
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
			`Path must be an unambiguous normalized repository-relative path: ${validatedInputPath}`,
			validatedInputPath,
		)
	}

	return normalized
}

export function repositoryPathsRelate(left: string, right: string): boolean {
	const validatedLeft = parseCoreInput(z.string(), left, 'left repository path')
	const validatedRight = parseCoreInput(z.string(), right, 'right repository path')
	return (
		validatedLeft === '' ||
		validatedRight === '' ||
		validatedLeft === validatedRight ||
		validatedLeft.startsWith(`${validatedRight}/`) ||
		validatedRight.startsWith(`${validatedLeft}/`)
	)
}
