(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(factory());
}(this, (function () { 'use strict';

	// deep property access is forbidden
	const deepBoolean = true.x.y;
	const deepNumber = (1).x.y;
	const deepString = 'ab'.x.y;

	// due to strict mode, extension is forbidden
	true.x = 1;
	(1).x = 1;
	'ab'.x = 1;

})));
