'use strict';

var __chunk1_js = require('./chunk1.js');

function fn () {
  console.log('lib1 fn');
}

function fn$1 () {
  fn();
  console.log('dep3 fn');
}

class Main2 {
  constructor () {
    fn$1();
    __chunk1_js.fn();
  }
}

module.exports = Main2;
