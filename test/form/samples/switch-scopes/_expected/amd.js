define(function () { 'use strict';

	const x = globalFunction;

	switch ( anotherGlobal ) {
		case 2:
			x();
	}

	switch ( globalFunction() ) {
		case 4:
	}

});
