(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	global.myBundle = factory();
}(typeof self !== 'undefined' ? self : this, function () { 'use strict';

	if ( !ok ) {
		throw new Error( 'this will be included' );
	}

	var main = 42;

	return main;

}));
