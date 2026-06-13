import type { Metadata } from 'next'
import { PostCard } from 'nextra-theme-blog'
import { getPosts } from '../../../blog/posts.ts'

export const metadata: Metadata = {
	title: 'Taskset Blog',
	description: 'Taskset release notes, project updates, and technical stories.',
}

export default async function PostsPage() {
	const posts = await getPosts()

	return (
		<div data-pagefind-ignore='all'>
			<h1>Taskset Blog</h1>
			<p>Release notes, project updates, and the decisions behind Taskset.</p>
			{posts.map((post) => (
				<PostCard
					key={post.route}
					post={{
						route: post.route,
						frontMatter: {
							date: post.metadata.date,
							description: post.metadata.description,
							title: post.metadata.title,
						},
					}}
				/>
			))}
		</div>
	)
}
