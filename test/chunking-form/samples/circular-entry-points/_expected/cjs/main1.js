'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var main2_js = require('./main2.js');

class C {
  fn (num) {
    console.log(num - main2_js.p);
  }
}

var p = 42;

new C().fn(p);

exports.p = p;
