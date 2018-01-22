define(['./chunk1.js'], function (__chunk1_js) { 'use strict';

  function calc (num) {
    return num * __chunk1_js.multiplier;
  }

  function fn (num) {
    return num * calc(num);
  }

  function dynamic (num) {
    return new Promise(function (resolve, reject) { require(["./dep2.js"], resolve, reject) })
    .then(dep2 => {
      return dep2.mult(num);
    });
  }

  console.log(fn(5));

  dynamic(10).then(num => {
    console.log(num);
  });

});
