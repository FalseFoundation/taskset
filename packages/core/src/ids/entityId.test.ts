import { describe, expect, it } from 'vitest'
import {
	buildEntityFileName,
	generateEntityId,
	parseEntityFileName,
	planEntitySequences,
	resolveEntityFileName,
} from './entityId.ts'

describe('entity ID helpers', () => {
	it('generates unique short hex IDs', () => {
		const first = generateEntityId()
		const second = generateEntityId([first])
		expect(first).toMatch(/^[0-9a-f]{6}$/u)
		expect(second).toMatch(/^[0-9a-f]{6}$/u)
		expect(second).not.toBe(first)
	})

	it('builds and parses sequenced filenames', () => {
		const fileName = buildEntityFileName(1, 'Sign in via SSO', 'a1b2c3')
		expect(fileName).toBe('0000001-sign-in-via-sso-a1b2c3.md')
		expect(parseEntityFileName(fileName)).toEqual({
			sequence: 1,
			slug: 'sign-in-via-sso',
			id: 'a1b2c3',
		})
		expect(
			resolveEntityFileName({ id: 'TS-01J00000000000000000000000', title: 'Legacy', sequence: 1 }),
		).toBe('TS-01J00000000000000000000000.md')
	})

	it('repairs duplicate sequences by createdAt then id', () => {
		const planned = planEntitySequences(
			[
				{ id: 'bbbbbb', createdAt: '2026-06-13', fileName: '0000001-newer-bbbbbb.md' },
				{ id: 'aaaaaa', createdAt: '2026-06-12', fileName: '0000001-older-aaaaaa.md' },
			],
			{
				idFor: (item) => item.id,
				createdAtFor: (item) => item.createdAt,
				fileNameFor: (item) => item.fileName,
			},
		)
		expect(planned.get('aaaaaa')).toBe(1)
		expect(planned.get('bbbbbb')).toBe(2)
	})
})
