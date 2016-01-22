var assert = require( 'assert' );

module.exports = {
	description: 'skips a dead branch (f)',
	code: function ( code ) {
		assert.equal( code.indexOf( 'obj.foo = function' ), -1, code );
	}
}
