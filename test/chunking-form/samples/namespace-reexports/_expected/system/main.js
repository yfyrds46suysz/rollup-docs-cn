System.register(['./hsl2hsv.js', './generated-chunk.js'], function (exports, module) {
	'use strict';
	var p, lib;
	return {
		setters: [function (module) {
			p = module.p;
		}, function (module) {
			lib = module.a;
		}],
		execute: function () {

			console.log(p);
			var main = exports('default', new Map(Object.entries(lib)));

		}
	};
});
