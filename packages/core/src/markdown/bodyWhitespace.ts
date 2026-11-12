const LITERAL_WHITESPACE_ESCAPE = /(?<!\\)\\(r\\n|n|t)/gu
const FENCE_START = /^ {0,3}(`{3,}|~{3,})/u

function normalizeProse(value: string): string {
	return value.replace(LITERAL_WHITESPACE_ESCAPE, (_match, sequence: string) =>
		sequence === 't' ? '\t' : '\n',
	)
}

/**
 * Converts accidental shell-style whitespace escapes in Markdown prose while
 * preserving intentional examples inside inline and fenced code.
 */
export function normalizeBodyWhitespaceEscapes(body: string): string {
	let fence: { readonly character: string; readonly length: number } | undefined
	let inlineDelimiter: string | undefined
	let normalized = ''

	for (const lineWithEnding of body.match(/[^\n]*\n|[^\n]+$/gu) ?? []) {
		const line = lineWithEnding.endsWith('\n') ? lineWithEnding.slice(0, -1) : lineWithEnding
		const ending = lineWithEnding.endsWith('\n') ? '\n' : ''
		const fenceMatch = FENCE_START.exec(line)

		if (fence) {
			normalized += lineWithEnding
			if (fenceMatch?.[1]?.startsWith(fence.character) && fenceMatch[1].length >= fence.length) {
				fence = undefined
			}
			continue
		}

		if (!inlineDelimiter && fenceMatch?.[1]) {
			fence = {
				character: fenceMatch[1][0] as string,
				length: fenceMatch[1].length,
			}
			normalized += lineWithEnding
			continue
		}

		let cursor = 0
		let rendered = ''
		for (const match of line.matchAll(/`+/gu)) {
			const delimiter = match[0]
			const index = match.index
			const segment = line.slice(cursor, index)
			rendered += inlineDelimiter ? segment : normalizeProse(segment)
			rendered += delimiter
			if (!inlineDelimiter) inlineDelimiter = delimiter
			else if (inlineDelimiter === delimiter) inlineDelimiter = undefined
			cursor = index + delimiter.length
		}
		const remainder = line.slice(cursor)
		rendered += inlineDelimiter ? remainder : normalizeProse(remainder)
		normalized += rendered + ending
	}

	return normalized
}
