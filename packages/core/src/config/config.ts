import { access, stat } from 'node:fs/promises'
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
export const GENERATED_DIRECTORY_NAME = 'generated'
export const SNAPSHOTS_DIRECTORY_NAME = 'snapshots'

export interface ResolvedTaskDefaults {
	readonly status: TaskStatus
	readonly priority?: TaskPriority
	readonly labels: readonly string[]
}

export interface ResolvedConfig {
	readonly schemaVersion: 1
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
	readonly configPath: string
	readonly dataDirectory: string
	readonly tasksDirectory: string
	readonly generatedDirectory: string
	readonly snapshotsDirectory: string
	readonly config: ResolvedConfig
}

export const RepositorySchema = z.strictObject({
	rootDirectory: z.string().min(1),
	configPath: z.string().min(1),
	dataDirectory: z.string().min(1),
	tasksDirectory: z.string().min(1),
	generatedDirectory: z.string().min(1),
	snapshotsDirectory: z.string().min(1),
	config: z.strictObject({
		schemaVersion: z.literal(1),
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

export type ConfigErrorCode = 'config-not-found' | 'config-load' | 'config-schema'

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
		schemaVersion: config.schemaVersion,
		...(project ? { project } : {}),
		...(tasks ? { tasks } : {}),
	})
}

function resolveConfig(config: Config): ResolvedConfig {
	const defaults = config.tasks?.defaults

	return Object.freeze({
		schemaVersion: 1,
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

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT'
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

/**
 * Loads the config from an exact repository root and resolves immutable paths
 * and defaults. The config module is trusted code, but its exported value is
 * still validated against the strict shared schema.
 */
export async function loadRepository(rootDirectory: string): Promise<Repository> {
	const resolvedRoot = path.resolve(
		parseCoreInput(RepositoryDirectorySchema, rootDirectory, 'repository root'),
	)
	const configPath = path.join(resolvedRoot, CONFIG_FILE_NAME)

	try {
		await access(configPath)
	} catch (error) {
		if (isMissingFile(error)) {
			throw new ConfigError(
				'config-not-found',
				`No ${CONFIG_FILE_NAME} was found in ${resolvedRoot}`,
				{ configPath, startDirectory: resolvedRoot },
			)
		}

		throw error
	}

	const configExport = await importConfig(configPath)
	const configResult = ConfigSchema.safeParse(configExport)

	if (!configResult.success) {
		throw new ConfigError(
			'config-schema',
			`Taskset config at ${configPath} does not match schema version 1`,
			{
				cause: configResult.error,
				configPath,
				issues: schemaIssues(configResult.error),
			},
		)
	}

	const dataDirectory = path.join(resolvedRoot, DATA_DIRECTORY_NAME)

	return Object.freeze({
		rootDirectory: resolvedRoot,
		configPath,
		dataDirectory,
		tasksDirectory: path.join(dataDirectory, TASKS_DIRECTORY_NAME),
		generatedDirectory: path.join(dataDirectory, GENERATED_DIRECTORY_NAME),
		snapshotsDirectory: path.join(dataDirectory, SNAPSHOTS_DIRECTORY_NAME),
		config: resolveConfig(configResult.data),
	})
}

/**
 * Walks upward from a starting directory until `taskset.config.ts` is found.
 * Canonical `.taskset/` storage is always resolved relative to that root.
 */
export async function discoverRepository(startDirectory = process.cwd()): Promise<Repository> {
	const validatedStartDirectory = parseCoreInput(
		RepositoryDirectorySchema,
		startDirectory,
		'repository discovery',
	)
	let currentDirectory = path.resolve(validatedStartDirectory)

	while (true) {
		const configPath = path.join(currentDirectory, CONFIG_FILE_NAME)

		try {
			await access(configPath)
			return loadRepository(currentDirectory)
		} catch (error) {
			if (!isMissingFile(error)) {
				throw error
			}
		}

		const parentDirectory = path.dirname(currentDirectory)

		if (parentDirectory === currentDirectory) {
			throw new ConfigError(
				'config-not-found',
				`No ${CONFIG_FILE_NAME} was found from ${path.resolve(validatedStartDirectory)} upward`,
				{ startDirectory: path.resolve(validatedStartDirectory) },
			)
		}

		currentDirectory = parentDirectory
	}
}
