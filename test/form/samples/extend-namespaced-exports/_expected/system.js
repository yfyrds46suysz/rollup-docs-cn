System.register('foo.bar.baz', [], function (exports, module) {
	'use strict';
	return {
		execute: function () {

			const answer = exports('answer', 42);

		}
	};
});
