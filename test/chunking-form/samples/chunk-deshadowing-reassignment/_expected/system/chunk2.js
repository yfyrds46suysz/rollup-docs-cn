System.register(['./chunk1.js', './chunk3.js'], function (exports, module) {
	'use strict';
	var x, x$1;
	return {
		setters: [function (module) {
			x = module.default;
		}, function (module) {
			x$1 = module.default;
		}],
		execute: function () {

			var x$2 = exports('default', x + 1);

			var y = exports('default$1', x$1 + 1);

		}
	};
});
