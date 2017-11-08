(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(factory());
}(this, (function () { 'use strict';

	const retained1 = { x: () => {} };
	retained1.y();

	const retained2 = { x: () => {} };
	retained2.x = {};
	retained2.x();

	const retained3 = { x: { y: globalFunc } };
	const retained4 = { x: { y: {} } };
	retained4.x = retained3.x;
	retained4.x.y();

})));
