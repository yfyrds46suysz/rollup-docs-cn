'use strict';

var __chunk_23 = require('../lib/lib2.js');

function fn () {
  __chunk_23.fn();
  console.log('dep2 fn');
}

exports.fn = fn;
