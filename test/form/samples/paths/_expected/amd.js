define(['https://unpkg.com/foo'], function (foo) { 'use strict';

	foo = foo && Object.prototype.hasOwnProperty.call(foo, 'default') ? foo['default'] : foo;

	assert.equal( foo, 42 );

});
