import { cpSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(cliRoot, '../..')

for (const name of ['docs', 'skills']) {
	const source = path.join(repoRoot, name)
	const target = path.join(cliRoot, name)
	rmSync(target, { recursive: true, force: true })
	cpSync(source, target, { recursive: true })
}

// Keep offline agent discovery available in the package without putting
// `.txt` files under the Nextra content tree (which breaks the www build).
const packagedAgentsDirectory = path.join(cliRoot, 'docs', 'agents')
mkdirSync(packagedAgentsDirectory, { recursive: true })
cpSync(
	path.join(repoRoot, 'apps/www/public/llms.txt'),
	path.join(packagedAgentsDirectory, 'llms.txt'),
)
