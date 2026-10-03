import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
	ConcernClassSchema,
	DocumentIdSchema,
	DocumentStatusSchema,
	DocumentTimestampSchema,
	LessonSeveritySchema,
	TaskIdSchema,
	TaskPrioritySchema,
	TaskRiskSchema,
	TaskStatusSchema,
	TaskTimestampSchema,
} from '@taskset/contracts'
import {
	buildDocumentGraph,
	buildTaskIndex,
	createDocument,
	createSnapshot,
	createTask,
	type DerivedDocumentRelationships,
	type DerivedTaskRelationships,
	DOCUMENT_SORT_DIRECTIONS,
	DOCUMENT_SORT_KEYS,
	type DocumentBatchOperation,
	type DocumentQuery,
	DocumentQuerySchema,
	type DocumentRecord,
	deleteDocument,
	deleteTask,
	diagnoseRepository,
	discoverRepository,
	executeDocumentBatch,
	generateViews,
	getProgramRollup,
	importDocument,
	initializeRepository,
	listDocuments,
	listSnapshots,
	migrateTaskIds,
	normalizeDocumentKind,
	normalizeRepositoryPath,
	queryDocuments,
	queryTasks,
	RepositoryPathError,
	readDocument,
	readTask,
	restoreSnapshot,
	serializeDocumentFile,
	serializeTaskFile,
	syncRepository,
	TASK_SORT_DIRECTIONS,
	TASK_SORT_KEYS,
	type TaskQuery,
	TaskQuerySchema,
	type TaskRecord,
	type UpdateDocumentInput,
	type UpdateTaskInput,
	updateDocument,
	updateTask,
} from '@taskset/core'
import * as z from 'zod'

