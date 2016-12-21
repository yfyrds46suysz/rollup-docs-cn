import flatten from '../../utils/flatten.js';
import isReference from '../../utils/isReference.js';
import pureFunctions from './pureFunctions.js';
import { UNKNOWN } from '../../values.js';

const currentlyCalling = new Set();

function isES5Function ( node ) {
	return node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration';
}

function hasEffectsNew ( node, scope ) {
	let inner = node;

	if ( inner.type === 'ExpressionStatement' ) {
		inner = inner.expression;

		if ( inner.type === 'AssignmentExpression' ) {
			if ( inner.right.hasEffects( scope ) ) {
				return true;

			} else {
				inner = inner.left;

				if ( inner.type === 'MemberExpression' ) {
					if ( inner.computed && inner.property.hasEffects( scope ) ) {
						return true;

					} else {
						inner = inner.object;

						if ( inner.type === 'ThisExpression' ) {
							return false;
						}
					}
				}
			}
		}
	}

	return node.hasEffects( scope );
}

function fnHasEffects ( fn, isNew ) {
	if ( currentlyCalling.has( fn ) ) return false; // prevent infinite loops... TODO there must be a better way
	currentlyCalling.add( fn );

	// handle body-less arrow functions
	const scope = fn.body.scope || fn.scope;
	const body = fn.body.type === 'BlockStatement' ? fn.body.body : [ fn.body ];

	for ( const node of body ) {
		if ( isNew ? hasEffectsNew( node, scope ) : node.hasEffects( scope ) ) {
			currentlyCalling.delete( fn );
			return true;
		}
	}

	currentlyCalling.delete( fn );
	return false;
}

export default function callHasEffects ( scope, callee, isNew ) {
	const values = new Set([ callee ]);

	for ( const node of values ) {
		if ( node === UNKNOWN ) return true; // err on side of caution

		if ( /Function/.test( node.type ) ) {
			if ( fnHasEffects( node, isNew && isES5Function( node ) ) ) return true;
		}

		else if ( isReference( node ) ) {
			const flattened = flatten( node );
			const declaration = scope.findDeclaration( flattened.name );

			if ( declaration.isGlobal ) {
				if ( !pureFunctions[ flattened.keypath ] ) return true;
			}

			else if ( declaration.isExternal ) {
				return true; // TODO make this configurable? e.g. `path.[whatever]`
			}

			else {
				if ( node.declaration ) {
					node.declaration.gatherPossibleValues( values );
				} else {
					return true;
				}
			}
		}

		else {
			if ( !node.gatherPossibleValues ) {
				throw new Error( 'TODO' );
			}
			node.gatherPossibleValues( values );
		}
	}

	return false;
}
