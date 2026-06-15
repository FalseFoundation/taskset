import path from 'node:path'
import { parseArgs } from 'node:util'
import {
	TaskIdSchema,
	TaskPrioritySchema,
	TaskRiskSchema,
	TaskStatusSchema,
	TaskTimestampSchema,
} from '@taskset/contracts'
import {
	buildTaskIndex,
	createSnapshot,
	createTask,
	type DerivedTaskRelationships,
	deleteTask,
	diagnoseRepository,
	discoverRepository,
	generateViews,
	initializeRepository,
	listSnapshots,
	migrateTasks,
	normalizeRepositoryPath,
	queryTasks,
	RepositoryPathError,
	readTask,
	restoreSnapshot,
	serializeTaskFile,
	TASK_SORT_DIRECTIONS,
	TASK_SORT_KEYS,
	type TaskQuery,
	TaskQuerySchema,
	type TaskRecord,
	type UpdateTaskInput,
	updateTask,
} from '@taskset/core'
import * as z from 'zod'

const USAGE = `Usage:
  taskset init [--cwd <path>]
  taskset config [--json] [--cwd <path>]
  taskset doctor [--json] [--cwd <path>]
  taskset generate [--json] [--cwd <path>]
  taskset migrate --to 2 [--apply] [--json] [--cwd <path>]
  taskset snapshot create|list [--json] [--cwd <path>]
  taskset snapshot restore <snapshot-id> [--apply] [--json] [--cwd <path>]
  taskset task create --title <title> [metadata options]
  taskset task list [query options]
  taskset task show <task-id> [--include-derived] [--json] [--cwd <path>]
  taskset task update <task-id> [metadata options]
  taskset task status <task-id> <status> [--json] [--cwd <path>]
  taskset task delete <task-id> [--remove-dependencies] [--json] [--cwd <path>]

Metadata options:
  --status --priority --owner --team --estimate --effort --risk --due-date
  --label --assignee --reviewer --depends-on --related --duplicate
  --parent --file --directory --project --body
  Repeat array options. Update commands also accept matching --clear-* options.

List query options:
  --status --priority --label --owner --assignee --reviewer --team --risk
  --project --depends-on --related --duplicate --parent --file --directory
  --estimate-min --estimate-max --effort-min --effort-max
  --due-before --due-after --created-before --created-after
  --updated-before --updated-after --search --sort --direction
  --impact --include-derived --json
`

export interface CliContext {
	readonly cwd?: string
	readonly stderr?: (value: string) => void
	readonly stdout?: (value: string) => void
}

interface CliIssue {
	readonly field: string
	readonly message: string
}

class CliUsageError extends Error {
	readonly issues: readonly CliIssue[]

	constructor(message: string, issues: readonly CliIssue[] = []) {
		super(message)
		this.name = 'CliUsageError'
		this.issues = issues
	}
}

const TrimmedStringSchema = z.string().trim().min(1)
function uniqueArray<T>(schema: z.ZodType<T>) {
	return z
		.array(schema)
		.refine((values) => new Set(values).size === values.length, 'Values must be unique')
}

const StringListSchema = uniqueArray(TrimmedStringSchema)
const TaskIdListSchema = uniqueArray(TaskIdSchema)
const CwdSchema = z.string().min(1).optional()
const JsonSchema = z.boolean().optional()

const CommonValuesSchema = z.strictObject({
	cwd: CwdSchema,
	json: JsonSchema,
})

const CreateValuesSchema = z.strictObject({
	title: TrimmedStringSchema,
	status: TaskStatusSchema.optional(),
	priority: TaskPrioritySchema.optional(),
	label: StringListSchema.optional(),
	'depends-on': TaskIdListSchema.optional(),
	file: StringListSchema.optional(),
	owner: TrimmedStringSchema.optional(),
	assignee: StringListSchema.optional(),
	reviewer: StringListSchema.optional(),
	team: TrimmedStringSchema.optional(),
	estimate: z.coerce.number().int().nonnegative().optional(),
	effort: z.coerce.number().finite().nonnegative().optional(),
	risk: TaskRiskSchema.optional(),
	'due-date': TaskTimestampSchema.optional(),
	related: TaskIdListSchema.optional(),
	duplicate: TaskIdListSchema.optional(),
	parent: TaskIdSchema.optional(),
	directory: StringListSchema.optional(),
	project: StringListSchema.optional(),
	body: z.string().optional(),
	cwd: CwdSchema,
	json: JsonSchema,
})

