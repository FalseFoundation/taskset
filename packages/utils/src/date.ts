const LEGACY_ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/u
const UTC_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?: ([01]\d|2[0-3]):([0-5]\d) UTC)?$/u

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

/**
 * Parses Taskset's strict human-readable UTC date formats and the documented
 * legacy ISO-8601 UTC form. It returns `undefined` instead of coercing invalid
 * calendar dates or local-time values.
 */
export function parseDate(value: string): number | undefined {
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

	const match = UTC_DATE_PATTERN.exec(value)

	if (!match) {
		return undefined
	}

	const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match
	return utcTimestamp(
		Number(yearValue),
		Number(monthValue),
		Number(dayValue),
		hourValue === undefined ? 0 : Number(hourValue),
		minuteValue === undefined ? 0 : Number(minuteValue),
	)
}

/**
 * Formats a valid `Date` as a deterministic UTC date or minute-precision UTC
 * timestamp suitable for persisted Taskset metadata.
 */
export function formatDate(date: Date, options: { readonly includeTime?: boolean } = {}): string {
	const timestamp = date.getTime()

	if (!Number.isFinite(timestamp)) {
		throw new RangeError('Date formatting requires a valid Date')
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
