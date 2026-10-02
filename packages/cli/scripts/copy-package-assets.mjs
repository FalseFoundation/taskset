import { cpSync, rmSync } from 'node:fs'
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
