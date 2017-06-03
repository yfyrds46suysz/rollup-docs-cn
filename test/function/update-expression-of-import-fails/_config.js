var path = require( 'path' );
var assert = require( 'assert' );

module.exports = {
	description: 'disallows updates to imported bindings',
	error: {
		code: 'ILLEGAL_REASSIGNMENT',
		message: `Illegal reassignment to import 'a'`,
		pos: 28,
		loc: {
			file: path.resolve( __dirname, 'main.js' ),
			line: 3,
			column: 0
		},
		frame: `
			1: import { a } from './foo';
			2:
			3: a++;
			   ^
		`
	}
};

// test copied from https://github.com/esnext/es6-module-transpiler/tree/master/test/examples/update-expression-of-import-fails
