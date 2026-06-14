import { describe, expect, it } from 'vitest'
import { formatDate, parseDate } from './date.ts'

describe('date utilities', () => {
	it('parses strict UTC dates, timestamps, and the documented legacy form', () => {
		expect(parseDate('2026-06-12')).toBe(Date.UTC(2026, 5, 12))
		expect(parseDate('2026-06-12 01:02 UTC')).toBe(Date.UTC(2026, 5, 12, 1, 2))
		expect(parseDate('2026-06-12T01:02:03.004Z')).toBe(Date.UTC(2026, 5, 12, 1, 2, 3, 4))
	})

	it('rejects invalid dates and local or ambiguous formats', () => {
		expect(parseDate('2026-02-30')).toBeUndefined()
		expect(parseDate('2026-06-12T01:02:03Z')).toBeUndefined()
		expect(parseDate('June 12, 2026')).toBeUndefined()
	})

	it('formats deterministic UTC values', () => {
		const date = new Date('2026-06-12T01:02:03.004Z')
		expect(formatDate(date)).toBe('2026-06-12 01:02 UTC')
		expect(formatDate(date, { includeTime: false })).toBe('2026-06-12')
		expect(() => formatDate(new Date(Number.NaN))).toThrow(RangeError)
	})
})
