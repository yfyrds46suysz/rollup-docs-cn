define(['require', './generated-chunk'], function (require, __chunk_1) { 'use strict';

  function calc (num) {
    return num * __chunk_1.multiplier;
  }

  function fn (num) {
    return num * calc(num);
  }

  function dynamic (num) {
    return new Promise(function (resolve, reject) { require(['./generated-dep2'], resolve, reject) })
    .then(dep2 => {
      return dep2.mult(num);
    });
  }

  console.log(fn(5));

  dynamic(10).then(num => {
    console.log(num);
  });

});
