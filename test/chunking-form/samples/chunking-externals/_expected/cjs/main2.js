'use strict';

var __chunk_1 = require('./chunk-ca3a1cbb.js');
var external = require('external');

function fn () {
  console.log('lib1 fn');
  external.fn();
}

function fn$1 () {
  fn();
  console.log('dep3 fn');
}

class Main2 {
  constructor () {
    fn$1();
    __chunk_1.fn();
  }
}

module.exports = Main2;
