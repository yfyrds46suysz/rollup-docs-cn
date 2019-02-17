System.register(['./dep.js'], function (exports, module) {
	'use strict';
	var _missingExportShim, x;
	return {
		setters: [function (module) {
			_missingExportShim = module.missingFn;
			x = module.x;
		}],
		execute: function () {

			_missingExportShim();
			x(_missingExportShim, _missingExportShim);

		}
	};
});
