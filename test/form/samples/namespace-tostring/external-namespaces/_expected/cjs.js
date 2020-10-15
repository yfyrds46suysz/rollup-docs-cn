'use strict';

var externalAuto = require('external-auto');
var externalDefault = require('external-default');
var externalDefaultOnly = require('external-defaultOnly');

function _interopNamespace(e) {
	return e && e.__esModule ? e : _interopNamespaceDefault(e);
}

function _interopNamespaceDefault(e) {
	var n = {__proto__: null, [Symbol.toStringTag]: 'Module'};
	if (e) {
		Object.keys(e).forEach(function (k) {
			if (k !== 'default') {
				var d = Object.getOwnPropertyDescriptor(e, k);
				Object.defineProperty(n, k, d.get ? d : {
					enumerable: true,
					get: function () {
						return e[k];
					}
				});
			}
		});
	}
	n['default'] = e;
	return Object.freeze(n);
}

function _interopNamespaceDefaultOnly(e) {
	return Object.freeze({__proto__: null, [Symbol.toStringTag]: 'Module', 'default': e});
}

var externalAuto__namespace = /*#__PURE__*/_interopNamespace(externalAuto);
var externalDefault__namespace = /*#__PURE__*/_interopNamespaceDefault(externalDefault);
var externalDefaultOnly__namespace = /*#__PURE__*/_interopNamespaceDefaultOnly(externalDefaultOnly);

assert.strictEqual(externalAuto__namespace[Symbol.toStringTag], 'Module');
assert.strictEqual(Object.prototype.toString.call(externalAuto__namespace), '[object Module]');
assert.strictEqual(externalAuto.foo, 42);

assert.strictEqual(externalDefault__namespace[Symbol.toStringTag], 'Module');
assert.strictEqual(Object.prototype.toString.call(externalDefault__namespace), '[object Module]');
assert.strictEqual(externalDefault.foo, 42);

assert.strictEqual(externalDefaultOnly__namespace[Symbol.toStringTag], 'Module');
assert.strictEqual(Object.prototype.toString.call(externalDefaultOnly__namespace), '[object Module]');
assert.deepStrictEqual(externalDefaultOnly, { foo: 42 });
