(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('https://npmcdn.com/foo')) :
	typeof define === 'function' && define.amd ? define(['https://npmcdn.com/foo'], factory) :
	(factory(global.foo));
}(this, (function (foo) { 'use strict';

	foo = 'default' in foo ? foo['default'] : foo;

	assert.equal( foo, 42 );

})));
