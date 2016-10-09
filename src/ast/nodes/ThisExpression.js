import Node from '../Node.js';
import getLocation from '../../utils/getLocation.js';

const warning = `The 'this' keyword is equivalent to 'undefined' at the top level of an ES module, and has been rewritten. See https://github.com/rollup/rollup/wiki/Troubleshooting#this-is-undefined for more information`;

export default class ThisExpression extends Node {
	initialise ( scope ) {
		const lexicalBoundary = scope.findLexicalBoundary();

		if ( lexicalBoundary.isModuleScope ) {
			this.alias = this.module.context;
			if ( this.alias === 'undefined' ) {
				const { line, column } = getLocation( this.module.code, this.start );
				const detail = `${this.module.id} (${line}:${column + 1})`; // use one-based column number convention
				this.module.bundle.onwarn( `${detail} ${warning}` );
			}
		}
	}

	render ( code ) {
		if ( this.alias ) {
			code.overwrite( this.start, this.end, this.alias, true );
		}
	}
}
