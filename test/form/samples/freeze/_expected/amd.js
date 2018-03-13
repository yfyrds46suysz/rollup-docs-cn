define(['exports'], function (exports) { 'use strict';

	const foo = 1;
	const bar = 2;

	var namespace = ({
		foo: foo,
		bar: bar
	});

	console.log( Object.keys( namespace ) );

	const a = 1;
	const b = 2;

	exports.a = a;
	exports.b = b;

	Object.defineProperty(exports, '__esModule', { value: true });

});
