import path from 'node:path'
import { parseArgs } from 'node:util'
import {
	TASK_PRIORITIES,
	TASK_STATUSES,
	type TaskPriority,
	type TaskStatus,
} from '@taskset/contracts'
import {
	createTask,
	discoverRepository,
	initializeRepository,
	listTasks,
	readTask,
	serializeTaskFile,
} from '@taskset/core'

const USAGE = `Usage:
  taskset init [--cwd <path>]
  taskset config [--json] [--cwd <path>]
  taskset task create --title <title> [options]
  taskset task list [--json] [--cwd <path>]
  taskset task show <task-id> [--json] [--cwd <path>]

Create options:
  --status <status>
  --priority <priority>
  --label <label>           Repeatable
  --depends-on <task-id>    Repeatable
  --file <path>             Repeatable
  --body <markdown>
`

export interface CliContext {
	readonly cwd?: string
	readonly stderr?: (value: string) => void
	readonly stdout?: (value: string) => void
}

class CliUsageError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'CliUsageError'
	}
}

function parseTaskStatus(value: string | undefined): TaskStatus | undefined {
	if (value === undefined) {
		return undefined
	}

	if (!TASK_STATUSES.includes(value as TaskStatus)) {
		throw new CliUsageError(`Invalid task status "${value}"`)
	}

	return value as TaskStatus
}

function parseTaskPriority(value: string | undefined): TaskPriority | undefined {
	if (value === undefined) {
		return undefined
	}

	if (!TASK_PRIORITIES.includes(value as TaskPriority)) {
		throw new CliUsageError(`Invalid task priority "${value}"`)
	}

	return value as TaskPriority
}

function resolveCommandCwd(baseDirectory: string, cwdOption: string | undefined): string {
	return cwdOption ? path.resolve(baseDirectory, cwdOption) : baseDirectory
}

function parseCommonOptions(args: readonly string[]) {
	return parseArgs({
		args,
		allowPositionals: false,
		options: {
			cwd: { type: 'string' },
			json: { type: 'boolean' },
		},
	})
}

function requireSinglePositional(positionals: readonly string[], name: string): string {
	if (positionals.length !== 1 || !positionals[0]) {
		throw new CliUsageError(`Expected exactly one ${name}`)
	}

	return positionals[0]
}

function formatError(error: unknown): string {
	if (!(error instanceof Error)) {
		return 'Unknown Taskset error'
	}

	const issues =
		'issues' in error && Array.isArray(error.issues)
			? error.issues
					.map((issue) =>
						typeof issue === 'object' && issue !== null && 'field' in issue && 'message' in issue
							? `\n  ${String(issue.field)}: ${String(issue.message)}`
							: '',
					)
					.join('')
			: ''

	return `${error.message}${issues}`
}

export async function runCli(args: readonly string[], context: CliContext = {}): Promise<number> {
	const cwd = path.resolve(context.cwd ?? process.cwd())
	const stdout = context.stdout ?? ((value: string) => process.stdout.write(value))
	const stderr = context.stderr ?? ((value: string) => process.stderr.write(value))

	try {
		const [command, subcommand] = args
		const commandArgs = args.slice(1)
		const taskArgs = args.slice(2)

		if (!command || command === 'help' || command === '--help' || command === '-h') {
			stdout(USAGE)
			return 0
		}

		if (command === 'init') {
			const parsed = parseCommonOptions(commandArgs)
			const repository = await initializeRepository(resolveCommandCwd(cwd, parsed.values.cwd))
			stdout(`Initialized Taskset in ${repository.rootDirectory}\n`)
			return 0
		}

		if (command === 'config') {
			const parsed = parseCommonOptions(commandArgs)
			const repository = await discoverRepository(resolveCommandCwd(cwd, parsed.values.cwd))

			if (parsed.values.json) {
				stdout(
					`${JSON.stringify(
						{
							rootDirectory: repository.rootDirectory,
							configPath: repository.configPath,
							dataDirectory: repository.dataDirectory,
							config: repository.config,
						},
						null,
						2,
					)}\n`,
				)
			} else {
				stdout(`${repository.configPath}\n`)
			}

			return 0
		}

		if (command !== 'task') {
			throw new CliUsageError(`Unknown command "${command}"`)
		}

		if (subcommand === 'create') {
			const parsed = parseArgs({
				args: taskArgs,
				allowPositionals: false,
				options: {
					body: { type: 'string' },
					cwd: { type: 'string' },
					'depends-on': { type: 'string', multiple: true },
					file: { type: 'string', multiple: true },
					json: { type: 'boolean' },
					label: { type: 'string', multiple: true },
					priority: { type: 'string' },
					status: { type: 'string' },
					title: { type: 'string' },
				},
			})

			if (!parsed.values.title) {
				throw new CliUsageError('The --title option is required')
			}

			const status = parseTaskStatus(parsed.values.status)
			const priority = parseTaskPriority(parsed.values.priority)

			const repository = await discoverRepository(resolveCommandCwd(cwd, parsed.values.cwd))
			const record = await createTask(repository, {
				title: parsed.values.title,
				...(status ? { status } : {}),
				...(priority ? { priority } : {}),
				...(parsed.values.label ? { labels: parsed.values.label } : {}),
				...(parsed.values['depends-on'] ? { dependsOn: parsed.values['depends-on'] } : {}),
				...(parsed.values.file ? { files: parsed.values.file } : {}),
				...(parsed.values.body !== undefined ? { body: parsed.values.body } : {}),
			})

			if (parsed.values.json) {
				stdout(
					`${JSON.stringify(
						{ relativePath: record.relativePath, ...record.task.metadata },
						null,
						2,
					)}\n`,
				)
			} else {
				stdout(`${record.task.metadata.id}\n`)
			}

			return 0
		}

		if (subcommand === 'list') {
			const parsed = parseCommonOptions(taskArgs)
			const repository = await discoverRepository(resolveCommandCwd(cwd, parsed.values.cwd))
			const records = await listTasks(repository)

			if (parsed.values.json) {
				stdout(
					`${JSON.stringify(
						records.map((record) => ({
							relativePath: record.relativePath,
							...record.task.metadata,
						})),
						null,
						2,
					)}\n`,
				)
			} else {
				for (const record of records) {
					stdout(
						`${record.task.metadata.id}\t${record.task.metadata.status}\t${record.task.metadata.title}\n`,
					)
				}
			}

			return 0
		}

		if (subcommand === 'show') {
			const parsed = parseArgs({
				args: taskArgs,
				allowPositionals: true,
				options: {
					cwd: { type: 'string' },
					json: { type: 'boolean' },
				},
			})
			const taskId = requireSinglePositional(parsed.positionals, 'task ID')
			const repository = await discoverRepository(resolveCommandCwd(cwd, parsed.values.cwd))
			const record = await readTask(repository, taskId)

			if (parsed.values.json) {
				stdout(
					`${JSON.stringify(
						{
							relativePath: record.relativePath,
							metadata: record.task.metadata,
							body: record.task.body,
						},
						null,
						2,
					)}\n`,
				)
			} else {
				stdout(serializeTaskFile(record.task, { filePath: record.relativePath }))
			}

			return 0
		}

		throw new CliUsageError(`Unknown task command "${subcommand ?? ''}"`)
	} catch (error) {
		if (error instanceof CliUsageError || error instanceof TypeError) {
			stderr(`${formatError(error)}\n\n${USAGE}`)
			return 2
		}

		stderr(`${formatError(error)}\n`)
		return 1
	}
}
