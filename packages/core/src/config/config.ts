import { access, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
	type Config,
	ConfigSchema,
	TASK_PRIORITIES,
	TASK_STATUSES,
	type TaskPriority,
	type TaskStatus,
} from '@taskset/contracts'
import * as z from 'zod'
import { parseCoreInput } from '../validation/coreValidation.ts'

export const CONFIG_FILE_NAME = 'taskset.config.ts'
export const DATA_DIRECTORY_NAME = '.taskset'
export const TASKS_DIRECTORY_NAME = 'tasks'
export const DOCUMENT_DIRECTORY_NAMES = Object.freeze({
	story: 'stories',
	flow: 'flows',
	decision: 'decisions',
	research: 'research',
	runbook: 'runbooks',
} as const)
export const GENERATED_DIRECTORY_NAME = '.generated'
export const SNAPSHOTS_DIRECTORY_NAME = 'snapshots'
export const LEGACY_GENERATED_DIRECTORY_NAME = 'generated'

/** Workspace or VCS markers used when choosing an init root without `.taskset/`. */
export const REPOSITORY_ROOT_MARKERS = Object.freeze([
	'.git',
	'pnpm-workspace.yaml',
	'lerna.json',
	'nx.json',
	'go.work',
	'Cargo.toml',
	'flake.nix',
	'package.json',
] as const)

/** Disposable metadata-index directory scoped to one entity folder. */
export function entityGeneratedDirectory(entityDirectory: string): string {
	return path.join(entityDirectory, GENERATED_DIRECTORY_NAME)
}

export interface ResolvedTaskDefaults {
	readonly status: TaskStatus
	readonly priority?: TaskPriority
	readonly labels: readonly string[]
}

export interface ResolvedConfig {
	readonly project?: {
		readonly name: string
	}
	readonly tasks: {
		readonly defaults: ResolvedTaskDefaults
		readonly statuses: readonly TaskStatus[]
		readonly priorities: readonly TaskPriority[]
	}
}

export interface Repository {
	readonly rootDirectory: string
	/** Conventional `taskset.config.ts` path at the repository root. */
	readonly configPath: string
	readonly hasConfig: boolean
	readonly dataDirectory: string
	readonly tasksDirectory: string
	readonly documentsDirectory: string
	/** Task-scoped disposable views at `.taskset/tasks/.generated/`. */
	readonly generatedDirectory: string
	readonly snapshotsDirectory: string
	readonly config: ResolvedConfig
}

/** Canonical directory for one document kind under `.taskset/`. */
export function documentKindDirectory(
	repository: Repository,
	type: keyof typeof DOCUMENT_DIRECTORY_NAMES,
): string {
	return path.join(repository.documentsDirectory, DOCUMENT_DIRECTORY_NAMES[type])
}

export const RepositorySchema = z.strictObject({
	rootDirectory: z.string().min(1),
	configPath: z.string().min(1),
	hasConfig: z.boolean(),
	dataDirectory: z.string().min(1),
	tasksDirectory: z.string().min(1),
	documentsDirectory: z.string().min(1),
	generatedDirectory: z.string().min(1),
	snapshotsDirectory: z.string().min(1),
	config: z.strictObject({
		project: z.strictObject({ name: z.string().min(1) }).optional(),
		tasks: z.strictObject({
			defaults: z.strictObject({
				status: z.enum(TASK_STATUSES),
				priority: z.enum(TASK_PRIORITIES).optional(),
				labels: z.array(z.string()),
			}),
			statuses: z.array(z.enum(TASK_STATUSES)).min(1),
			priorities: z.array(z.enum(TASK_PRIORITIES)).min(1),
		}),
	}),
}) satisfies z.ZodType<Repository>

export const RepositoryDirectorySchema = z.string().min(1, 'Directory must not be empty')

export type ConfigErrorCode = 'repository-not-found' | 'config-load' | 'config-schema'

export class ConfigError extends Error {
	readonly code: ConfigErrorCode
	readonly configPath?: string
	readonly startDirectory?: string
	readonly issues: readonly {
		readonly field: string
		readonly message: string
	}[]

