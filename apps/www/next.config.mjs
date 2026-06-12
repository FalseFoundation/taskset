import nextra from 'nextra'

const withNextra = nextra({})

export default withNextra({
	reactCompiler: true,
	reactStrictMode: true,
	typedRoutes: false,
	devIndicators: {
		position: 'bottom-right',
	},
	experimental: {
		appNewScrollHandler: true,
		externalDir: true,
		viewTransition: true,
	},
	turbopack: {
		resolveAlias: {
			'next-mdx-import-source-file': './mdx-components.tsx',
		},
	},
})
