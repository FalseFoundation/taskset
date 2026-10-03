import type { ConcernClass, DocumentMetadata, TaskMetadata } from '@taskset/contracts'
import type { ResolvedTaxonomyConfig } from '../config/config.ts'

export interface TaxonomyViolation {
	readonly field: string
	readonly value: string
	readonly message: string
}

function allowlistViolations(
	field: string,
	values: readonly string[] | undefined,
	allowlist: readonly string[] | undefined,
): TaxonomyViolation[] {
	if (!allowlist || allowlist.length === 0 || !values || values.length === 0) {
		return []
	}

	const allowed = new Set(allowlist)
	return values
		.filter((value) => !allowed.has(value))
		.map((value) => ({
			field,
			value,
			message: `Unknown ${field} value "${value}" is not in the configured allowlist`,
		}))
}

/** Collect taxonomy allowlist violations for task or document planning metadata. */
export function collectTaxonomyViolations(
	taxonomy: ResolvedTaxonomyConfig,
	metadata: {
		readonly labels?: readonly string[]
		readonly projects?: readonly string[]
		readonly class?: ConcernClass
	},
): readonly TaxonomyViolation[] {
	return [
		...allowlistViolations('label', metadata.labels, taxonomy.labels),
		...allowlistViolations('project', metadata.projects, taxonomy.projects),
		...allowlistViolations(
			'class',
			metadata.class ? [metadata.class] : undefined,
			taxonomy.concernClasses,
		),
	]
}

export function taxonomyFromTask(metadata: TaskMetadata): {
	readonly labels?: readonly string[]
	readonly projects?: readonly string[]
} {
	return {
		...(metadata.labels ? { labels: metadata.labels } : {}),
		...(metadata.projects ? { projects: metadata.projects } : {}),
	}
}

export function taxonomyFromDocument(metadata: DocumentMetadata): {
	readonly labels?: readonly string[]
	readonly projects?: readonly string[]
	readonly class?: ConcernClass
} {
	return {
		...(metadata.labels ? { labels: metadata.labels } : {}),
		...(metadata.projects ? { projects: metadata.projects } : {}),
		...(metadata.class ? { class: metadata.class } : {}),
	}
}
