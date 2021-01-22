(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.bundle = {}));
}(this, (function (exports) { 'use strict';

	new Promise( () => {
		console.log( 'fire & forget' );
	} );

	const p2 = new Promise( () => {
		console.info( 'forget me as well' );
	} );

	const p3 = new Promise( () => {
		console.info( 'and me too' );
	} );
	Promise.reject('should be kept for uncaught rejections');
	const allExported = Promise.all([p2, p3]);

	exports.allExported = allExported;

	Object.defineProperty(exports, '__esModule', { value: true });

})));
