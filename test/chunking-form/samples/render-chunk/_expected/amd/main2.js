define(['./chunk-chunk'], function (dep2) { 'use strict';

	var num = 3;

	console.log(dep2.num + num);

});
console.log('fileName', 'main2.js');
console.log('imports', 'chunk-chunk.js');
console.log('isEntry', true);
console.log('name', 'main2');
console.log('modules.length', 2);
