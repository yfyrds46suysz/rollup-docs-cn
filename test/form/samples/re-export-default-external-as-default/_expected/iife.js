var reexportsDefaultExternalAsDefault = (function (exports, external) {
	'use strict';

	var external__default = 'default' in external ? external['default'] : external;



	Object.keys(external).forEach(function (key) {
		Object.defineProperty(exports, key, {
			enumerable: true,
			get: function () {
				return external[key];
			}
		});
	});
	exports.default = external__default;

	return exports;

}({}, external));
