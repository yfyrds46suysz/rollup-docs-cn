(function (factory) {
	typeof define === 'function' && define.amd ? define(['acorn'], factory) :
	factory(global.acorn);
}(function (acorn) { 'use strict';

	function parse(source) {
		return acorn.parse(source, { ecmaVersion: 6 });
	}

	console.log(parse('foo'));

}));