const UPDATE_CLEAR_PAIRS = [
	['priority', 'clear-priority'],
	['label', 'clear-labels'],
	['depends-on', 'clear-dependencies'],
	['file', 'clear-files'],
	['owner', 'clear-owner'],
	['assignee', 'clear-assignees'],
	['reviewer', 'clear-reviewers'],
	['team', 'clear-team'],
	['estimate', 'clear-estimate'],
	['effort', 'clear-effort'],
	['risk', 'clear-risk'],
	['due-date', 'clear-due-date'],
	['related', 'clear-related'],
	['duplicate', 'clear-duplicates'],
	['parent', 'clear-parent'],
	['directory', 'clear-directories'],
	['project', 'clear-projects'],
] as const

const UpdateValuesSchema = z
	.strictObject({
		title: TrimmedStringSchema.optional(),
		status: TaskStatusSchema.optional(),
		priority: TaskPrioritySchema.optional(),
		label: StringListSchema.optional(),
		'depends-on': TaskIdListSchema.optional(),
		file: StringListSchema.optional(),
		owner: TrimmedStringSchema.optional(),
		assignee: StringListSchema.optional(),
		reviewer: StringListSchema.optional(),
		team: TrimmedStringSchema.optional(),
		estimate: z.coerce.number().int().nonnegative().optional(),
		effort: z.coerce.number().finite().nonnegative().optional(),
		risk: TaskRiskSchema.optional(),
		'due-date': TaskTimestampSchema.optional(),
		related: TaskIdListSchema.optional(),
		duplicate: TaskIdListSchema.optional(),
		parent: TaskIdSchema.optional(),
		directory: StringListSchema.optional(),
		project: StringListSchema.optional(),
		body: z.string().optional(),
		'clear-priority': z.boolean().optional(),
		'clear-labels': z.boolean().optional(),
		'clear-dependencies': z.boolean().optional(),
		'clear-files': z.boolean().optional(),
		'clear-owner': z.boolean().optional(),
		'clear-assignees': z.boolean().optional(),
		'clear-reviewers': z.boolean().optional(),
		'clear-team': z.boolean().optional(),
		'clear-estimate': z.boolean().optional(),
		'clear-effort': z.boolean().optional(),
		'clear-risk': z.boolean().optional(),
		'clear-due-date': z.boolean().optional(),
		'clear-related': z.boolean().optional(),
		'clear-duplicates': z.boolean().optional(),
		'clear-parent': z.boolean().optional(),
		'clear-directories': z.boolean().optional(),
		'clear-projects': z.boolean().optional(),
		cwd: CwdSchema,
		json: JsonSchema,
	})
	.superRefine((values, context) => {
		for (const [valueKey, clearKey] of UPDATE_CLEAR_PAIRS) {
			if (values[valueKey] !== undefined && values[clearKey]) {
				context.addIssue({
					code: 'custom',
					path: [clearKey],
					message: `Cannot set and clear ${valueKey} in the same update`,
				})
			}
		}

		const nonControlKeys = Object.keys(values).filter((key) => key !== 'cwd' && key !== 'json')

		if (nonControlKeys.length === 0) {
			context.addIssue({
				code: 'custom',
				message: 'Task update requires at least one field option',
			})
		}
	})

