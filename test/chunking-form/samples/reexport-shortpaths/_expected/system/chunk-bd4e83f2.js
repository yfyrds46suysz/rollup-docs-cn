System.register([], function (exports, module) {
	'use strict';
	return {
		execute: function () {

			exports('a', foo);

			function foo() {}

		}
	};
});
