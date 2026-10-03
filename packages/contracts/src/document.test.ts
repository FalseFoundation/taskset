import { describe, expect, it } from 'vitest'
import { DOCUMENT_KINDS, DocumentFileSchema, DocumentMetadataSchema } from './document.ts'

describe('document contracts', () => {
	it('supports every canonical durable document kind', () => {
		for (const type of DOCUMENT_KINDS) {
			expect(
				DocumentMetadataSchema.parse({
					id: 'a1b2c3',
					type,
					title: 'Example document',
					status: type === 'decision' ? 'accepted' : 'draft',
					createdAt: '2026-09-28',
					updatedAt: '2026-09-28',
				}).type,
			).toBe(type)
		}
	})

	it('keeps authored Markdown separate from strict metadata', () => {
		expect(
			DocumentFileSchema.parse({
				metadata: {
					id: 'd4e5f6',
					type: 'flow',
					title: 'Sign in',
					status: 'ready',
					createdAt: '2026-09-28',
					updatedAt: '2026-09-28',
				},
				body: '# Sign in\n',
			}).body,
		).toBe('# Sign in\n')
	})
})
