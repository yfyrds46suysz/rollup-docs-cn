System.register([], function (exports, module) {
	'use strict';
	return {
		execute: function () {

			const x = exports('a', 1);
			console.log('too large for grouping');

		}
	};
});
