(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('acorn')) :
	typeof define === 'function' && define.amd ? define(['acorn'], factory) :
	(factory(global.acorn));
}(this, (function (acorn) { 'use strict';

	function parse$1(source) {
		return acorn.parse(source, { ecmaVersion: 6 });
	}

	console.log(parse$1('foo'));

})));
