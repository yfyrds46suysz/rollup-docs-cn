System.register(['./generated-chunk.js'], function (exports, module) {
	'use strict';
	var x$1;
	return {
		setters: [function (module) {
			x$1 = module.x;
		}],
		execute: function () {

			console.log(x, x$1);

		}
	};
});
