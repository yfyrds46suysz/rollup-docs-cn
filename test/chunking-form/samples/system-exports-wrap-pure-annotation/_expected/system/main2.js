System.register(['./chunk-2ccc88aa.js'], function (exports, module) {
	'use strict';
	var dep;
	return {
		setters: [function (module) {
			dep = module.a;
		}],
		execute: function () {

			console.log('2', dep);

		}
	};
});
