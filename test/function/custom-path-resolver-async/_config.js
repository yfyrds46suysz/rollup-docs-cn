var path = require( 'path' );
var assert = require( 'assert' );

module.exports = {
	description: 'uses a custom path resolver (asynchronous)',
	options: {
		plugins: [{
			resolveId: function ( importee, importer ) {
				var Promise = require( 'sander' ).Promise;
				var resolved;

				if ( path.normalize(importee) === path.resolve( __dirname, 'main.js' ) ) return importee;

				if ( importee === 'foo' ) {
					resolved = path.resolve( __dirname, 'bar.js' );
				} else {
					resolved = false;
				}

				return Promise.resolve( resolved );
			}
		}]
	},
	warnings: function ( warnings ) {
		assert.deepEqual( warnings, [
			`'path' is imported by main.js, but could not be resolved – treating it as an external dependency. For help see https://github.com/rollup/rollup/wiki/Troubleshooting#treating-module-as-external-dependency`
		]);
	},
	exports: function ( exports ) {
		assert.strictEqual( exports.path, require( 'path' ) );
	}
};
