define(['./chunk-b663d499.js'], function (__chunk_11) { 'use strict';

  function fn () {
    console.log('dep1 fn');
  }

  class Main1 {
    constructor () {
      fn();
      __chunk_11.fn();
    }
  }

  return Main1;

});
//# sourceMappingURL=main1.js.map
