System.register(['core/view'], function (exports, module) {
	'use strict';
	var View;
	return {
		setters: [function (module) {
			View = module.default;
		}],
		execute: function () {

			var main = exports('default', View.extend({}));

		}
	};
});
