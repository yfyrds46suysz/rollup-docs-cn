(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('leaflet')) :
	typeof define === 'function' && define.amd ? define(['leaflet'], factory) :
	(global = global || self, factory(global.L));
}(this, (function (L) { 'use strict';

	L = L && Object.prototype.hasOwnProperty.call(L, 'default') ? L['default'] : L;

	L.terminator = function(options) {
	};

})));
