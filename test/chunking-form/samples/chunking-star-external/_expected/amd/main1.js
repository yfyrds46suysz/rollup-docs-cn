define(['exports', 'starexternal1', 'external1', 'starexternal2', 'external2', './generated-chunk.js'], function (exports, starexternal1, external1, starexternal2, external2, __chunk_1) { 'use strict';

	var main = '1';

	Object.keys(starexternal1).forEach(function (key) {
		Object.defineProperty(exports, key, {
			enumerable: true,
			get: function () {
				return starexternal1[key];
			}
		});
	});
	Object.defineProperty(exports, 'e', {
		enumerable: true,
		get: function () {
			return external1.e;
		}
	});
	exports.dep = __chunk_1.dep;
	exports.main = main;

	Object.defineProperty(exports, '__esModule', { value: true });

});
