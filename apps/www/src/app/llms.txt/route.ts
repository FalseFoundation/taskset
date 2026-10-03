import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-static'

export async function GET() {
	const contents = await readFile(path.join(process.cwd(), '../../docs/agents/llms.txt'), 'utf8')

	return new Response(contents, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
		},
	})
}
