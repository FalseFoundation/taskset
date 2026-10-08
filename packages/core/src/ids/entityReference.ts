import path from 'node:path'

export interface EntityReferenceTarget {
	readonly id: string
	readonly relativePath: string
	readonly title: string
	readonly kind: string
	readonly status: string
	readonly aliases?: readonly string[]
}

export type EntityReferenceErrorCode = 'missing' | 'ambiguous'

export class EntityReferenceError extends Error {
	readonly code: EntityReferenceErrorCode
	readonly reference: string
	readonly candidates: readonly EntityReferenceTarget[]

	constructor(
		code: EntityReferenceErrorCode,
		reference: string,
		candidates: readonly EntityReferenceTarget[] = [],
	) {
		const detail =
			code === 'ambiguous'
				? `; candidates: ${candidates.map((candidate) => candidate.relativePath).join(', ')}`
				: ''
		super(`Entity reference "${reference}" is ${code}${detail}`)
		this.name = 'EntityReferenceError'
		this.code = code
		this.reference = reference
		this.candidates = Object.freeze([...candidates])
	}
}

function normalizedReference(reference: string): string {
	return reference.startsWith('./') ? reference.slice(2) : reference
}

function aliasesFor(target: EntityReferenceTarget): readonly string[] {
	const basename = path.posix.basename(target.relativePath)
	const stem = basename.endsWith('.md') ? basename.slice(0, -3) : basename
	const sequence = /^(\d{7})-/u.exec(basename)?.[1]
	return [
		target.id,
		target.relativePath,
		basename,
		stem,
		...(sequence ? [sequence] : []),
		...(target.aliases ?? []),
	].map(normalizedReference)
}

/** Resolves all supported human and compatibility reference forms deterministically. */
export class EntityReferenceIndex {
	readonly targets: readonly EntityReferenceTarget[]
	readonly #byAlias = new Map<string, EntityReferenceTarget[]>()

	constructor(targets: readonly EntityReferenceTarget[]) {
		this.targets = Object.freeze(
			[...targets].sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
		)
		for (const target of this.targets) {
			for (const alias of new Set(aliasesFor(target))) {
				const candidates = this.#byAlias.get(alias) ?? []
				candidates.push(target)
				this.#byAlias.set(alias, candidates)
			}
		}
	}

	find(reference: string): readonly EntityReferenceTarget[] {
		return Object.freeze([...(this.#byAlias.get(normalizedReference(reference)) ?? [])])
	}

	resolve(reference: string): EntityReferenceTarget {
		const candidates = this.find(reference)
		if (candidates.length === 0) throw new EntityReferenceError('missing', reference)
		if (candidates.length > 1) throw new EntityReferenceError('ambiguous', reference, candidates)
		return candidates[0] as EntityReferenceTarget
	}

	resolveId(reference: string): string {
		return this.resolve(reference).id
	}

	pathForId(id: string): string | undefined {
		const candidates = this.find(id)
		return candidates.length === 1 ? candidates[0]?.relativePath : undefined
	}
}

/** Extracts an immutable ID from a canonical filename/path without repository I/O. */
export function entityIdFromCanonicalReference(reference: string): string | undefined {
	return /-([0-9a-f]{5,6})\.md$/u.exec(reference)?.[1]
}

/** Resolves known aliases, then falls back to the ID embedded in a canonical filename. */
export function normalizeEntityReference(reference: string, index?: EntityReferenceIndex): string {
	const candidates = index?.find(reference) ?? []
	if (candidates.length > 1) throw new EntityReferenceError('ambiguous', reference, candidates)
	return candidates[0]?.id ?? entityIdFromCanonicalReference(reference) ?? reference
}