const USAGE = `Usage:
  taskset init [--config] [--cwd <path>]
  taskset config [--json] [--cwd <path>]
  taskset doctor [--json] [--cwd <path>]
  taskset generate [--json] [--cwd <path>]
  taskset snapshot create|list [--json] [--cwd <path>]
  taskset snapshot restore <snapshot-id> [--apply] [--json] [--cwd <path>]
  taskset task create --title <title> [metadata options]
  taskset task list [query options]
  taskset task show <task-id> [--include-derived] [--json] [--cwd <path>]
  taskset task update <task-id> [metadata options]
  taskset task status <task-id> <status> [--json] [--cwd <path>]
  taskset task delete <task-id> [--remove-dependencies] [--json] [--cwd <path>]
  taskset task migrate-ids [--json] [--cwd <path>]
  taskset task program <parent-id> [--json] [--cwd <path>]
  taskset sync [--concurrency <count>] [--json] [--cwd <path>]
  taskset document create <story|flow|decision|adr|dr|research|runbook|lesson|antipattern|concern|audit> --title <title> [metadata options]
  taskset document import <markdown-path> [--type <type>] [--move]
  taskset document batch <manifest.json> [--concurrency <count>] [--json]
  taskset document list [type] [query options]
  taskset document show <document-id> [--type <type>] [--include-derived] [--json]
  taskset document update <document-id> [metadata options] [--type <type>]
  taskset document status <document-id> <status> [--type <type>] [--json]
  taskset document delete <document-id> [--type <type>] [--remove-dependencies] [--json]

Metadata options:
  --status --priority --order --owner --team --estimate --effort --risk --due-date
  --label --assignee --reviewer --depends-on --related --duplicate
  --parent --file --directory --project --body
  Lesson/concern options: --severity --related-skill --pack --class --cadence
  Repeat array options. Task and document updates clear arrays with --clear-dependencies,
  --clear-labels, --clear-assignees, --clear-reviewers, --clear-related,
  --clear-files, --clear-directories, --clear-projects, --clear-related-skills,
  or --clear-packs. Clear scalar relationships with --clear-parent, --clear-owner,
  --clear-severity, --clear-class, or --clear-cadence.

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

const InitValuesSchema = z.strictObject({
	cwd: CwdSchema,
	config: z.boolean().optional(),
})

const ConcurrencySchema = z.coerce.number().int().min(1).max(32).optional()
const DocumentKindInputSchema = TrimmedStringSchema.transform((value, context) => {
	try {
		return normalizeDocumentKind(value)
	} catch (error) {
		context.addIssue({
			code: 'custom',
			message: error instanceof Error ? error.message : 'Invalid document type',
		})
		return z.NEVER
	}
})
const DocumentInputSchema = z.strictObject({
	type: DocumentKindInputSchema,
	title: TrimmedStringSchema,
	status: DocumentStatusSchema.optional(),
	priority: TaskPrioritySchema.optional(),
	order: z.number().finite().nonnegative().optional(),
	labels: StringListSchema.optional(),
	dependsOn: TaskIdListSchema.optional(),
	files: StringListSchema.optional(),
	owner: TrimmedStringSchema.optional(),
	assignees: StringListSchema.optional(),
	reviewers: StringListSchema.optional(),
	team: TrimmedStringSchema.optional(),
	estimate: z.number().int().nonnegative().optional(),
	effort: z.number().finite().nonnegative().optional(),
	risk: TaskRiskSchema.optional(),
	dueDate: DocumentTimestampSchema.optional(),
	related: TaskIdListSchema.optional(),
	duplicates: TaskIdListSchema.optional(),
	parent: TaskIdSchema.optional(),
	directories: StringListSchema.optional(),
	projects: StringListSchema.optional(),
	severity: LessonSeveritySchema.optional(),
	relatedSkills: StringListSchema.optional(),
	packs: StringListSchema.optional(),
	class: ConcernClassSchema.optional(),
	cadence: TrimmedStringSchema.optional(),
	body: z.string().optional(),
})
const DocumentUpdateSchema = z
	.strictObject({
		title: TrimmedStringSchema.optional(),
		status: DocumentStatusSchema.optional(),
		priority: TaskPrioritySchema.nullable().optional(),
		order: z.number().finite().nonnegative().nullable().optional(),
		labels: StringListSchema.optional(),
		dependsOn: TaskIdListSchema.optional(),
		files: StringListSchema.optional(),
		owner: TrimmedStringSchema.nullable().optional(),
		assignees: StringListSchema.optional(),
		reviewers: StringListSchema.optional(),
		team: TrimmedStringSchema.nullable().optional(),
		estimate: z.number().int().nonnegative().nullable().optional(),
		effort: z.number().finite().nonnegative().nullable().optional(),
		risk: TaskRiskSchema.nullable().optional(),
		dueDate: DocumentTimestampSchema.nullable().optional(),
		related: TaskIdListSchema.optional(),
		duplicates: TaskIdListSchema.optional(),
		parent: TaskIdSchema.nullable().optional(),
		directories: StringListSchema.optional(),
		projects: StringListSchema.optional(),
		severity: LessonSeveritySchema.nullable().optional(),
		relatedSkills: StringListSchema.optional(),
		packs: StringListSchema.optional(),
		class: ConcernClassSchema.nullable().optional(),
		cadence: TrimmedStringSchema.nullable().optional(),
		body: z.string().optional(),
	})
	.refine((input) => Object.keys(input).length > 0, 'Document update requires at least one field')
const DocumentBatchSchema = z
	.array(
		z.discriminatedUnion('action', [
			z.strictObject({ action: z.literal('create'), input: DocumentInputSchema }),
			z.strictObject({
				action: z.literal('import'),
				sourcePath: TrimmedStringSchema,
				options: z
					.strictObject({
						type: DocumentKindInputSchema.optional(),
						title: TrimmedStringSchema.optional(),
						move: z.boolean().optional(),
					})
					.optional(),
			}),
			z.strictObject({
				action: z.literal('update'),
				id: TrimmedStringSchema,
				type: DocumentKindInputSchema.optional(),
				input: DocumentUpdateSchema,
			}),
			z.strictObject({
				action: z.literal('export'),
				id: TrimmedStringSchema,
				type: DocumentKindInputSchema.optional(),
				targetPath: TrimmedStringSchema,
				overwrite: z.boolean().optional(),
			}),
		]),
	)
	.min(1)

const UPDATE_CLEAR_PAIRS = [
	['priority', 'clear-priority'],
	['order', 'clear-order'],
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

const DOCUMENT_UPDATE_CLEAR_PAIRS = [
	...UPDATE_CLEAR_PAIRS,
	['severity', 'clear-severity'],
	['related-skill', 'clear-related-skills'],
	['pack', 'clear-packs'],
	['class', 'clear-class'],
	['cadence', 'clear-cadence'],
] as const

const DocumentCreateValuesSchema = z.strictObject({
	title: TrimmedStringSchema,
	status: DocumentStatusSchema.optional(),
	priority: TaskPrioritySchema.optional(),
	order: z.coerce.number().finite().nonnegative().optional(),
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
	'due-date': DocumentTimestampSchema.optional(),
	related: TaskIdListSchema.optional(),
	duplicate: TaskIdListSchema.optional(),
	parent: TaskIdSchema.optional(),
	directory: StringListSchema.optional(),
	project: StringListSchema.optional(),
	severity: LessonSeveritySchema.optional(),
	'related-skill': StringListSchema.optional(),
	pack: StringListSchema.optional(),
	class: ConcernClassSchema.optional(),
	cadence: TrimmedStringSchema.optional(),
	body: z.string().optional(),
	cwd: CwdSchema,
	json: JsonSchema,
})

const DocumentUpdateValuesSchema = z
	.strictObject({
		title: TrimmedStringSchema.optional(),
		status: DocumentStatusSchema.optional(),
		priority: TaskPrioritySchema.optional(),
		order: z.coerce.number().finite().nonnegative().optional(),
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
		'due-date': DocumentTimestampSchema.optional(),
		related: TaskIdListSchema.optional(),
		duplicate: TaskIdListSchema.optional(),
		parent: TaskIdSchema.optional(),
		directory: StringListSchema.optional(),
		project: StringListSchema.optional(),
		severity: LessonSeveritySchema.optional(),
		'related-skill': StringListSchema.optional(),
		pack: StringListSchema.optional(),
		class: ConcernClassSchema.optional(),
		cadence: TrimmedStringSchema.optional(),
		body: z.string().optional(),
		type: TrimmedStringSchema.optional(),
		'clear-priority': z.boolean().optional(),
		'clear-order': z.boolean().optional(),
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
		'clear-severity': z.boolean().optional(),
		'clear-related-skills': z.boolean().optional(),
		'clear-packs': z.boolean().optional(),
		'clear-class': z.boolean().optional(),
		'clear-cadence': z.boolean().optional(),
		cwd: CwdSchema,
		json: JsonSchema,
	})
	.superRefine((values, context) => {
		for (const [valueKey, clearKey] of DOCUMENT_UPDATE_CLEAR_PAIRS) {
			if (values[valueKey] !== undefined && values[clearKey]) {
				context.addIssue({
					code: 'custom',
					path: [clearKey],
					message: `Cannot set and clear ${valueKey} in the same update`,
				})
			}
		}

		const nonControlKeys = Object.keys(values).filter(
			(key) => key !== 'cwd' && key !== 'json' && key !== 'type',
		)

		if (nonControlKeys.length === 0) {
			context.addIssue({
				code: 'custom',
				message: 'Document update requires at least one field option',
			})
		}
	})

const DocumentListValuesSchema = z.strictObject({
	status: z.array(DocumentStatusSchema).optional(),
	priority: z.array(TaskPrioritySchema).optional(),
	label: StringListSchema.optional(),
	owner: StringListSchema.optional(),
	assignee: StringListSchema.optional(),
	reviewer: StringListSchema.optional(),
	team: StringListSchema.optional(),
	risk: z.array(TaskRiskSchema).optional(),
	project: StringListSchema.optional(),
	class: z.array(ConcernClassSchema).optional(),
	severity: z.array(LessonSeveritySchema).optional(),
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
	'due-before': DocumentTimestampSchema.optional(),
	'due-after': DocumentTimestampSchema.optional(),
	'created-before': DocumentTimestampSchema.optional(),
	'created-after': DocumentTimestampSchema.optional(),
	'updated-before': DocumentTimestampSchema.optional(),
	'updated-after': DocumentTimestampSchema.optional(),
	search: z.string().optional(),
	sort: z.enum(DOCUMENT_SORT_KEYS).optional(),
	direction: z.enum(DOCUMENT_SORT_DIRECTIONS).optional(),
	impact: z.boolean().optional(),
	'include-derived': z.boolean().optional(),
	cwd: CwdSchema,
	json: JsonSchema,
})

const CreateValuesSchema = z.strictObject({
	title: TrimmedStringSchema,
	status: TaskStatusSchema.optional(),
	priority: TaskPrioritySchema.optional(),
	order: z.coerce.number().finite().nonnegative().optional(),
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

const UpdateValuesSchema = z
	.strictObject({
		title: TrimmedStringSchema.optional(),
		status: TaskStatusSchema.optional(),
		priority: TaskPrioritySchema.optional(),
		order: z.coerce.number().finite().nonnegative().optional(),
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
		'clear-order': z.boolean().optional(),
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
	order: { type: 'string' },
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

const documentMetadataOptionDefinitions = {
	...metadataOptionDefinitions,
	severity: { type: 'string' },
	'related-skill': { type: 'string', multiple: true },
	pack: { type: 'string', multiple: true },
	class: { type: 'string' },
	cadence: { type: 'string' },
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

function documentRecordJson(
	record: DocumentRecord,
	derived?: DerivedDocumentRelationships,
): Record<string, unknown> {
	return {
		relativePath: record.relativePath,
		...record.document.metadata,
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

function writeDocumentRecord(
	record: DocumentRecord,
	json: boolean | undefined,
	stdout: (value: string) => void,
): void {
	if (json) {
		stdout(`${JSON.stringify(documentRecordJson(record), null, 2)}\n`)
	} else {
		stdout(`${record.document.metadata.id}\n`)
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
		...(values['clear-order']
			? { order: null }
			: values.order !== undefined
				? { order: values.order }
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

function documentUpdateInputFromValues(
	repository: Awaited<ReturnType<typeof discoverRepository>>,
	values: z.infer<typeof DocumentUpdateValuesSchema>,
): UpdateDocumentInput {
	const input: Record<string, unknown> = {}
	if (values.title !== undefined) input.title = values.title
	if (values.status !== undefined) input.status = values.status
	if (values['clear-priority']) input.priority = null
	else if (values.priority !== undefined) input.priority = values.priority
	if (values['clear-order']) input.order = null
	else if (values.order !== undefined) input.order = values.order
	if (values['clear-labels']) input.labels = []
	else if (values.label !== undefined) input.labels = values.label
	if (values['clear-dependencies']) input.dependsOn = []
	else if (values['depends-on'] !== undefined) input.dependsOn = values['depends-on']
	if (values['clear-files']) input.files = []
	else if (values.file !== undefined) input.files = normalizeMutationPaths(repository, values.file)
	if (values['clear-owner']) input.owner = null
	else if (values.owner !== undefined) input.owner = values.owner
	if (values['clear-assignees']) input.assignees = []
	else if (values.assignee !== undefined) input.assignees = values.assignee
	if (values['clear-reviewers']) input.reviewers = []
	else if (values.reviewer !== undefined) input.reviewers = values.reviewer
	if (values['clear-team']) input.team = null
	else if (values.team !== undefined) input.team = values.team
	if (values['clear-estimate']) input.estimate = null
	else if (values.estimate !== undefined) input.estimate = values.estimate
	if (values['clear-effort']) input.effort = null
	else if (values.effort !== undefined) input.effort = values.effort
	if (values['clear-risk']) input.risk = null
	else if (values.risk !== undefined) input.risk = values.risk
	if (values['clear-due-date']) input.dueDate = null
	else if (values['due-date'] !== undefined) input.dueDate = values['due-date']
	if (values['clear-related']) input.related = []
	else if (values.related !== undefined) input.related = values.related
	if (values['clear-duplicates']) input.duplicates = []
	else if (values.duplicate !== undefined) input.duplicates = values.duplicate
	if (values['clear-parent']) input.parent = null
	else if (values.parent !== undefined) input.parent = values.parent
	if (values['clear-directories']) input.directories = []
	else if (values.directory !== undefined) {
		input.directories = normalizeMutationPaths(repository, values.directory)
	}
	if (values['clear-projects']) input.projects = []
	else if (values.project !== undefined) input.projects = values.project
	if (values['clear-severity']) input.severity = null
	else if (values.severity !== undefined) input.severity = values.severity
	if (values['clear-related-skills']) input.relatedSkills = []
	else if (values['related-skill'] !== undefined) input.relatedSkills = values['related-skill']
	if (values['clear-packs']) input.packs = []
	else if (values.pack !== undefined) input.packs = values.pack
	if (values['clear-class']) input.class = null
	else if (values.class !== undefined) input.class = values.class
	if (values['clear-cadence']) input.cadence = null
	else if (values.cadence !== undefined) input.cadence = values.cadence
	if (values.body !== undefined) input.body = values.body
	return input as UpdateDocumentInput
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
			if (command === 'init') {
				const parsed = parseArgs({
					args: commandArgs,
					allowPositionals: false,
					options: {
						cwd: { type: 'string' },
						config: { type: 'boolean' },
					},
				})
				const values = parseSchema(InitValuesSchema, parsed.values, 'init options')
				const commandCwd = resolveCommandCwd(cwd, values.cwd)
				const repository = await initializeRepository(commandCwd, {
					writeConfig: values.config === true,
				})
				stdout(`Initialized Taskset in ${repository.rootDirectory}\n`)
				return 0
			}

			const parsed = parseArgs({
				args: commandArgs,
				allowPositionals: false,
				options: commonOptionDefinitions,
			})
			const values = parseSchema(CommonValuesSchema, parsed.values, `${command} options`)
			const commandCwd = resolveCommandCwd(cwd, values.cwd)
			const repository = await discoverRepository(commandCwd)

			if (command === 'config') {
				if (values.json) {
					stdout(
						`${JSON.stringify(
							{
								rootDirectory: repository.rootDirectory,
								configPath: repository.configPath,
								hasConfig: repository.hasConfig,
								dataDirectory: repository.dataDirectory,
								config: repository.config,
							},
							null,
							2,
						)}\n`,
					)
				} else if (repository.hasConfig) {
					stdout(`${repository.configPath}\n`)
				} else {
					stdout(`defaults (${repository.rootDirectory})\n`)
				}
				return 0
			}

			const result = await diagnoseRepository(repository)

			if (values.json) {
				stdout(`${JSON.stringify(result, null, 2)}\n`)
			} else if (result.valid) {
				stdout(
					`Taskset repository is valid (${result.taskCount} tasks, ${result.documentCount} documents)\n`,
				)
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

		if (command === 'sync') {
			const parsed = parseArgs({
				args: commandArgs,
				allowPositionals: false,
				options: { ...commonOptionDefinitions, concurrency: { type: 'string' } },
			})
			const values = parseSchema(
				z.strictObject({ ...CommonValuesSchema.shape, concurrency: ConcurrencySchema }),
				parsed.values,
				'sync options',
			)
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const result = await syncRepository(repository, {
				concurrency: values.concurrency,
				onProgress: (progress) =>
					stderr(
						`sync ${progress.phase}: ${progress.completed}/${progress.total} (${progress.percent}%)\n`,
					),
			})
			stdout(
				values.json
					? `${JSON.stringify(result, null, 2)}\n`
					: `Synced ${result.migrations.length + result.documentMigrations.length} migrations and generated views\n`,
			)
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

		if (command === 'document' || command === 'doc') {
			if (subcommand === 'batch') {
				const parsed = parseArgs({
					args: subcommandArgs,
					allowPositionals: true,
					options: { ...commonOptionDefinitions, concurrency: { type: 'string' } },
				})
				const [manifestPath] = requirePositionals(
					parsed.positionals,
					1,
					'exactly one batch manifest path',
				)
				const values = parseSchema(
					z.strictObject({ ...CommonValuesSchema.shape, concurrency: ConcurrencySchema }),
					parsed.values,
					'document batch options',
				)
				const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
				const validatedManifestPath = parseSchema(
					z.string(),
					manifestPath,
					'document batch manifest path',
				)
				const raw = JSON.parse(
					await readFile(path.resolve(repository.rootDirectory, validatedManifestPath), 'utf8'),
				) as unknown
				const operations = parseSchema(
					DocumentBatchSchema,
					raw,
					'document batch manifest',
				) as readonly DocumentBatchOperation[]
				const results = await executeDocumentBatch(repository, operations, {
					concurrency: values.concurrency,
					onProgress: (progress) =>
						stderr(
							`document ${progress.action}: ${progress.completed}/${progress.total} (${progress.percent}%)\n`,
						),
				})
				stdout(
					values.json
						? `${JSON.stringify(results, null, 2)}\n`
						: `${results.map((result) => result.relativePath).join('\n')}\n`,
				)
				return 0
			}
			if (subcommand === 'create') {
				const parsed = parseArgs({
					args: subcommandArgs,
					allowPositionals: true,
					options: { ...documentMetadataOptionDefinitions, ...commonOptionDefinitions },
				})
				const [rawType] = requirePositionals(parsed.positionals, 1, 'exactly one document type')
				const values = parseSchema(
					DocumentCreateValuesSchema,
					parsed.values,
					'document create options',
				)
				const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
				const record = await createDocument(
					repository,
					{
						type: normalizeDocumentKind(parseSchema(z.string(), rawType, 'document type')),
						title: values.title,
						...(values.status ? { status: values.status } : {}),
						...(values.priority ? { priority: values.priority } : {}),
						...(values.order !== undefined ? { order: values.order } : {}),
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
						...(values.severity ? { severity: values.severity } : {}),
						...(values['related-skill'] ? { relatedSkills: values['related-skill'] } : {}),
						...(values.pack ? { packs: values.pack } : {}),
						...(values.class ? { class: values.class } : {}),
						...(values.cadence ? { cadence: values.cadence } : {}),
						...(values.body !== undefined ? { body: values.body } : {}),
					},
					{ onWarning },
				)
				writeDocumentRecord(record, values.json, stdout)
				return 0
			}

			if (subcommand === 'import') {
				const parsed = parseArgs({
					args: subcommandArgs,
					allowPositionals: true,
					options: {
						...commonOptionDefinitions,
						type: { type: 'string' },
						title: { type: 'string' },
						move: { type: 'boolean' },
					},
				})
				const [sourcePath] = requirePositionals(parsed.positionals, 1, 'exactly one Markdown path')
				const values = parseSchema(
					z.strictObject({
						type: TrimmedStringSchema.optional(),
						title: TrimmedStringSchema.optional(),
						move: z.boolean().optional(),
						cwd: CwdSchema,
						json: JsonSchema,
					}),
					parsed.values,
					'document import options',
				)
				const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
				const record = await importDocument(
					repository,
					parseSchema(z.string(), sourcePath, 'document import path'),
					{
						...(values.type ? { type: normalizeDocumentKind(values.type) } : {}),
						...(values.title ? { title: values.title } : {}),
						move: values.move,
					},
				)
				stdout(values.json ? `${JSON.stringify(record, null, 2)}\n` : `${record.relativePath}\n`)
				return 0
			}

			if (subcommand === 'list') {
				const parsed = parseArgs({
					args: subcommandArgs,
					allowPositionals: true,
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
						class: { type: 'string', multiple: true },
						severity: { type: 'string', multiple: true },
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
				if (parsed.positionals.length > 1)
					throw new CliUsageError('Expected at most one document type')
				const values = parseSchema(DocumentListValuesSchema, parsed.values, 'document list options')
				const typeFilter = parsed.positionals[0]
					? normalizeDocumentKind(parsed.positionals[0])
					: undefined
				const query = parseSchema(
					DocumentQuerySchema,
					{
						...(typeFilter ? { types: [typeFilter] } : {}),
						...(values.status ? { statuses: values.status } : {}),
						...(values.priority ? { priorities: values.priority } : {}),
						...(values.label ? { labels: values.label } : {}),
						...(values.owner ? { owners: values.owner } : {}),
						...(values.assignee ? { assignees: values.assignee } : {}),
						...(values.reviewer ? { reviewers: values.reviewer } : {}),
						...(values.team ? { teams: values.team } : {}),
						...(values.risk ? { risks: values.risk } : {}),
						...(values.project ? { projects: values.project } : {}),
						...(values.class ? { classes: values.class } : {}),
						...(values.severity ? { severities: values.severity } : {}),
						...(values['depends-on'] ? { dependsOn: values['depends-on'] } : {}),
						...(values.related ? { related: values.related } : {}),
						...(values.duplicate ? { duplicate: values.duplicate } : {}),
						...(values.parent ? { parent: values.parent } : {}),
						...(values.file ? { files: values.file } : {}),
						...(values.directory ? { directories: values.directory } : {}),
						...(values['estimate-min'] !== undefined
							? { estimateMin: values['estimate-min'] }
							: {}),
						...(values['estimate-max'] !== undefined
							? { estimateMax: values['estimate-max'] }
							: {}),
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
					} satisfies DocumentQuery,
					'document list query',
				)
				const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
				const result = await queryDocuments(repository, query)
				const derivedGraph = values['include-derived']
					? buildDocumentGraph(await listDocuments(repository))
					: undefined
				const serialize = (record: DocumentRecord) =>
					documentRecordJson(record, derivedGraph?.derive(record.document.metadata.id))

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
							`${values.impact ? 'direct\t' : ''}${record.document.metadata.id}\t${record.document.metadata.type}\t${record.document.metadata.status}\t${record.document.metadata.title}\n`,
						)
					}
					for (const record of result.impacted) {
						stdout(
							`impact\t${record.document.metadata.id}\t${record.document.metadata.type}\t${record.document.metadata.status}\t${record.document.metadata.title}\n`,
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
						type: { type: 'string' },
						'include-derived': { type: 'boolean' },
					},
				})
				const [id] = requirePositionals(parsed.positionals, 1, 'exactly one document ID')
				const values = parseSchema(
					z.strictObject({
						...CommonValuesSchema.shape,
						type: TrimmedStringSchema.optional(),
						'include-derived': z.boolean().optional(),
					}),
					parsed.values,
					'document show options',
				)
				const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
				const validatedId = parseSchema(DocumentIdSchema, id, 'document ID')
				const record = await readDocument(
					repository,
					validatedId,
					values.type ? normalizeDocumentKind(values.type) : undefined,
				)

				if (values.json) {
					const derived = values['include-derived']
						? buildDocumentGraph(await listDocuments(repository)).derive(validatedId)
						: undefined
					stdout(
						`${JSON.stringify(
							{
								relativePath: record.relativePath,
								metadata: record.document.metadata,
								body: record.document.body,
								...(derived ? { derived } : {}),
							},
							null,
							2,
						)}\n`,
					)
				} else {
					stdout(serializeDocumentFile(record.document))
				}
				return 0
			}

			if (subcommand === 'update') {
				const clearDefinitions = Object.fromEntries(
					DOCUMENT_UPDATE_CLEAR_PAIRS.map(([, clear]) => [clear, { type: 'boolean' as const }]),
				)
				const parsed = parseArgs({
					args: subcommandArgs,
					allowPositionals: true,
					options: {
						...documentMetadataOptionDefinitions,
						...clearDefinitions,
						...commonOptionDefinitions,
						type: { type: 'string' },
					},
				})
				const [documentId] = requirePositionals(parsed.positionals, 1, 'exactly one document ID')
				const validatedDocumentId = parseSchema(DocumentIdSchema, documentId, 'document ID')
				const values = parseSchema(
					DocumentUpdateValuesSchema,
					parsed.values,
					'document update options',
				)
				const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
				const record = await updateDocument(
					repository,
					validatedDocumentId,
					documentUpdateInputFromValues(repository, values),
					values.type ? normalizeDocumentKind(values.type) : undefined,
					{ onWarning },
				)
				writeDocumentRecord(record, values.json, stdout)
				return 0
			}

			if (subcommand === 'status') {
				const parsed = parseArgs({
					args: subcommandArgs,
					allowPositionals: true,
					options: { ...commonOptionDefinitions, type: { type: 'string' } },
				})
				const [documentId, status] = requirePositionals(
					parsed.positionals,
					2,
					'a document ID and status',
				)
				const validatedDocumentId = parseSchema(DocumentIdSchema, documentId, 'document ID')
				const validatedStatus = parseSchema(DocumentStatusSchema, status, 'document status')
				const values = parseSchema(
					z.strictObject({ ...CommonValuesSchema.shape, type: TrimmedStringSchema.optional() }),
					parsed.values,
					'document status options',
				)
				const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
				const record = await updateDocument(
					repository,
					validatedDocumentId,
					{ status: validatedStatus },
					values.type ? normalizeDocumentKind(values.type) : undefined,
					{ onWarning },
				)
				writeDocumentRecord(record, values.json, stdout)
				return 0
			}

			if (subcommand === 'delete') {
				const parsed = parseArgs({
					args: subcommandArgs,
					allowPositionals: true,
					options: {
						...commonOptionDefinitions,
						type: { type: 'string' },
						'remove-dependencies': { type: 'boolean' },
					},
				})
				const [documentId] = requirePositionals(parsed.positionals, 1, 'exactly one document ID')
				const validatedDocumentId = parseSchema(DocumentIdSchema, documentId, 'document ID')
				const values = parseSchema(
					z.strictObject({
						cwd: CwdSchema,
						json: JsonSchema,
						type: TrimmedStringSchema.optional(),
						'remove-dependencies': z.boolean().optional(),
					}),
					parsed.values,
					'document delete options',
				)
				const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
				const record = await deleteDocument(
					repository,
					validatedDocumentId,
					values.type ? normalizeDocumentKind(values.type) : undefined,
					{
						removeDependencies: values['remove-dependencies'],
						onWarning,
					},
				)

				if (values.json) {
					stdout(`${JSON.stringify({ deleted: true, ...documentRecordJson(record) }, null, 2)}\n`)
				} else {
					stdout(`${validatedDocumentId}\n`)
				}
				return 0
			}

			throw new CliUsageError(`Unknown document command "${subcommand ?? ''}"`)
		}

		if (command !== 'task') {
			throw new CliUsageError(`Unknown command "${command}"`)
		}

		if (subcommand === 'migrate-ids') {
			const parsed = parseArgs({
				args: subcommandArgs,
				allowPositionals: false,
				options: commonOptionDefinitions,
			})
			const values = parseSchema(CommonValuesSchema, parsed.values, 'task migrate-ids options')
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const migrations = await migrateTaskIds(repository, {
				onProgress: (progress) =>
					stderr(
						`migration ${progress.phase}: ${progress.completed}/${progress.total} (${progress.percent}%)\n`,
					),
			})
			if (values.json) stdout(`${JSON.stringify(migrations, null, 2)}\n`)
			else for (const migration of migrations) stdout(`${migration.from}\t${migration.to}\n`)
			return 0
		}

		if (subcommand === 'program') {
			const parsed = parseArgs({
				args: subcommandArgs,
				allowPositionals: true,
				options: commonOptionDefinitions,
			})
			const [parentId] = requirePositionals(parsed.positionals, 1, 'exactly one parent task ID')
			const values = parseSchema(CommonValuesSchema, parsed.values, 'task program options')
			const repository = await discoverRepository(resolveCommandCwd(cwd, values.cwd))
			const rollup = await getProgramRollup(
				repository,
				parseSchema(TaskIdSchema, parentId, 'parent task ID'),
			)
			if (values.json) {
				stdout(`${JSON.stringify(rollup, null, 2)}\n`)
			} else {
				stdout(
					`${rollup.parentId}\t${rollup.status}\tchildren=${rollup.children.total}\topen=${rollup.children.openIds.length}\tconcerns=${rollup.relatedOpenConcerns.length}\tcloseoutReady=${rollup.closeoutReady}\t${rollup.title}\n`,
				)
			}
			return 0
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
					...(values.order !== undefined ? { order: values.order } : {}),
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
