System.register([], function (exports, module) {
	'use strict';
	return {
		execute: function () {

			exports('default', foo);
			function foo () {
				console.log( 'indented with tabs' );
			}

		}
	};
});
