import { randomBytes } from 'node:crypto'
import {
	isCanonicalEntityId,
	isLegacySequentialEntityId,
	needsEntityIdMigration,
} from '@taskset/contracts'
import { parseDate } from '@taskset/utils'

export const ENTITY_ID_LENGTH = 6
const SEQUENCE_PREFIX_PATTERN = /^(\d{7})-/u
const CANONICAL_FILE_NAME_PATTERN = /^(\d{7})-([a-z0-9]+(?:-[a-z0-9]+)*)-([0-9a-f]{5,6})\.md$/u

export interface EntityFileNameParts {
	readonly sequence: number
	readonly slug: string
	readonly id: string
}

/** Generates a collision-checked lowercase hex entity ID. */
export function generateEntityId(
	existingIds: Iterable<string> = [],
	randomSource: (size: number) => Uint8Array = randomBytes,
	length = ENTITY_ID_LENGTH,
): string {
	if (!Number.isInteger(length) || length < 5 || length > 6) {
		throw new RangeError('Entity ID length must be 5 or 6')
	}
	const occupied = new Set(existingIds)
	for (let attempt = 0; attempt < 64; attempt += 1) {
		const bytes = randomSource(Math.ceil(length / 2))
		if (bytes.length < Math.ceil(length / 2)) {
			throw new RangeError('Entity ID random source returned too few bytes')
		}
		const id = Buffer.from(bytes).toString('hex').slice(0, length)
		if (isCanonicalEntityId(id) && !occupied.has(id)) {
			return id
		}
	}
	throw new RangeError('Unable to allocate a unique entity ID')
}

export function slugifyTitle(title: string): string {
	const slug = title
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-|-$/gu, '')
		.slice(0, 72)
		.replace(/-$/u, '')
	return slug || 'untitled'
}

export function formatSequence(sequence: number): string {
	if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9_999_999) {
		throw new RangeError('Entity sequence must be an integer from 1 through 9999999')
	}
	return String(sequence).padStart(7, '0')
}

/** Builds the canonical `{sequence}-{slug}-{id}.md` filename. */
export function buildEntityFileName(sequence: number, title: string, id: string): string {
	if (!isCanonicalEntityId(id)) {
		throw new RangeError(`Canonical filenames require a short hex id, received ${id}`)
	}
	return `${formatSequence(sequence)}-${slugifyTitle(title)}-${id}.md`
}

/**
 * Resolves the on-disk filename for an entity. Canonical short IDs use the
 * sequenced slug form; legacy IDs keep the historical `{id}.md` stem.
 */
export function resolveEntityFileName(options: {
	readonly id: string
	readonly title: string
	readonly sequence: number
}): string {
	if (isCanonicalEntityId(options.id)) {
		return buildEntityFileName(options.sequence, options.title, options.id)
	}
	return `${options.id}.md`
}

export function parseEntityFileName(fileName: string): EntityFileNameParts | undefined {
	const match = CANONICAL_FILE_NAME_PATTERN.exec(fileName)
	if (!match) return undefined
	return Object.freeze({
		sequence: Number(match[1]),
		slug: match[2] as string,
		id: match[3] as string,
	})
}

export function extractSequenceFromFileName(fileName: string): number | undefined {
	const canonical = parseEntityFileName(fileName)
	if (canonical) return canonical.sequence
	const match = SEQUENCE_PREFIX_PATTERN.exec(fileName)
	return match ? Number(match[1]) : undefined
}

export function extractSequenceFromEntityId(id: string): number | undefined {
	if (!isLegacySequentialEntityId(id)) return undefined
	return Number(id.slice(0, 7))
}

export function nextEntitySequence(fileNames: Iterable<string>): number {
	let maximum = 0
	for (const fileName of fileNames) {
		const sequence = extractSequenceFromFileName(fileName)
		if (sequence !== undefined) maximum = Math.max(maximum, sequence)
	}
	return maximum + 1
}

export function assertEntityFileNameMatchesId(fileName: string, id: string): void {
	const base = fileName.endsWith('.md') ? fileName : `${fileName}.md`
	if (isCanonicalEntityId(id)) {
		const parsed = parseEntityFileName(base)
		if (!parsed || parsed.id !== id) {
			throw new RangeError(`Filename ${base} must end with -${id}.md for canonical entity id ${id}`)
		}
		return
	}
	if (base !== `${id}.md`) {
		throw new RangeError(`Filename ${base} must match legacy entity id ${id}`)
	}
}

export function compareCreatedAtThenId(
	left: { readonly createdAt: string; readonly id: string },
	right: { readonly createdAt: string; readonly id: string },
): number {
	return (
		(parseDate(left.createdAt) ?? 0) - (parseDate(right.createdAt) ?? 0) ||
		left.id.localeCompare(right.id)
	)
}

/**
 * Assigns display sequences for one collection. Duplicate prefixes keep the
 * earliest `createdAt` (then ID) and later collisions take the next free
 * numbers after the current maximum.
 */
export function planEntitySequences<T>(
	items: readonly T[],
	options: {
		readonly idFor: (item: T) => string
		readonly createdAtFor: (item: T) => string
		readonly fileNameFor: (item: T) => string
		readonly legacyIdFor?: (item: T) => string
	},
): Map<string, number> {
	const planned = new Map<string, number>()
	const bySequence = new Map<number, T[]>()
	let maximum = 0

	for (const item of items) {
		const sequence =
			extractSequenceFromFileName(options.fileNameFor(item)) ??
			extractSequenceFromEntityId(options.legacyIdFor?.(item) ?? '') ??
			0
		if (sequence > 0) {
			maximum = Math.max(maximum, sequence)
			const group = bySequence.get(sequence) ?? []
			group.push(item)
			bySequence.set(sequence, group)
		}
	}

	const unsequenced = items
		.filter((item) => {
			const fileName = options.fileNameFor(item)
			const legacyId = options.legacyIdFor?.(item) ?? ''
			return (
				extractSequenceFromFileName(fileName) === undefined &&
				extractSequenceFromEntityId(legacyId) === undefined
			)
		})
		.sort((left, right) =>
			compareCreatedAtThenId(
				{ createdAt: options.createdAtFor(left), id: options.idFor(left) },
				{ createdAt: options.createdAtFor(right), id: options.idFor(right) },
			),
		)

	for (const [sequence, group] of [...bySequence.entries()].sort(
		(left, right) => left[0] - right[0],
	)) {
		const ordered = [...group].sort((left, right) =>
			compareCreatedAtThenId(
				{ createdAt: options.createdAtFor(left), id: options.idFor(left) },
				{ createdAt: options.createdAtFor(right), id: options.idFor(right) },
			),
		)
		const keeper = ordered[0]
		if (!keeper) continue
		planned.set(options.idFor(keeper), sequence)
		for (const duplicate of ordered.slice(1)) {
			maximum += 1
			planned.set(options.idFor(duplicate), maximum)
		}
	}

	for (const item of unsequenced) {
		maximum += 1
		planned.set(options.idFor(item), maximum)
	}

	return planned
}

export { isCanonicalEntityId, needsEntityIdMigration }
