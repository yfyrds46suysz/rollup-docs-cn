System.register([], function (exports, module) {
	'use strict';
	return {
		execute: function () {

			var x = exports('x', {foo: 'bar'});
			delete x.foo;

			delete globalVariable.foo;

		}
	};
});
