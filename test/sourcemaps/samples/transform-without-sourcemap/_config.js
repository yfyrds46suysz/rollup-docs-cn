module.exports = {
	description: 'preserves sourcemap chains when transforming',
	options: {
		plugins: [
			{
				name: 'fake plugin',
				transform: function ( code ) {
					return code;
				}
			}
		]
	},
	warnings: [
		{
			code: `SOURCEMAP_BROKEN`,
			plugin: 'fake plugin',
			message: `Sourcemap is likely to be incorrect: a plugin ('fake plugin') was used to transform files, but didn't generate a sourcemap for the transformation. Consult the plugin documentation for help`,
			url: `https://github.com/rollup/rollup/wiki/Troubleshooting#sourcemap-is-likely-to-be-incorrect`
		}
	]
};
