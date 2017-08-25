import Node from '../Node.js';
import extractNames from '../utils/extractNames.js';
import { UNKNOWN_ASSIGNMENT } from '../values';

function getSeparator ( code, start ) {
	let c = start;

	while ( c > 0 && code[ c - 1 ] !== '\n' ) {
		c -= 1;
		if ( code[ c ] === ';' || code[ c ] === '{' ) return '; ';
	}

	const lineStart = code.slice( c, start ).match( /^\s*/ )[ 0 ];

	return `;\n${lineStart}`;
}

const forStatement = /^For(?:Of|In)?Statement/;

export default class VariableDeclaration extends Node {
	assignExpression () {
		this.eachChild( child => child.assignExpression( UNKNOWN_ASSIGNMENT ) );
	}

	includeInBundle () {
		if ( this.isFullyIncluded() ) return false;
		let addedNewNodes = false;
		this.declarations.forEach( declarator => {
			if ( declarator.shouldBeIncluded() ) {
				if ( declarator.includeInBundle() ) {
					addedNewNodes = true;
				}
			}
		} );
		if ( !this.included || addedNewNodes ) {
			this.included = true;
			return true;
		}
		return false;
	}

	render ( code, es ) {
		const treeshake = this.module.bundle.treeshake;

		let shouldSeparate = false;
		let separator;

		if ( this.scope.isModuleScope && !forStatement.test( this.parent.type ) ) {
			shouldSeparate = true;
			separator = getSeparator( this.module.code, this.start );
		}

		let c = this.start;
		let empty = true;

		for ( let i = 0; i < this.declarations.length; i += 1 ) {
			const declarator = this.declarations[ i ];

			const prefix = empty ? '' : separator; // TODO indentation

			if ( declarator.id.type === 'Identifier' ) {
				const proxy = declarator.proxies.get( declarator.id.name );
				const isExportedAndReassigned = !es && proxy.exportName && proxy.isReassigned;

				if ( isExportedAndReassigned ) {
					if ( declarator.init ) {
						if ( shouldSeparate ) code.overwrite( c, declarator.start, prefix );
						c = declarator.end;
						empty = false;
					}
				} else if ( !treeshake || proxy.included ) {
					if ( shouldSeparate ) code.overwrite( c, declarator.start, `${prefix}${this.kind} ` ); // TODO indentation
					c = declarator.end;
					empty = false;
				}
			} else {
				const exportAssignments = [];
				let isIncluded = false;

				extractNames( declarator.id ).forEach( name => {
					const proxy = declarator.proxies.get( name );
					const isExportedAndReassigned = !es && proxy.exportName && proxy.isReassigned;

					if ( isExportedAndReassigned ) {
						// code.overwrite( c, declarator.start, prefix );
						// c = declarator.end;
						// empty = false;
						exportAssignments.push( 'TODO' );
					} else if ( declarator.included ) {
						isIncluded = true;
					}
				} );

				if ( !treeshake || isIncluded ) {
					if ( shouldSeparate ) code.overwrite( c, declarator.start, `${prefix}${this.kind} ` ); // TODO indentation
					c = declarator.end;
					empty = false;
				}

				if ( exportAssignments.length ) {
					throw new Error( 'TODO' );
				}
			}

			declarator.render( code, es );
		}

		if ( treeshake && empty ) {
			code.remove( this.leadingCommentStart || this.start, this.next || this.end );
		} else {
			// always include a semi-colon (https://github.com/rollup/rollup/pull/1013),
			// unless it's a var declaration in a loop head
			const needsSemicolon = !forStatement.test( this.parent.type ) || this === this.parent.body;

			if ( this.end > c ) {
				code.overwrite( c, this.end, needsSemicolon ? ';' : '' );
			} else if ( needsSemicolon ) {
				this.insertSemicolon( code );
			}
		}
	}
}
