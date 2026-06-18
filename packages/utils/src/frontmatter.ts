import { parseDocument, stringify } from 'yaml'

export type FrontmatterErrorCode = 'delimiter' | 'yaml'

export class FrontmatterError extends Error {
	readonly code: FrontmatterErrorCode

	constructor(code: FrontmatterErrorCode, message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'FrontmatterError'
		this.code = code
	}
}

export interface ParsedFrontmatter {
	readonly attributes: unknown
	readonly body: string
}

function normalizeLineEndings(value: string): string {
	return value.replace(/\r\n?/gu, '\n')
}

/**
 * Parses strict YAML 1.2 frontmatter, rejects duplicate keys and aliases, and
 * preserves the normalized Markdown body separately from untrusted attributes.
 */
export function parseFrontmatter(source: string): ParsedFrontmatter {
	const normalizedSource = normalizeLineEndings(source).replace(/^\uFEFF/u, '')
	const lines = normalizedSource.split('\n')

	if (lines[0] !== '---') {
		throw new FrontmatterError(
			'delimiter',
			'Expected the file to start with a YAML frontmatter delimiter (---)',
		)
	}

	const closingDelimiterIndex = lines.findIndex((line, index) => index > 0 && line === '---')

	if (closingDelimiterIndex === -1) {
		throw new FrontmatterError('delimiter', 'Expected a closing YAML frontmatter delimiter (---)')
	}

	const yamlSource = lines.slice(1, closingDelimiterIndex).join('\n')
	const rawBody = lines.slice(closingDelimiterIndex + 1).join('\n')
	const body = rawBody.startsWith('\n') ? rawBody.slice(1) : rawBody

	try {
		const document = parseDocument(yamlSource, {
			prettyErrors: true,
			schema: 'core',
			strict: true,
			uniqueKeys: true,
			version: '1.2',
		})

		if (document.errors.length > 0) {
			throw document.errors[0]
		}

		return {
			attributes: document.toJS({ maxAliasCount: 0 }) as unknown,
			body,
		}
	} catch (error) {
		const detail = error instanceof Error ? error.message : 'Unknown YAML parsing error'

		throw new FrontmatterError('yaml', `Invalid YAML frontmatter: ${detail}`, { cause: error })
	}
}

/**
 * Serializes caller-ordered attributes and a normalized Markdown body with LF
 * endings and exactly one final newline.
 */
export function serializeFrontmatter(
	attributes: Readonly<Record<string, unknown>>,
	body: string,
): string {
	const yamlSource = stringify(attributes, {
		indent: 2,
		lineWidth: 0,
		schema: 'core',
		sortMapEntries: false,
	})
	const normalizedBody = normalizeLineEndings(body).replace(/\n+$/gu, '')

	if (normalizedBody.length === 0) {
		return `---\n${yamlSource}---\n`
	}

	return `---\n${yamlSource}---\n\n${normalizedBody}\n`
}
