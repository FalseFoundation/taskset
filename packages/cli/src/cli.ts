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
	deleteTask,
	diagnoseRepository,
	discoverRepository,
	initializeRepository,
	queryTasks,
	readTask,
	serializeTaskFile,
	type TaskQuery,
	type TaskRecord,
	type TaskSortDirection,
	type TaskSortKey,
	tasksForFile,
	type UpdateTaskInput,
	updateTask,
} from '@taskset/core'

const TASK_SORT_KEYS = ['id', 'title', 'status', 'priority', 'createdAt', 'updatedAt'] as const
const TASK_SORT_DIRECTIONS = ['asc', 'desc'] as const

const USAGE = `Usage:
  taskset init [--cwd <path>]
  taskset config [--json] [--cwd <path>]
  taskset doctor [--json] [--cwd <path>]
  taskset tasks-for-file <path> [--impact] [--json] [--cwd <path>]
  taskset task create --title <title> [options]
  taskset task list [query options]
  taskset task show <task-id> [--json] [--cwd <path>]
  taskset task update <task-id> [options]
  taskset task status <task-id> <status> [--json] [--cwd <path>]
  taskset task delete <task-id> [--remove-dependencies] [--json] [--cwd <path>]

Create and update options:
  --title <title>
  --status <status>
  --priority <priority>
  --clear-priority
  --label <label>           Repeatable; replaces labels on update
  --clear-labels
  --depends-on <task-id>    Repeatable; replaces dependencies on update
  --clear-dependencies
  --file <path>             Repeatable; replaces file paths on update
  --clear-files
  --body <markdown>

List query options:
  --status <status>         Repeatable
  --priority <priority>     Repeatable
  --label <label>           Repeatable; all labels must match
  --depends-on <task-id>
  --file <path>
  --search <text>
  --sort <id|title|status|priority|createdAt|updatedAt>
  --direction <asc|desc>
  --json
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

function parseTaskStatuses(
	values: readonly string[] | undefined,
): readonly TaskStatus[] | undefined {
	return values?.map((value) => {
		const status = parseTaskStatus(value)

		if (!status) {
			throw new CliUsageError('Task status must not be empty')
		}

		return status
	})
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

function parseTaskPriorities(
	values: readonly string[] | undefined,
): readonly TaskPriority[] | undefined {
	return values?.map((value) => {
		const priority = parseTaskPriority(value)

		if (!priority) {
			throw new CliUsageError('Task priority must not be empty')
		}

		return priority
	})
}

function parseSortKey(value: string | undefined): TaskSortKey | undefined {
	if (value === undefined) {
		return undefined
	}

	if (!TASK_SORT_KEYS.includes(value as TaskSortKey)) {
		throw new CliUsageError(`Invalid task sort key "${value}"`)
	}

	return value as TaskSortKey
}

function parseSortDirection(value: string | undefined): TaskSortDirection | undefined {
	if (value === undefined) {
		return undefined
	}

	if (!TASK_SORT_DIRECTIONS.includes(value as TaskSortDirection)) {
		throw new CliUsageError(`Invalid task sort direction "${value}"`)
	}

	return value as TaskSortDirection
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

function taskRecordJson(record: TaskRecord) {
	return {
		relativePath: record.relativePath,
		...record.task.metadata,
	}
}

function writeTaskRecord(
	record: TaskRecord,
	json: boolean | undefined,
	stdout: (value: string) => void,
): void {
	if (json) {
		stdout(`${JSON.stringify(taskRecordJson(record), null, 2)}\n`)
	} else {
		stdout(`${record.task.metadata.id}\n`)
	}
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

		if (command === 'doctor') {
			const parsed = parseCommonOptions(commandArgs)
			const repository = await discoverRepository(resolveCommandCwd(cwd, parsed.values.cwd))
			const result = await diagnoseRepository(repository)

			if (parsed.values.json) {
				stdout(`${JSON.stringify(result, null, 2)}\n`)
			} else if (result.valid) {
				stdout(`Taskset repository is valid (${result.taskCount} tasks)\n`)
			} else {
				for (const diagnostic of result.diagnostics) {
					stdout(
						`${diagnostic.code}\t${diagnostic.path ?? '-'}\t${diagnostic.message}\t${diagnostic.remediation}\n`,
					)
				}
			}

			return result.valid ? 0 : 1
		}

		if (command === 'tasks-for-file') {
			const parsed = parseArgs({
				args: commandArgs,
				allowPositionals: true,
				options: {
					cwd: { type: 'string' },
					impact: { type: 'boolean' },
					json: { type: 'boolean' },
				},
			})
			const inputPath = requireSinglePositional(parsed.positionals, 'file or directory path')
			const repository = await discoverRepository(resolveCommandCwd(cwd, parsed.values.cwd))
			const result = await tasksForFile(repository, inputPath, {
				includeImpact: parsed.values.impact,
			})

			if (parsed.values.json) {
				stdout(
					`${JSON.stringify(
						{
							path: result.path,
							direct: result.direct.map(taskRecordJson),
							impacted: result.impacted.map(taskRecordJson),
						},
						null,
						2,
					)}\n`,
				)
			} else {
				for (const record of result.direct) {
					stdout(
						`direct\t${record.task.metadata.id}\t${record.task.metadata.status}\t${record.task.metadata.title}\n`,
					)
				}

				for (const record of result.impacted) {
					stdout(
						`impact\t${record.task.metadata.id}\t${record.task.metadata.status}\t${record.task.metadata.title}\n`,
					)
				}
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
			writeTaskRecord(record, parsed.values.json, stdout)
			return 0
		}

		if (subcommand === 'list') {
			const parsed = parseArgs({
				args: taskArgs,
				allowPositionals: false,
				options: {
					cwd: { type: 'string' },
					'depends-on': { type: 'string' },
					direction: { type: 'string' },
					file: { type: 'string' },
					json: { type: 'boolean' },
					label: { type: 'string', multiple: true },
					priority: { type: 'string', multiple: true },
					search: { type: 'string' },
					sort: { type: 'string' },
					status: { type: 'string', multiple: true },
				},
			})
			const statuses = parseTaskStatuses(parsed.values.status)
			const priorities = parseTaskPriorities(parsed.values.priority)
			const sortBy = parseSortKey(parsed.values.sort)
			const direction = parseSortDirection(parsed.values.direction)
			const query: TaskQuery = {
				...(statuses ? { statuses } : {}),
				...(priorities ? { priorities } : {}),
				...(parsed.values.label ? { labels: parsed.values.label } : {}),
				...(parsed.values['depends-on'] ? { dependsOn: parsed.values['depends-on'] } : {}),
				...(parsed.values.file ? { file: parsed.values.file } : {}),
				...(parsed.values.search ? { text: parsed.values.search } : {}),
				...(sortBy ? { sortBy } : {}),
				...(direction ? { direction } : {}),
			}
			const repository = await discoverRepository(resolveCommandCwd(cwd, parsed.values.cwd))
			const records = await queryTasks(repository, query)

			if (parsed.values.json) {
				stdout(`${JSON.stringify(records.map(taskRecordJson), null, 2)}\n`)
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

		if (subcommand === 'update') {
			const parsed = parseArgs({
				args: taskArgs,
				allowPositionals: true,
				options: {
					body: { type: 'string' },
					'clear-dependencies': { type: 'boolean' },
					'clear-files': { type: 'boolean' },
					'clear-labels': { type: 'boolean' },
					'clear-priority': { type: 'boolean' },
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
			const taskId = requireSinglePositional(parsed.positionals, 'task ID')

			for (const [value, clear, name] of [
				[parsed.values.priority, parsed.values['clear-priority'], 'priority'],
				[parsed.values.label, parsed.values['clear-labels'], 'labels'],
				[parsed.values['depends-on'], parsed.values['clear-dependencies'], 'dependencies'],
				[parsed.values.file, parsed.values['clear-files'], 'files'],
			] as const) {
				if (value !== undefined && clear) {
					throw new CliUsageError(`Cannot set and clear ${name} in the same update`)
				}
			}

			const status = parseTaskStatus(parsed.values.status)
			const priority = parseTaskPriority(parsed.values.priority)
			const input: UpdateTaskInput = {
				...(parsed.values.title !== undefined ? { title: parsed.values.title } : {}),
				...(status ? { status } : {}),
				...(parsed.values['clear-priority'] ? { priority: null } : priority ? { priority } : {}),
				...(parsed.values['clear-labels']
					? { labels: [] }
					: parsed.values.label
						? { labels: parsed.values.label }
						: {}),
				...(parsed.values['clear-dependencies']
					? { dependsOn: [] }
					: parsed.values['depends-on']
						? { dependsOn: parsed.values['depends-on'] }
						: {}),
				...(parsed.values['clear-files']
					? { files: [] }
					: parsed.values.file
						? { files: parsed.values.file }
						: {}),
				...(parsed.values.body !== undefined ? { body: parsed.values.body } : {}),
			}

			if (Object.keys(input).length === 0) {
				throw new CliUsageError('Task update requires at least one field option')
			}

			const repository = await discoverRepository(resolveCommandCwd(cwd, parsed.values.cwd))
			const record = await updateTask(repository, taskId, input)
			writeTaskRecord(record, parsed.values.json, stdout)
			return 0
		}

		if (subcommand === 'status') {
			const parsed = parseArgs({
				args: taskArgs,
				allowPositionals: true,
				options: {
					cwd: { type: 'string' },
					json: { type: 'boolean' },
				},
			})

			if (parsed.positionals.length !== 2) {
				throw new CliUsageError('Expected a task ID and status')
			}

			const [taskId, statusValue] = parsed.positionals
			const status = parseTaskStatus(statusValue)

			if (!taskId || !status) {
				throw new CliUsageError('Expected a task ID and status')
			}

			const repository = await discoverRepository(resolveCommandCwd(cwd, parsed.values.cwd))
			const record = await updateTask(repository, taskId, { status })
			writeTaskRecord(record, parsed.values.json, stdout)
			return 0
		}

		if (subcommand === 'delete') {
			const parsed = parseArgs({
				args: taskArgs,
				allowPositionals: true,
				options: {
					cwd: { type: 'string' },
					json: { type: 'boolean' },
					'remove-dependencies': { type: 'boolean' },
				},
			})
			const taskId = requireSinglePositional(parsed.positionals, 'task ID')
			const repository = await discoverRepository(resolveCommandCwd(cwd, parsed.values.cwd))
			const record = await deleteTask(repository, taskId, {
				removeDependencies: parsed.values['remove-dependencies'],
			})

			if (parsed.values.json) {
				stdout(`${JSON.stringify({ deleted: true, ...taskRecordJson(record) }, null, 2)}\n`)
			} else {
				stdout(`${taskId}\n`)
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
