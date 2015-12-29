import { blank } from '../utils/object.js';
import { getName } from '../utils/map-helpers.js';
import getInteropBlock from './shared/getInteropBlock.js';
import getExportBlock from './shared/getExportBlock.js';

function setupNamespace ( keypath ) {
	let parts = keypath.split( '.' ); // TODO support e.g. `foo['something-hyphenated']`?

	parts.pop();

	let acc = 'this';

	return parts
		.map( part => ( acc += `.${part}`, `${acc} = ${acc} || {};` ) )
		.join( '\n' ) + '\n';
}

export default function iife ( bundle, magicString, { exportMode, indentString }, options ) {
	const globalNames = options.globals || blank();
	const name = options.moduleName;
	const isNamespaced = name && ~name.indexOf( '.' );

	let dependencies = bundle.externalModules.map( module => {
		return globalNames[ module.id ] || module.name;
	});

	let args = bundle.externalModules.map( getName );

	if ( exportMode !== 'none' && !name ) {
		throw new Error( 'You must supply options.moduleName for IIFE bundles' );
	}

	if ( exportMode === 'named' ) {
		dependencies.unshift( `(this.${name} = {})` );
		args.unshift( 'exports' );
	}

	const useStrict = options.useStrict !== false ? ` 'use strict';` : ``;
	let intro = `(function (${args}) {${useStrict}\n\n`;
	let outro = `\n\n})(${dependencies});`;

	if ( exportMode === 'default' ) {
		intro = ( isNamespaced ? `this.` : `var ` ) + `${name} = ${intro}`;
	}

	if ( isNamespaced ) {
		intro = setupNamespace( name ) + intro;
	}

	// var foo__default = 'default' in foo ? foo['default'] : foo;
	const interopBlock = getInteropBlock( bundle );
	if ( interopBlock ) magicString.prepend( interopBlock + '\n\n' );

	const exportBlock = getExportBlock( bundle.entryModule, exportMode );
	if ( exportBlock ) magicString.append( '\n\n' + exportBlock );

	return magicString
		.indent( indentString )
		.prepend( intro )
		.append( outro );
}