const ListValuesSchema = z.strictObject({
	status: z.array(TaskStatusSchema).optional(),
	priority: z.array(TaskPrioritySchema).optional(),
	label: StringListSchema.optional(),
	owner: StringListSchema.optional(),
	assignee: StringListSchema.optional(),
	reviewer: StringListSchema.optional(),
	team: StringListSchema.optional(),
	risk: z.array(TaskRiskSchema).optional(),
	project: StringListSchema.optional(),
	'depends-on': TaskIdSchema.optional(),
	related: TaskIdSchema.optional(),
	duplicate: TaskIdSchema.optional(),
	parent: TaskIdSchema.optional(),
	file: StringListSchema.optional(),
	directory: StringListSchema.optional(),
	'estimate-min': z.coerce.number().finite().nonnegative().optional(),
	'estimate-max': z.coerce.number().finite().nonnegative().optional(),
	'effort-min': z.coerce.number().finite().nonnegative().optional(),
	'effort-max': z.coerce.number().finite().nonnegative().optional(),
	'due-before': TaskTimestampSchema.optional(),
	'due-after': TaskTimestampSchema.optional(),
	'created-before': TaskTimestampSchema.optional(),
	'created-after': TaskTimestampSchema.optional(),
	'updated-before': TaskTimestampSchema.optional(),
	'updated-after': TaskTimestampSchema.optional(),
	search: z.string().optional(),
	sort: z.enum(TASK_SORT_KEYS).optional(),
	direction: z.enum(TASK_SORT_DIRECTIONS).optional(),
	impact: z.boolean().optional(),
	'include-derived': z.boolean().optional(),
	cwd: CwdSchema,
	json: JsonSchema,
})

const metadataOptionDefinitions = {
	body: { type: 'string' },
	'depends-on': { type: 'string', multiple: true },
	file: { type: 'string', multiple: true },
	label: { type: 'string', multiple: true },
	priority: { type: 'string' },
	status: { type: 'string' },
	title: { type: 'string' },
	owner: { type: 'string' },
	assignee: { type: 'string', multiple: true },
	reviewer: { type: 'string', multiple: true },
	team: { type: 'string' },
	estimate: { type: 'string' },
	effort: { type: 'string' },
	risk: { type: 'string' },
	'due-date': { type: 'string' },
	related: { type: 'string', multiple: true },
	duplicate: { type: 'string', multiple: true },
	parent: { type: 'string' },
	directory: { type: 'string', multiple: true },
	project: { type: 'string', multiple: true },
} as const

const commonOptionDefinitions = {
	cwd: { type: 'string' },
	json: { type: 'boolean' },
} as const

function parseSchema<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
	const result = schema.safeParse(value)

	if (!result.success) {
		throw new CliUsageError(
			`Invalid ${label}`,
			result.error.issues.map((issue) => ({
				field: issue.path.length > 0 ? issue.path.map(String).join('.') : label,
				message: issue.message,
			})),
		)
	}

	return result.data
}

function resolveCommandCwd(baseDirectory: string, cwdOption: string | undefined): string {
	return cwdOption ? path.resolve(baseDirectory, cwdOption) : baseDirectory
}

