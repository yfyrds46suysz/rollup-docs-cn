System.register([], function () {
	'use strict';
	return {
		execute: function () {

			function foo () {
				return 42;
			}

			var str = `
//# sourceMappingURL=main.js.map
`;

			console.log( foo(str) );

		}
	};
});
