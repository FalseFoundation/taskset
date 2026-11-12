import { describe, expect, it } from 'vitest'
import { normalizeBodyWhitespaceEscapes } from './bodyWhitespace.ts'

describe('normalizeBodyWhitespaceEscapes', () => {
	it('normalizes literal whitespace escapes in Markdown prose', () => {
		expect(normalizeBodyWhitespaceEscapes('First\\n\\n \\t\\tSecond')).toBe('First\n\n \t\tSecond')
		expect(normalizeBodyWhitespaceEscapes('Windows\\r\\nnext')).toBe('Windows\nnext')
	})

	it('preserves escaped backslashes and Markdown code examples', () => {
		const body = 'Keep `\\n` and `\\t`.\\n\n```ts\nconst newline = "\\n"\n```\n'
		expect(normalizeBodyWhitespaceEscapes(body)).toBe(
			'Keep `\\n` and `\\t`.\n\n```ts\nconst newline = "\\n"\n```\n',
		)
		expect(normalizeBodyWhitespaceEscapes('Keep \\\\n')).toBe('Keep \\\\n')
	})
})
