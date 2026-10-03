import type { EvaluateResult } from 'nextra'

type PostMetadata = EvaluateResult['metadata'] & {
	readonly author?: string
	readonly date: string
	readonly description: string
	readonly title: string
}

type PostModule = Omit<EvaluateResult, 'metadata'> & {
	readonly metadata: PostMetadata
}

interface PostDefinition {
	readonly slug: string
	readonly load: () => Promise<PostModule>
}

export interface Post extends PostModule {
	readonly route: string
	readonly slug: string
}

const postDefinitions: readonly PostDefinition[] = [
	{
		slug: 'taskset-cli-on-npm',
		load: async () => (await import('../../posts/taskset-cli-on-npm.md')) as unknown as PostModule,
	},
	{
		slug: 'beyond-tasks-documents-and-sync',
		load: async () =>
			(await import('../../posts/beyond-tasks-documents-and-sync.md')) as unknown as PostModule,
	},
	{
		slug: 'skills-and-docs-ship-with-the-cli',
		load: async () =>
			(await import('../../posts/skills-and-docs-ship-with-the-cli.md')) as unknown as PostModule,
	},
	{
		slug: 'short-hex-entity-ids',
		load: async () =>
			(await import('../../posts/short-hex-entity-ids.md')) as unknown as PostModule,
	},
	{
		slug: 'taskset-stable-global-release',
		load: async () =>
			(await import('../../posts/taskset-stable-global-release.md')) as unknown as PostModule,
	},
	{
		slug: 'operational-memory',
		load: async () => (await import('../../posts/operational-memory.md')) as unknown as PostModule,
	},
]

async function loadPost(definition: PostDefinition): Promise<Post> {
	return {
		...(await definition.load()),
		route: `/posts/${definition.slug}`,
		slug: definition.slug,
	}
}

export function getPostSlugs(): string[] {
	return postDefinitions.map(({ slug }) => slug)
}

export async function getPost(slug: string): Promise<Post | undefined> {
	const definition = postDefinitions.find((post) => post.slug === slug)

	return definition ? loadPost(definition) : undefined
}

export async function getPosts(): Promise<Post[]> {
	const posts = await Promise.all(postDefinitions.map(loadPost))

	return posts.sort(
		(left, right) =>
			new Date(right.metadata.date).getTime() - new Date(left.metadata.date).getTime(),
	)
}
