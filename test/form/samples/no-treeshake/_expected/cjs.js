'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var external = require('external');

var foo = 'unused';

const quux = 1;

const other = () => quux;

function bar () {
	return foo;
}

function baz () {
	return 13 + external.value;
}

const moreExternal = external.more;

var create = Object.create, getPrototypeOf = Object.getPrototypeOf;

exports.baz = baz;
exports.create = create;
exports.getPrototypeOf = getPrototypeOf;
exports.strange = quux;
