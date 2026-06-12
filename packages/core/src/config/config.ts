import { access, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
	type Config,
	ConfigSchema,
	TASK_PRIORITIES,
	type TaskPriority,
	type TaskStatus,
} from '@taskset/contracts'

export const CONFIG_FILE_NAME = 'taskset.config.ts'
export const DATA_DIRECTORY_NAME = '.taskset'
export const TASKS_DIRECTORY_NAME = 'tasks'

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
		readonly priorities: readonly TaskPriority[]
	}
}

export interface Repository {
	readonly rootDirectory: string
	readonly configPath: string
	readonly dataDirectory: string
	readonly tasksDirectory: string
	readonly config: ResolvedConfig
}

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
	const tasks = config.tasks
		? Object.freeze({
				...(defaults ? { defaults } : {}),
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

export function defineConfig(config: Config): Config {
	return freezeConfig(ConfigSchema.parse(config))
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

export async function loadRepository(rootDirectory: string): Promise<Repository> {
	const resolvedRoot = path.resolve(rootDirectory)
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
		config: resolveConfig(configResult.data),
	})
}

export async function discoverRepository(startDirectory = process.cwd()): Promise<Repository> {
	let currentDirectory = path.resolve(startDirectory)

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
				`No ${CONFIG_FILE_NAME} was found from ${path.resolve(startDirectory)} upward`,
				{ startDirectory: path.resolve(startDirectory) },
			)
		}

		currentDirectory = parentDirectory
	}
}
