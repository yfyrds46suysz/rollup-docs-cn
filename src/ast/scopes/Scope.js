import { blank, keys } from '../../utils/object.js';
import LocalVariable from '../variables/LocalVariable';
import ParameterVariable from '../variables/ParameterVariable';
import { UNDEFINED_ASSIGNMENT } from '../values';

export default class Scope {
	constructor ( options = {} ) {
		this.parent = options.parent;
		this.isModuleScope = !!options.isModuleScope;

		this.children = [];
		if ( this.parent ) this.parent.children.push( this );

		this.variables = blank();
	}

	/**
	 * @param identifier
	 * @param {Object} [options] - valid options are
	 *        {(Node|null)} init
	 *        {boolean} isHoisted
	 */
	addDeclaration ( identifier, options = {} ) {
		const name = identifier.name;
		if ( this.variables[ name ] ) {
			const variable = this.variables[ name ];
			variable.addDeclaration( identifier );
			options.init && variable.assignExpressionAtPath( [], options.init );
		} else {
			this.variables[ name ] = new LocalVariable( identifier.name, identifier, options.init || UNDEFINED_ASSIGNMENT );
		}
	}

	addParameterDeclaration ( identifier ) {
		const name = identifier.name;
		this.variables[ name ] = new ParameterVariable( name, identifier );
	}

	contains ( name ) {
		return !!this.variables[ name ] ||
			( this.parent ? this.parent.contains( name ) : false );
	}

	deshadow ( names ) {
		keys( this.variables ).forEach( key => {
			const declaration = this.variables[ key ];

			// we can disregard exports.foo etc
			if ( declaration.exportName && declaration.isReassigned ) return;

			const name = declaration.getName( true );
			let deshadowed = name;

			let i = 1;

			while ( names.has( deshadowed ) ) {
				deshadowed = `${name}$$${i++}`;
			}

			declaration.name = deshadowed;
		} );

		this.children.forEach( scope => scope.deshadow( names ) );
	}

	findLexicalBoundary () {
		return this.parent.findLexicalBoundary();
	}

	findVariable ( name ) {
		return this.variables[ name ] ||
			( this.parent && this.parent.findVariable( name ) );
	}
}
