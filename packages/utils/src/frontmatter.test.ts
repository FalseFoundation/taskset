import { describe, expect, it } from 'vitest'
import { FrontmatterError, parseFrontmatter, serializeFrontmatter } from './frontmatter.ts'

describe('parseFrontmatter', () => {
	it('parses YAML and preserves Unicode Markdown while normalizing CRLF', () => {
		const source =
			'---\r\ntitle: Add parsing\r\nlabels:\r\n  - core\r\n---\r\n\r\n# Context\r\n\r\nسلام\r\n'

		expect(parseFrontmatter(source)).toEqual({
			attributes: {
				title: 'Add parsing',
				labels: ['core'],
			},
			body: '# Context\n\nسلام\n',
		})
	})

	it.each([
		['missing opening delimiter', 'title: Missing delimiters\n'],
		['missing closing delimiter', '---\ntitle: Missing close\n'],
		['malformed YAML', '---\ntitle: [broken\n---\n'],
		['duplicate YAML keys', '---\ntitle: First\ntitle: Second\n---\n'],
	])('rejects %s', (_, source) => {
		expect(() => parseFrontmatter(source)).toThrow(FrontmatterError)
	})
})

describe('serializeFrontmatter', () => {
	it('uses stable object order, canonical line endings, and one final newline', () => {
		const serialized = serializeFrontmatter(
			{
				format: 1,
				id: 'TS-01J00000000000000000000000',
				title: 'Add parsing',
				labels: ['core', 'docs'],
				dependsOn: [],
			},
			'# Context\r\n\r\nPreserve this body.\r\n\r\n',
		)

		expect(serialized).toBe(`---
format: 1
id: TS-01J00000000000000000000000
title: Add parsing
labels:
  - core
  - docs
dependsOn: []
---

# Context

Preserve this body.
`)
	})
})
