import { describe, expect, it } from 'vitest'
import {
	EntityIdSchema,
	isCanonicalEntityId,
	isLegacySequentialEntityId,
	isLegacyUlidEntityId,
	needsEntityIdMigration,
} from './entityId.ts'

describe('entity ID contracts', () => {
	it('accepts canonical short hex IDs and legacy migration forms', () => {
		expect(EntityIdSchema.parse('a1b2c3')).toBe('a1b2c3')
		expect(EntityIdSchema.parse('abc12')).toBe('abc12')
		expect(EntityIdSchema.parse('0000001-short-title')).toBe('0000001-short-title')
		expect(EntityIdSchema.parse('TS-01J00000000000000000000000')).toBe(
			'TS-01J00000000000000000000000',
		)
	})

	it('rejects oversized or malformed IDs', () => {
		expect(EntityIdSchema.safeParse('abcd').success).toBe(false)
		expect(EntityIdSchema.safeParse('abcdef1').success).toBe(false)
		expect(EntityIdSchema.safeParse('A1B2C3').success).toBe(false)
		expect(EntityIdSchema.safeParse('g1b2c3').success).toBe(false)
	})

	it('classifies ID eras for migration', () => {
		expect(isCanonicalEntityId('a1b2c3')).toBe(true)
		expect(needsEntityIdMigration('a1b2c3')).toBe(false)
		expect(isLegacySequentialEntityId('0000001-short-title')).toBe(true)
		expect(isLegacyUlidEntityId('TS-01J00000000000000000000000')).toBe(true)
		expect(needsEntityIdMigration('0000001-short-title')).toBe(true)
	})
})
