'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

class MyClass {
	constructor() { }
}

let MyClass$1 = class MyClass {
	constructor() { }
}; /* comment */ functionCall();
assert.equal(MyClass$1.name, "MyClass"); // oops

exports.MyClass = MyClass$1;
exports.MyClass2 = MyClass;
