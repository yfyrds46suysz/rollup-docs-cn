var path = require( 'path' );
var assert = require( 'assert' );

module.exports = {
	description: 'source paths are relative with relative dest (#344)',
	options: {
		output: {
			name: 'myModule',
			file: path.resolve( __dirname, '_actual/bundle.js' )
		}
	},
	test: function ( code, map ) {
		assert.deepEqual( map.sources, [ '../main.js' ]);
	}
};
