define(['exports', './lib1-4c530ea2.js'], function (exports, __chunk_1) { 'use strict';

  function fn () {
    console.log('lib2 fn');
  }

  function fn$1 () {
    fn();
    console.log('dep2 fn');
  }

  function fn$2 () {
    __chunk_1.fn();
    console.log('dep3 fn');
  }

  exports.fn = fn$1;
  exports.fn$1 = fn$2;

});
