var assert = require( 'assert' );

module.exports = {
	description: 'should delete use asm from function body if it\'s not first expression',
	code: function ( code ) {
		console.log(code);
		assert.equal( code.indexOf('use asm'), -1 );
	},
};