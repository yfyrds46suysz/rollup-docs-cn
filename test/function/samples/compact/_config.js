module.exports = {
	description: 'compact output with compact: true',
	options: {
		external: ['external'],
		experimentalDynamicImport: true
	},
	bundleOptions: {
		compact: true,
		namespaceToStringTag: true
	},
	warnings: [
		{
			code: 'CIRCULAR_DEPENDENCY',
			importer: 'main.js',
			message: 'Circular dependency: main.js -> main.js'
		}
	],
	context: {
		require (x) {
			return 42;
		}
	}
};
