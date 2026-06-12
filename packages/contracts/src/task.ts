import * as z from 'zod'

export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done', 'canceled'] as const
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export interface TaskMetadata {
	readonly schemaVersion: 1
	readonly id: string
	readonly title: string
	readonly status: TaskStatus
	readonly priority?: TaskPriority
	readonly createdAt: string
	readonly updatedAt: string
	readonly labels?: readonly string[]
	readonly dependsOn?: readonly string[]
	readonly files?: readonly string[]
}

export interface TaskFile {
	readonly metadata: TaskMetadata
	readonly body: string
}

const TaskIdSchema = z
	.string()
	.regex(
		/^TS-[0-9A-HJKMNP-TV-Z]{26}$/u,
		'Expected a task ID in the form TS- followed by a 26-character ULID',
	)

const LEGACY_ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/u
const TASK_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?: ([01]\d|2[0-3]):([0-5]\d) UTC)?$/u

function utcTimestamp(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second = 0,
	millisecond = 0,
): number | undefined {
	const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
	const date = new Date(timestamp)

	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day ||
		date.getUTCHours() !== hour ||
		date.getUTCMinutes() !== minute ||
		date.getUTCSeconds() !== second ||
		date.getUTCMilliseconds() !== millisecond
	) {
		return undefined
	}

	return timestamp
}

export function parseTaskTimestamp(value: string): number | undefined {
	const legacyMatch = LEGACY_ISO_TIMESTAMP_PATTERN.exec(value)

	if (legacyMatch) {
		const [, year, month, day, hour, minute, second, millisecond] = legacyMatch
		return utcTimestamp(
			Number(year),
			Number(month),
			Number(day),
			Number(hour),
			Number(minute),
			Number(second),
			Number(millisecond),
		)
	}

	const match = TASK_TIMESTAMP_PATTERN.exec(value)

	if (!match) {
		return undefined
	}

	const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match
	const year = Number(yearValue)
	const month = Number(monthValue)
	const day = Number(dayValue)
	const hour = hourValue === undefined ? 0 : Number(hourValue)
	const minute = minuteValue === undefined ? 0 : Number(minuteValue)
	return utcTimestamp(year, month, day, hour, minute)
}

export function formatTaskTimestamp(
	date: Date,
	options: { readonly includeTime?: boolean } = {},
): string {
	const timestamp = date.getTime()

	if (!Number.isFinite(timestamp)) {
		throw new RangeError('Task timestamps require a valid Date')
	}

	const year = date.getUTCFullYear()
	const month = (date.getUTCMonth() + 1).toString().padStart(2, '0')
	const day = date.getUTCDate().toString().padStart(2, '0')

	if (options.includeTime === false) {
		return `${year}-${month}-${day}`
	}

	const hour = date.getUTCHours().toString().padStart(2, '0')
	const minute = date.getUTCMinutes().toString().padStart(2, '0')

	return `${year}-${month}-${day} ${hour}:${minute} UTC`
}

const TaskTimestampSchema = z
	.string()
	.refine(
		(value) => parseTaskTimestamp(value) !== undefined,
		'Expected a UTC timestamp as YYYY-MM-DD or YYYY-MM-DD HH:mm UTC',
	)

export const TaskMetadataSchema = z.strictObject({
	schemaVersion: z.literal(1),
	id: TaskIdSchema,
	title: z
		.string()
		.min(1, 'Title must not be empty')
		.refine((title) => title === title.trim(), 'Title must not have surrounding whitespace'),
	status: z.enum(TASK_STATUSES),
	priority: z.enum(TASK_PRIORITIES).optional(),
	createdAt: TaskTimestampSchema,
	updatedAt: TaskTimestampSchema,
	labels: z.array(z.string().min(1, 'Labels must not be empty')).optional(),
	dependsOn: z.array(TaskIdSchema).optional(),
	files: z.array(z.string().min(1, 'File paths must not be empty')).optional(),
}) satisfies z.ZodType<TaskMetadata>

export const TaskFileSchema = z.strictObject({
	metadata: TaskMetadataSchema,
	body: z.string(),
}) satisfies z.ZodType<TaskFile>
