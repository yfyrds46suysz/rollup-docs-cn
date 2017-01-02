var path = require( 'path' );
var assert = require( 'assert' );

module.exports = {
	description: 'marking an imported, but unexported, identifier should throw',
	error: {
		code: 'MISSING_EXPORT',
		message: `'default' is not exported by empty.js`,
		pos: 7,
		loc: {
			file: path.resolve( __dirname, 'main.js' ),
			line: 1,
			column: 7
		},
		frame: `
			1: import a from './empty.js';
			          ^
			2:
			3: a();
		`,
		url: `https://github.com/rollup/rollup/wiki/Troubleshooting#name-is-not-exported-by-module`
	}
};
