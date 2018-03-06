var path = require('path');
var assert = require('assert');

module.exports = {
	description: 'uses a custom external path resolver (synchronous)',
	options: {
		plugins: [
			{
				resolveId: function(id, importer) {
					if (importer && id[0] !== '.') return path.resolve(__dirname, 'js_modules', id + '.js');
				}
			}
		]
	},
	exports: function(exports) {
		assert.ok(exports.success);
	}
};
