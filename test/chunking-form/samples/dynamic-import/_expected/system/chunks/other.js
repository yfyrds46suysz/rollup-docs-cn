System.register(['./chunk.js'], function (exports, module) {
	'use strict';
	return {
		setters: [function (module) {
			exports('value', module.s);
		}],
		execute: function () {



		}
	};
});
