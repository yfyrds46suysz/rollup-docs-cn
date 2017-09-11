import relativeId from '../../utils/relativeId.js';
import Node from '../Node.js';
import { UNKNOWN_ASSIGNMENT } from '../values';

const validProp = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;

class Keypath {
	constructor ( node ) {
		this.parts = [];

		while ( node.type === 'MemberExpression' ) {
			const prop = node.property;

			if ( node.computed ) {
				if ( prop.type !== 'Literal' || typeof prop.value !== 'string' || !validProp.test( prop.value ) ) {
					this.computed = true;
					return;
				}
			}

			this.parts.unshift( prop );
			node = node.object;
		}

		this.root = node;
	}
}

export default class MemberExpression extends Node {
	bind () {
		// if this resolves to a namespaced declaration, prepare
		// to replace it
		// TODO this code is a bit inefficient
		const keypath = new Keypath( this );

		if ( !keypath.computed && keypath.root.type === 'Identifier' ) {
			let variable = this.scope.findVariable( keypath.root.name );

			while ( variable.isNamespace && keypath.parts.length ) {
				const exporterId = variable.module.id;

				const part = keypath.parts[ 0 ];
				variable = variable.module.traceExport( part.name || part.value );

				if ( !variable ) {
					this.module.warn( {
						code: 'MISSING_EXPORT',
						missing: part.name || part.value,
						importer: relativeId( this.module.id ),
						exporter: relativeId( exporterId ),
						message: `'${part.name || part.value}' is not exported by '${relativeId( exporterId )}'`,
						url: `https://github.com/rollup/rollup/wiki/Troubleshooting#name-is-not-exported-by-module`
					}, part.start );
					this.replacement = 'undefined';
					return;
				}

				keypath.parts.shift();
			}

			if ( keypath.parts.length ) {
				super.bind();
				return; // not a namespaced declaration
			}

			this.variable = variable;

			if ( variable.isExternal ) {
				variable.module.suggestName( keypath.root.name );
			}
		}

		else {
			super.bind();
		}
	}

	gatherPossibleValues ( values ) {
		values.add( UNKNOWN_ASSIGNMENT ); // TODO
	}

	hasEffectsWhenAssigned ( options ) {
		return this.object.hasEffectsWhenMutated( options );
	}

	includeInBundle () {
		let addedNewNodes = super.includeInBundle();
		if ( this.variable && !this.variable.included ) {
			this.variable.includeVariable();
			addedNewNodes = true;
		}
		return addedNewNodes;
	}

	render ( code, es ) {
		if ( this.variable ) {
			const name = this.variable.getName( es );
			if ( name !== this.name ) code.overwrite( this.start, this.end, name, { storeName: true, contentOnly: false } );
		}

		else if ( this.replacement ) {
			code.overwrite( this.start, this.end, this.replacement, { storeName: true, contentOnly: false } );
		}

		super.render( code, es );
	}
}
