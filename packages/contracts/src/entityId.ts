import * as z from 'zod'

/** Canonical immutable Taskset entity IDs are lowercase hex, 5-6 characters. */
export const CANONICAL_ENTITY_ID_PATTERN = /^[0-9a-f]{5,6}$/u
/** Legacy sequential title-derived IDs used before short hex IDs. */
export const LEGACY_SEQUENTIAL_ENTITY_ID_PATTERN = /^\d{7}-[a-z0-9]+(?:-[a-z0-9]+)*$/u
/** Legacy Taskset 3 ULID IDs. */
export const LEGACY_ULID_ENTITY_ID_PATTERN = /^TS-[0-9A-HJKMNP-TV-Z]{26}$/u

const ENTITY_ID_PATTERN =
	/^(?:[0-9a-f]{5,6}|\d{7}-[a-z0-9]+(?:-[a-z0-9]+)*|TS-[0-9A-HJKMNP-TV-Z]{26})$/u

export function isCanonicalEntityId(id: string): boolean {
	return CANONICAL_ENTITY_ID_PATTERN.test(id)
}

export function isLegacySequentialEntityId(id: string): boolean {
	return LEGACY_SEQUENTIAL_ENTITY_ID_PATTERN.test(id)
}

export function isLegacyUlidEntityId(id: string): boolean {
	return LEGACY_ULID_ENTITY_ID_PATTERN.test(id)
}

export function needsEntityIdMigration(id: string): boolean {
	return !isCanonicalEntityId(id)
}

/**
 * Strict immutable ID contract shared by tasks and documents. New IDs are
 * 5-6 character lowercase hex. Legacy sequential and `TS-` ULID forms remain
 * readable so repository sync can rewrite them atomically.
 */
export const EntityIdSchema = z
	.string()
	.regex(
		ENTITY_ID_PATTERN,
		'Expected a 5-6 character lowercase hex id (legacy sequential and TS-ULID ids are accepted for migration)',
	)
