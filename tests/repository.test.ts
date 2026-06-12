import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
	readonly name?: string
	readonly private?: boolean
	readonly publishConfig?: {
		readonly access?: string
	}
	readonly dependencies?: Readonly<Record<string, string>>
	readonly devDependencies?: Readonly<Record<string, string>>
}

const REPO_ROOT = process.cwd()
const WORKSPACE_ROOTS = ['apps', 'packages'] as const
const DOMAIN_PACKAGES = new Set(['contracts', 'core', 'utils'])
const PUBLIC_PACKAGES = new Set(['cli', 'contracts', 'core', 'utils'])
const UI_DEPENDENCY_PATTERN = /^(?:react|react-dom|next|@tanstack\/react-)/

async function readWorkspaceManifests() {
	const manifests: Array<{
		readonly directoryName: string
		readonly manifest: PackageManifest
		readonly relativePath: string
	}> = []

	for (const workspaceRoot of WORKSPACE_ROOTS) {
		const entries = await readdir(path.join(REPO_ROOT, workspaceRoot), {
			withFileTypes: true,
		})

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue
			}

			const relativePath = path.join(workspaceRoot, entry.name, 'package.json')
			const source = await readFile(path.join(REPO_ROOT, relativePath), 'utf8')

			manifests.push({
				directoryName: entry.name,
				manifest: JSON.parse(source) as PackageManifest,
				relativePath,
			})
		}
	}

	return manifests
}

describe('workspace architecture', () => {
	it('keeps package identities aligned with their owning directories', async () => {
		const manifests = await readWorkspaceManifests()
		const names = manifests.map(({ manifest }) => manifest.name)

		expect(new Set(names).size).toBe(names.length)

		for (const { directoryName, manifest, relativePath } of manifests) {
			expect(manifest.name, relativePath).toBe(`@taskset/${directoryName}`)

			if (PUBLIC_PACKAGES.has(directoryName)) {
				expect(manifest.private, relativePath).toBe(false)
				expect(manifest.publishConfig?.access, relativePath).toBe('public')
			} else {
				expect(manifest.private, relativePath).toBe(true)
			}
		}
	})

	it('keeps public package runtime dependencies publishable', async () => {
		const manifests = await readWorkspaceManifests()
		const publicPackageNames = new Set(
			manifests
				.filter(({ directoryName }) => PUBLIC_PACKAGES.has(directoryName))
				.map(({ manifest }) => manifest.name),
		)

		for (const { directoryName, manifest, relativePath } of manifests) {
			if (!PUBLIC_PACKAGES.has(directoryName)) {
				continue
			}

			for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
				if (dependencyName.startsWith('@taskset/')) {
					expect(publicPackageNames, relativePath).toContain(dependencyName)
				}
			}
		}
	})

	it('keeps UI framework dependencies out of domain packages', async () => {
		const manifests = await readWorkspaceManifests()

		for (const { directoryName, manifest, relativePath } of manifests) {
			if (!DOMAIN_PACKAGES.has(directoryName)) {
				continue
			}

			const dependencies = {
				...manifest.dependencies,
				...manifest.devDependencies,
			}

			for (const dependencyName of Object.keys(dependencies)) {
				expect(dependencyName, relativePath).not.toMatch(UI_DEPENDENCY_PATTERN)
			}
		}
	})
})