	constructor(
		code: ConfigErrorCode,
		message: string,
		options: {
			readonly cause?: unknown
			readonly configPath?: string
			readonly issues?: readonly {
				readonly field: string
				readonly message: string
			}[]
			readonly startDirectory?: string
		} = {},
	) {
		super(message, { cause: options.cause })
		this.name = 'ConfigError'
		this.code = code
		this.configPath = options.configPath
		this.startDirectory = options.startDirectory
		this.issues = options.issues ?? []
	}
}

let configImportSequence = 0

function freezeConfig(config: Config): Config {
	const project = config.project ? Object.freeze({ ...config.project }) : undefined
	const defaults = config.tasks?.defaults
		? Object.freeze({
				...config.tasks.defaults,
				...(config.tasks.defaults.labels
					? { labels: Object.freeze([...config.tasks.defaults.labels]) }
					: {}),
			})
		: undefined
	const priorities = config.tasks?.priorities
		? Object.freeze([...config.tasks.priorities])
		: undefined
	const statuses = config.tasks?.statuses ? Object.freeze([...config.tasks.statuses]) : undefined
	const tasks = config.tasks
		? Object.freeze({
				...(defaults ? { defaults } : {}),
				...(statuses ? { statuses } : {}),
				...(priorities ? { priorities } : {}),
			})
		: undefined

	return Object.freeze({
		...(project ? { project } : {}),
		...(tasks ? { tasks } : {}),
	})
}

function resolveConfig(config: Config): ResolvedConfig {
	const defaults = config.tasks?.defaults

	return Object.freeze({
		...(config.project ? { project: Object.freeze({ ...config.project }) } : {}),
		tasks: Object.freeze({
			defaults: Object.freeze({
				status: defaults?.status ?? 'todo',
				...(defaults?.priority ? { priority: defaults.priority } : {}),
				labels: Object.freeze([...(defaults?.labels ?? [])]),
			}),
			statuses: Object.freeze([...(config.tasks?.statuses ?? TASK_STATUSES)]),
			priorities: Object.freeze([...(config.tasks?.priorities ?? TASK_PRIORITIES)]),
		}),
	})
}

function schemaIssues(error: {
	readonly issues: readonly {
		readonly message: string
		readonly path: readonly PropertyKey[]
	}[]
}) {
	return error.issues.map((issue) => ({
		field: issue.path.length > 0 ? issue.path.map(String).join('.') : 'config',
		message: issue.message,
	}))
}

function isMissingPath(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await access(targetPath)
		return true
	} catch (error) {
		if (isMissingPath(error)) {
			return false
		}

		throw error
	}
}

async function isDirectory(targetPath: string): Promise<boolean> {
	try {
		return (await stat(targetPath)).isDirectory()
	} catch (error) {
		if (isMissingPath(error)) {
			return false
		}

		throw error
	}
}

/**
 * Validates and freezes trusted repository configuration without resolving
 * defaults or touching the filesystem.
 */
export function defineConfig(config: Config): Config {
	return freezeConfig(parseCoreInput(ConfigSchema, config, 'configuration'))
}

async function importConfig(configPath: string): Promise<unknown> {
	const configUrl = pathToFileURL(configPath)
	const fileStat = await stat(configPath)
	configImportSequence += 1
	configUrl.searchParams.set(
		'taskset',
		`${fileStat.mtimeMs.toString(36)}-${configImportSequence.toString(36)}`,
	)

	try {
		const configModule = (await import(configUrl.href)) as { readonly default?: unknown }
		return configModule.default
	} catch (error) {
		throw new ConfigError(
			'config-load',
			`Failed to load Taskset config at ${configPath}: ${
				error instanceof Error ? error.message : 'Unknown module loading error'
			}`,
			{ cause: error, configPath },
		)
	}
}

function buildRepository(rootDirectory: string, config: Config, hasConfig: boolean): Repository {
	const dataDirectory = path.join(rootDirectory, DATA_DIRECTORY_NAME)
	const tasksDirectory = path.join(dataDirectory, TASKS_DIRECTORY_NAME)

	return Object.freeze({
		rootDirectory,
		configPath: path.join(rootDirectory, CONFIG_FILE_NAME),
		hasConfig,
		dataDirectory,
		tasksDirectory,
		documentsDirectory: dataDirectory,
		generatedDirectory: entityGeneratedDirectory(tasksDirectory),
		snapshotsDirectory: path.join(dataDirectory, SNAPSHOTS_DIRECTORY_NAME),
		config: resolveConfig(config),
	})
}

