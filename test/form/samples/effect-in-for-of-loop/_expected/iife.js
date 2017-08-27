(function () {
	'use strict';

	const items = [{}, {}, {}];

	for ( const a of items.children ) {
		a.foo = 'a';
	}

	let c;
	for ( c of items.children ) {
		c.bar = 'c';
	}

	for ( e of items.children ) {
		e.baz = 'e';
	}
	var e;

	assert.deepEqual( items, [
		{ foo: 'a', bar: 'c', baz: 'e' },
		{ foo: 'a', bar: 'c', baz: 'e' },
		{ foo: 'a', bar: 'c', baz: 'e' }
	]);

}());