function requirePositionals(
	positionals: readonly string[],
	count: number,
	description: string,
): readonly string[] {
	if (positionals.length !== count || positionals.some((value) => value.length === 0)) {
		throw new CliUsageError(`Expected ${description}`)
	}

	return positionals
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

function taskRecordJson(
	record: TaskRecord,
	derived?: DerivedTaskRelationships,
): Record<string, unknown> {
	return {
		relativePath: record.relativePath,
		...record.task.metadata,
		...(derived ? { derived } : {}),
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

function warningWriter(
	stderr: (value: string) => void,
): (warning: { readonly message: string }) => void {
	return (warning) => stderr(`warning: ${warning.message}\n`)
}

function normalizeMutationPaths(
	repository: Awaited<ReturnType<typeof discoverRepository>>,
	values: readonly string[] | undefined,
): string[] | undefined {
	return values?.map((value) => normalizeRepositoryPath(repository, value))
}

function updateInputFromValues(
	repository: Awaited<ReturnType<typeof discoverRepository>>,
	values: z.infer<typeof UpdateValuesSchema>,
): UpdateTaskInput {
	return {
		...(values.title !== undefined ? { title: values.title } : {}),
		...(values.status !== undefined ? { status: values.status } : {}),
		...(values['clear-priority']
			? { priority: null }
			: values.priority !== undefined
				? { priority: values.priority }
				: {}),
		...(values['clear-labels']
			? { labels: [] }
			: values.label !== undefined
				? { labels: values.label }
				: {}),
		...(values['clear-dependencies']
			? { dependsOn: [] }
			: values['depends-on'] !== undefined
				? { dependsOn: values['depends-on'] }
				: {}),
		...(values['clear-files']
			? { files: [] }
			: values.file !== undefined
				? { files: normalizeMutationPaths(repository, values.file) }
				: {}),
		...(values['clear-owner']
			? { owner: null }
			: values.owner !== undefined
				? { owner: values.owner }
				: {}),
		...(values['clear-assignees']
			? { assignees: [] }
			: values.assignee !== undefined
				? { assignees: values.assignee }
				: {}),
		...(values['clear-reviewers']
			? { reviewers: [] }
			: values.reviewer !== undefined
				? { reviewers: values.reviewer }
				: {}),
		...(values['clear-team']
			? { team: null }
			: values.team !== undefined
				? { team: values.team }
				: {}),
		...(values['clear-estimate']
			? { estimate: null }
			: values.estimate !== undefined
				? { estimate: values.estimate }
				: {}),
		...(values['clear-effort']
			? { effort: null }
			: values.effort !== undefined
				? { effort: values.effort }
				: {}),
		...(values['clear-risk']
			? { risk: null }
			: values.risk !== undefined
				? { risk: values.risk }
				: {}),
		...(values['clear-due-date']
			? { dueDate: null }
			: values['due-date'] !== undefined
				? { dueDate: values['due-date'] }
				: {}),
		...(values['clear-related']
			? { related: [] }
			: values.related !== undefined
				? { related: values.related }
				: {}),
		...(values['clear-duplicates']
			? { duplicates: [] }
			: values.duplicate !== undefined
				? { duplicates: values.duplicate }
				: {}),
		...(values['clear-parent']
			? { parent: null }
			: values.parent !== undefined
				? { parent: values.parent }
				: {}),
		...(values['clear-directories']
			? { directories: [] }
			: values.directory !== undefined
				? { directories: normalizeMutationPaths(repository, values.directory) }
				: {}),
		...(values['clear-projects']
			? { projects: [] }
			: values.project !== undefined
				? { projects: values.project }
				: {}),
		...(values.body !== undefined ? { body: values.body } : {}),
	}
}

export async function runCli(args: readonly string[], context: CliContext = {}): Promise<number> {
	const cwd = path.resolve(context.cwd ?? process.cwd())
	const stdout = context.stdout ?? ((value: string) => process.stdout.write(value))
	const stderr = context.stderr ?? ((value: string) => process.stderr.write(value))
	const onWarning = warningWriter(stderr)

	try {
		const [command, subcommand] = args
		const commandArgs = args.slice(1)
		const subcommandArgs = args.slice(2)

		if (!command || command === 'help' || command === '--help' || command === '-h') {
			stdout(USAGE)
			return 0
		}

		if (command === 'init' || command === 'config' || command === 'doctor') {
			const parsed = parseArgs({
				args: commandArgs,
				allowPositionals: false,
				options: commonOptionDefinitions,
			})
			const values = parseSchema(CommonValuesSchema, parsed.values, `${command} options`)
			const commandCwd = resolveCommandCwd(cwd, values.cwd)

			if (command === 'init') {
				const repository = await initializeRepository(commandCwd)
				stdout(`Initialized Taskset in ${repository.rootDirectory}\n`)
				return 0
			}

			const repository = await discoverRepository(commandCwd)

			if (command === 'config') {
				if (values.json) {
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

			const result = await diagnoseRepository(repository)

			if (values.json) {
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

		if (command === 'generate') {
			const parsed = parseArgs({
				args: commandArgs,
				allowPositionals: false,
				options: commonOptionDefinitions,
			})
			const values = parseSchema(CommonValuesSchema, parsed.values, 'generate options')
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const result = await generateViews(repository)
			stdout(
				values.json
					? `${JSON.stringify(result, null, 2)}\n`
					: `Generated ${result.files.length} views in ${result.directory}\n`,
			)
			return 0
		}

		if (command === 'migrate') {
			const parsed = parseArgs({
				args: commandArgs,
				allowPositionals: false,
				options: {
					...commonOptionDefinitions,
					to: { type: 'string' },
					apply: { type: 'boolean' },
				},
			})
			const values = parseSchema(
				z.strictObject({
					to: z.literal('2'),
					apply: z.boolean().optional(),
					cwd: CwdSchema,
					json: JsonSchema,
				}),
				parsed.values,
				'migrate options',
			)
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const result = await migrateTasks(repository, {
				to: 2,
				apply: values.apply,
				onWarning,
			})

			if (values.json) {
				stdout(`${JSON.stringify(result, null, 2)}\n`)
			} else {
				stdout(
					`${result.applied ? 'Migrated' : 'Would migrate'} ${result.changes.length} tasks to schema 2${
						result.snapshotId ? ` (snapshot ${result.snapshotId})` : ''
					}\n`,
				)
			}
			return 0
		}

		if (command === 'snapshot') {
			if (subcommand === 'create' || subcommand === 'list') {
				const parsed = parseArgs({
					args: subcommandArgs,
					allowPositionals: false,
					options: commonOptionDefinitions,
				})
				const values = parseSchema(
					CommonValuesSchema,
					parsed.values,
					`snapshot ${subcommand} options`,
				)
				const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))

				if (subcommand === 'create') {
					const result = await createSnapshot(repository)
					stdout(values.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.id}\n`)
				} else {
					const results = await listSnapshots(repository)
					if (values.json) {
						stdout(`${JSON.stringify(results, null, 2)}\n`)
					} else {
						for (const result of results) {
							stdout(`${result.id}\t${result.createdAt}\t${result.files.length}\n`)
						}
					}
				}
				return 0
			}

			if (subcommand === 'restore') {
				const parsed = parseArgs({
					args: subcommandArgs,
					allowPositionals: true,
					options: {
						...commonOptionDefinitions,
						apply: { type: 'boolean' },
					},
				})
				const [snapshotId] = requirePositionals(parsed.positionals, 1, 'exactly one snapshot ID')
				const values = parseSchema(
					z.strictObject({
						apply: z.boolean().optional(),
						cwd: CwdSchema,
						json: JsonSchema,
					}),
					parsed.values,
					'snapshot restore options',
				)
				const validatedSnapshotId = parseSchema(
					z.string().regex(/^\d{8}T\d{6}Z-[a-f0-9]{12}$/u),
					snapshotId,
					'snapshot ID',
				)
				const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
				const result = await restoreSnapshot(repository, validatedSnapshotId, {
					apply: values.apply,
					onWarning,
				})
				stdout(
					values.json
						? `${JSON.stringify(result, null, 2)}\n`
						: `${result.applied ? 'Restored' : 'Would restore'} ${result.changes.length} task files from ${validatedSnapshotId}\n`,
				)
				return 0
			}

			throw new CliUsageError(`Unknown snapshot command "${subcommand ?? ''}"`)
		}

		if (command !== 'task') {
			throw new CliUsageError(`Unknown command "${command}"`)
		}

		if (subcommand === 'create') {
			const parsed = parseArgs({
				args: subcommandArgs,
				allowPositionals: false,
				options: { ...metadataOptionDefinitions, ...commonOptionDefinitions },
			})
			const values = parseSchema(CreateValuesSchema, parsed.values, 'task create options')
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const record = await createTask(
				repository,
				{
					title: values.title,
					...(values.status ? { status: values.status } : {}),
					...(values.priority ? { priority: values.priority } : {}),
					...(values.label ? { labels: values.label } : {}),
					...(values['depends-on'] ? { dependsOn: values['depends-on'] } : {}),
					...(values.file ? { files: normalizeMutationPaths(repository, values.file) } : {}),
					...(values.owner ? { owner: values.owner } : {}),
					...(values.assignee ? { assignees: values.assignee } : {}),
					...(values.reviewer ? { reviewers: values.reviewer } : {}),
					...(values.team ? { team: values.team } : {}),
					...(values.estimate !== undefined ? { estimate: values.estimate } : {}),
					...(values.effort !== undefined ? { effort: values.effort } : {}),
					...(values.risk ? { risk: values.risk } : {}),
					...(values['due-date'] ? { dueDate: values['due-date'] } : {}),
					...(values.related ? { related: values.related } : {}),
					...(values.duplicate ? { duplicates: values.duplicate } : {}),
					...(values.parent ? { parent: values.parent } : {}),
					...(values.directory
						? { directories: normalizeMutationPaths(repository, values.directory) }
						: {}),
					...(values.project ? { projects: values.project } : {}),
					...(values.body !== undefined ? { body: values.body } : {}),
				},
				{ onWarning },
			)
			writeTaskRecord(record, values.json, stdout)
			return 0
		}

		if (subcommand === 'list') {
			const parsed = parseArgs({
				args: subcommandArgs,
				allowPositionals: false,
				options: {
					cwd: { type: 'string' },
					json: { type: 'boolean' },
					status: { type: 'string', multiple: true },
					priority: { type: 'string', multiple: true },
					label: { type: 'string', multiple: true },
					owner: { type: 'string', multiple: true },
					assignee: { type: 'string', multiple: true },
					reviewer: { type: 'string', multiple: true },
					team: { type: 'string', multiple: true },
					risk: { type: 'string', multiple: true },
					project: { type: 'string', multiple: true },
					'depends-on': { type: 'string' },
					related: { type: 'string' },
					duplicate: { type: 'string' },
					parent: { type: 'string' },
					file: { type: 'string', multiple: true },
					directory: { type: 'string', multiple: true },
					'estimate-min': { type: 'string' },
					'estimate-max': { type: 'string' },
					'effort-min': { type: 'string' },
					'effort-max': { type: 'string' },
					'due-before': { type: 'string' },
					'due-after': { type: 'string' },
					'created-before': { type: 'string' },
					'created-after': { type: 'string' },
					'updated-before': { type: 'string' },
					'updated-after': { type: 'string' },
					search: { type: 'string' },
					sort: { type: 'string' },
					direction: { type: 'string' },
					impact: { type: 'boolean' },
					'include-derived': { type: 'boolean' },
				},
			})
			const values = parseSchema(ListValuesSchema, parsed.values, 'task list options')
			const query = parseSchema(
				TaskQuerySchema,
				{
					...(values.status ? { statuses: values.status } : {}),
					...(values.priority ? { priorities: values.priority } : {}),
					...(values.label ? { labels: values.label } : {}),
					...(values.owner ? { owners: values.owner } : {}),
					...(values.assignee ? { assignees: values.assignee } : {}),
					...(values.reviewer ? { reviewers: values.reviewer } : {}),
					...(values.team ? { teams: values.team } : {}),
					...(values.risk ? { risks: values.risk } : {}),
					...(values.project ? { projects: values.project } : {}),
					...(values['depends-on'] ? { dependsOn: values['depends-on'] } : {}),
					...(values.related ? { related: values.related } : {}),
					...(values.duplicate ? { duplicate: values.duplicate } : {}),
					...(values.parent ? { parent: values.parent } : {}),
					...(values.file ? { files: values.file } : {}),
					...(values.directory ? { directories: values.directory } : {}),
					...(values['estimate-min'] !== undefined ? { estimateMin: values['estimate-min'] } : {}),
					...(values['estimate-max'] !== undefined ? { estimateMax: values['estimate-max'] } : {}),
					...(values['effort-min'] !== undefined ? { effortMin: values['effort-min'] } : {}),
					...(values['effort-max'] !== undefined ? { effortMax: values['effort-max'] } : {}),
					...(values['due-before'] ? { dueBefore: values['due-before'] } : {}),
					...(values['due-after'] ? { dueAfter: values['due-after'] } : {}),
					...(values['created-before'] ? { createdBefore: values['created-before'] } : {}),
					...(values['created-after'] ? { createdAfter: values['created-after'] } : {}),
					...(values['updated-before'] ? { updatedBefore: values['updated-before'] } : {}),
					...(values['updated-after'] ? { updatedAfter: values['updated-after'] } : {}),
					...(values.search !== undefined ? { text: values.search } : {}),
					...(values.sort ? { sortBy: values.sort } : {}),
					...(values.direction ? { direction: values.direction } : {}),
					...(values.impact ? { impact: true } : {}),
				} satisfies TaskQuery,
				'task list query',
			)
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const result = await queryTasks(repository, query)
			const graph = values['include-derived'] ? (await buildTaskIndex(repository)).graph : undefined
			const serialize = (record: TaskRecord) =>
				taskRecordJson(record, graph?.derive(record.task.metadata.id))

			if (values.json) {
				stdout(
					`${JSON.stringify(
						values.impact
							? {
									direct: result.direct.map(serialize),
									impacted: result.impacted.map(serialize),
								}
							: result.direct.map(serialize),
						null,
						2,
					)}\n`,
				)
			} else {
				for (const record of result.direct) {
					stdout(
						`${values.impact ? 'direct\t' : ''}${record.task.metadata.id}\t${record.task.metadata.status}\t${record.task.metadata.title}\n`,
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

		if (subcommand === 'show') {
			const parsed = parseArgs({
				args: subcommandArgs,
				allowPositionals: true,
				options: {
					...commonOptionDefinitions,
					'include-derived': { type: 'boolean' },
				},
			})
			const [taskId] = requirePositionals(parsed.positionals, 1, 'exactly one task ID')
			const validatedTaskId = parseSchema(TaskIdSchema, taskId, 'task ID')
			const values = parseSchema(
				z.strictObject({
					cwd: CwdSchema,
					json: JsonSchema,
					'include-derived': z.boolean().optional(),
				}),
				parsed.values,
				'task show options',
			)
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const record = await readTask(repository, validatedTaskId)

			if (values.json) {
				const derived = values['include-derived']
					? (await buildTaskIndex(repository)).graph.derive(validatedTaskId)
					: undefined
				stdout(
					`${JSON.stringify(
						{
							relativePath: record.relativePath,
							metadata: record.task.metadata,
							body: record.task.body,
							...(derived ? { derived } : {}),
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
			const clearDefinitions = Object.fromEntries(
				UPDATE_CLEAR_PAIRS.map(([, clear]) => [clear, { type: 'boolean' as const }]),
			)
			const parsed = parseArgs({
				args: subcommandArgs,
				allowPositionals: true,
				options: {
					...metadataOptionDefinitions,
					...clearDefinitions,
					...commonOptionDefinitions,
				},
			})
			const [taskId] = requirePositionals(parsed.positionals, 1, 'exactly one task ID')
			const validatedTaskId = parseSchema(TaskIdSchema, taskId, 'task ID')
			const values = parseSchema(UpdateValuesSchema, parsed.values, 'task update options')
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const record = await updateTask(
				repository,
				validatedTaskId,
				updateInputFromValues(repository, values),
				{ onWarning },
			)
			writeTaskRecord(record, values.json, stdout)
			return 0
		}

		if (subcommand === 'status') {
			const parsed = parseArgs({
				args: subcommandArgs,
				allowPositionals: true,
				options: commonOptionDefinitions,
			})
			const [taskId, status] = requirePositionals(parsed.positionals, 2, 'a task ID and status')
			const validatedTaskId = parseSchema(TaskIdSchema, taskId, 'task ID')
			const validatedStatus = parseSchema(TaskStatusSchema, status, 'task status')
			const values = parseSchema(CommonValuesSchema, parsed.values, 'task status options')
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const record = await updateTask(
				repository,
				validatedTaskId,
				{ status: validatedStatus },
				{ onWarning },
			)
			writeTaskRecord(record, values.json, stdout)
			return 0
		}

		if (subcommand === 'delete') {
			const parsed = parseArgs({
				args: subcommandArgs,
				allowPositionals: true,
				options: {
					...commonOptionDefinitions,
					'remove-dependencies': { type: 'boolean' },
				},
			})
			const [taskId] = requirePositionals(parsed.positionals, 1, 'exactly one task ID')
			const validatedTaskId = parseSchema(TaskIdSchema, taskId, 'task ID')
			const values = parseSchema(
				z.strictObject({
					cwd: CwdSchema,
					json: JsonSchema,
					'remove-dependencies': z.boolean().optional(),
				}),
				parsed.values,
				'task delete options',
			)
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const record = await deleteTask(repository, validatedTaskId, {
				removeDependencies: values['remove-dependencies'],
				onWarning,
			})

			if (values.json) {
				stdout(`${JSON.stringify({ deleted: true, ...taskRecordJson(record) }, null, 2)}\n`)
			} else {
				stdout(`${validatedTaskId}\n`)
			}
			return 0
		}

		throw new CliUsageError(`Unknown task command "${subcommand ?? ''}"`)
	} catch (error) {
		if (
			error instanceof CliUsageError ||
			error instanceof RepositoryPathError ||
			error instanceof TypeError
		) {
			stderr(`${formatError(error)}\n\n${USAGE}`)
			return 2
		}

		stderr(`${formatError(error)}\n`)
		return 1
	}
}