/**
 * Loads optional config from an exact repository root and resolves immutable
 * paths and defaults. Missing config uses built-in defaults.
 */
export async function loadRepository(rootDirectory: string): Promise<Repository> {
	const resolvedRoot = path.resolve(
		parseCoreInput(RepositoryDirectorySchema, rootDirectory, 'repository root'),
	)
	const configPath = path.join(resolvedRoot, CONFIG_FILE_NAME)
	const hasConfig = await pathExists(configPath)

	if (!hasConfig) {
		return buildRepository(resolvedRoot, {}, false)
	}

	const configExport = await importConfig(configPath)
	const configResult = ConfigSchema.safeParse(configExport)

	if (!configResult.success) {
		throw new ConfigError(
			'config-schema',
			`Taskset config at ${configPath} does not match the Taskset config schema`,
			{
				cause: configResult.error,
				configPath,
				issues: schemaIssues(configResult.error),
			},
		)
	}

	return buildRepository(resolvedRoot, configResult.data, true)
}

async function findAncestorWithDataDirectory(startDirectory: string): Promise<string | undefined> {
	let currentDirectory = path.resolve(startDirectory)

	while (true) {
		if (await isDirectory(path.join(currentDirectory, DATA_DIRECTORY_NAME))) {
			return currentDirectory
		}

		const parentDirectory = path.dirname(currentDirectory)

		if (parentDirectory === currentDirectory) {
			return undefined
		}

		currentDirectory = parentDirectory
	}
}

async function hasRootMarker(directory: string, marker: string): Promise<boolean> {
	const markerPath = path.join(directory, marker)

	if (marker === '.git') {
		try {
			const markerStat = await stat(markerPath)
			return markerStat.isDirectory() || markerStat.isFile()
		} catch (error) {
			if (isMissingPath(error)) {
				return false
			}

			throw error
		}
	}

	if (marker === 'package.json') {
		return pathExists(markerPath)
	}

	if (marker === 'Cargo.toml') {
		if (!(await pathExists(markerPath))) {
			return false
		}

		const contents = await readFile(markerPath, 'utf8')
		return /^\s*\[workspace\]/mu.test(contents)
	}

	return pathExists(markerPath)
}

/**
 * Chooses a directory for `taskset init` when `.taskset/` is not already present.
 * Prefers an existing Taskset root, then VCS/workspace markers, then the
 * outermost `package.json` ancestor, then the start directory.
 */
export async function resolveInitializationRoot(startDirectory = process.cwd()): Promise<string> {
	const validatedStartDirectory = path.resolve(
		parseCoreInput(RepositoryDirectorySchema, startDirectory, 'repository initialization'),
	)
	const existingRoot = await findAncestorWithDataDirectory(validatedStartDirectory)

	if (existingRoot) {
		return existingRoot
	}

	let currentDirectory = validatedStartDirectory
	let outermostPackageJson: string | undefined

	while (true) {
		for (const marker of REPOSITORY_ROOT_MARKERS) {
			if (marker === 'package.json') {
				if (await hasRootMarker(currentDirectory, marker)) {
					outermostPackageJson = currentDirectory
				}
				continue
			}

			if (await hasRootMarker(currentDirectory, marker)) {
				return currentDirectory
			}
		}

		const parentDirectory = path.dirname(currentDirectory)

		if (parentDirectory === currentDirectory) {
			return outermostPackageJson ?? validatedStartDirectory
		}

		currentDirectory = parentDirectory
	}
}

/**
 * Walks upward from a starting directory until `.taskset/` is found.
 * Optional `taskset.config.ts` at that root overlays defaults when present.
 */
export async function discoverRepository(startDirectory = process.cwd()): Promise<Repository> {
	const validatedStartDirectory = parseCoreInput(
		RepositoryDirectorySchema,
		startDirectory,
		'repository discovery',
	)
	const rootDirectory = await findAncestorWithDataDirectory(validatedStartDirectory)

	if (!rootDirectory) {
		throw new ConfigError(
			'repository-not-found',
			`No ${DATA_DIRECTORY_NAME}/ directory was found from ${path.resolve(validatedStartDirectory)} upward`,
			{ startDirectory: path.resolve(validatedStartDirectory) },
		)
	}

	return loadRepository(rootDirectory)
}
