import type { DocumentKind } from '@taskset/contracts'

const REQUIRED_HEADINGS: Readonly<Partial<Record<DocumentKind, readonly string[]>>> = Object.freeze(
	{
		story: Object.freeze(['User story', 'Context', 'Acceptance criteria', 'Out of scope', 'Notes']),
		flow: Object.freeze([
			'Goal',
			'Preconditions',
			'User flow',
			'Failure variants',
			'Acceptance checks',
			'Related stories',
		]),
		decision: Object.freeze([
			'Context',
			'Decision',
			'Alternatives',
			'Consequences',
			'Migration',
			'Status',
		]),
		research: Object.freeze([
			'Question',
			'Sources',
			'Findings',
			'Recommendation',
			'Open questions',
		]),
		runbook: Object.freeze([
			'Purpose',
			'Preconditions',
			'Symptoms',
			'Checks',
			'Actions',
			'Rollback',
			'Escalation',
			'Verification',
		]),
		lesson: Object.freeze([
			'Trigger / symptom',
			'Incorrect pattern',
			'Correct pattern',
			'Blast radius / severity',
			'Prevention',
			'Evidence',
		]),
		concern: Object.freeze([
			'Summary',
			'Class',
			'Trust boundary / plane',
			'Current evidence',
			'Residual risk',
			'Mitigation plan / acceptance rationale',
			'Review cadence',
		]),
		audit: Object.freeze([
			'Scope',
			'Method',
			'Findings',
			'Residual items',
			'Required follow-ups',
			'Next due date',
		]),
	},
)

function normalizeHeading(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/gu, ' ')
}

/** Required `##` headings for kinds that enforce template shape. */
export function requiredDocumentHeadings(type: DocumentKind): readonly string[] {
	return REQUIRED_HEADINGS[type] ?? []
}

/** Extract level-2 Markdown headings from a document body. */
export function extractDocumentHeadings(body: string): readonly string[] {
	const headings: string[] = []
	for (const line of body.split(/\r?\n/u)) {
		const match = /^##\s+(.+)$/u.exec(line)
		if (match?.[1]) {
			headings.push(match[1].trim())
		}
	}
	return headings
}

/**
 * Returns missing required headings for kinds that define a template contract.
 * Other kinds always return an empty list.
 */
export function missingDocumentHeadings(type: DocumentKind, body: string): readonly string[] {
	const required = requiredDocumentHeadings(type)
	if (required.length === 0) {
		return []
	}

	const present = new Set(extractDocumentHeadings(body).map(normalizeHeading))
	return required.filter((heading) => !present.has(normalizeHeading(heading)))
}
