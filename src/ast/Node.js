/* eslint-disable no-unused-vars */

import { locate } from 'locate-character';
import { UNKNOWN_ASSIGNMENT, UNKNOWN_VALUE } from './values.js';
import ExecutionPathOptions from './ExecutionPathOptions';

export default class Node {
	constructor () {
		this.keys = [];
	}

	/**
	 * Called once all nodes have been initialised and the scopes have been populated.
	 * Usually one should not override this function but override bindNode and/or
	 * bindChildren instead.
	 */
	bind () {
		this.bindChildren();
		this.bindNode();
	}

	/**
	 * Override this to bind assignments to variables and do any initialisations that
	 * require the scopes to be populated with variables.
	 */
	bindNode () {}

	/**
	 * Override to control on which children "bind" is called.
	 */
	bindChildren () {
		this.eachChild( child => child.bind() );
	}

	/**
	 * Bind an expression as an assignment to a node given a path.
	 * E.g., node.bindAssignmentAtPath(['x', 'y'], otherNode) is called when otherNode
	 * is assigned to node.x.y.
	 * The default noop implementation is ok as long as hasEffectsWhenAssignedAtPath
	 * always returns true for this node. Otherwise it should be overridden.
	 * @param {String[]} path
	 * @param {Node} expression
	 */
	bindAssignmentAtPath ( path, expression ) {}

	/**
	 * Binds the arguments a node is called with to this node and possibly its parameters.
	 * Should usually be overridden together with hasEffectsWhenCalled.
	 * @param {String[]} path
	 * @param {CallOptions} callOptions
	 */
	bindCallAtPath ( path, callOptions ) {}

	eachChild ( callback ) {
		this.keys.forEach( key => {
			const value = this[ key ];
			if ( !value ) return;

			if ( Array.isArray( value ) ) {
				value.forEach( child => child && callback( child ) );
			} else {
				callback( value );
			}
		} );
	}

	/**
	 * Executes the callback on each possible return expression when calling this node.
	 * @param {String[]} path
	 * @param {CallOptions} callOptions
	 * @param {Function} callback
	 */
	forEachReturnExpressionWhenCalledAtPath ( path, callOptions, callback ) {}

	getValue () {
		return UNKNOWN_VALUE;
	}

	/**
	 * Determine if this Node would have an effect on the bundle.
	 * This is usually true for already included nodes. Exceptions are e.g. break statements
	 * which only have an effect if their surrounding loop or switch statement is included.
	 * The options pass on information like this about the current execution path.
	 * @param {ExecutionPathOptions} options
	 * @return {boolean}
	 */
	hasEffects ( options ) {
		return this.hasEffectsWhenAccessedAtPath( [], options )
			|| this.someChild( child => child.hasEffects( options ) );
	}

	/**
	 * @param {String[]} path
	 * @param {ExecutionPathOptions} options
	 * @return {boolean}
	 */
	hasEffectsWhenAccessedAtPath ( path, options ) {
		return path.length > 0;
	}

	/**
	 * @param {String[]} path
	 * @param {ExecutionPathOptions} options
	 * @return {boolean}
	 */
	hasEffectsWhenAssignedAtPath ( path, options ) {
		return true;
	}

	/**
	 * @param {String[]} path
	 * @param {CallOptions} callOptions
	 * @param {ExecutionPathOptions} options
	 * @return {boolean}
	 */
	hasEffectsWhenCalledAtPath ( path, callOptions, options ) {
		return true;
	}

	/**
	 * Returns true if this node or any of its children is included.
	 * @return {boolean}
	 */
	hasIncludedChild () {
		return this.included
			|| this.someChild( child => child.hasIncludedChild() );
	}

	/**
	 * Includes the node in the bundle. Children are usually included if they are
	 * necessary for this node (e.g. a function body) or if they have effects.
	 * Necessary variables need to be included as well. Should return true if any
	 * nodes or variables have been added that were missing before.
	 * @return {boolean}
	 */
	includeInBundle () {
		let addedNewNodes = !this.included;
		this.included = true;
		this.eachChild( childNode => {
			if ( childNode.includeInBundle() ) {
				addedNewNodes = true;
			}
		} );
		return addedNewNodes;
	}

	/**
	 * Alternative version of includeInBundle to override the default behaviour of
	 * declarations to only include nodes for declarators that have an effect. Necessary
	 * for for-loops that do not use a declared loop variable.
	 * @return {boolean}
	 */
	includeWithAllDeclarations () {
		return this.includeInBundle();
	}

	/**
	 * Assign a scope to this node and make sure all children have the right scopes.
	 * Perform any additional initialisation that does not depend on the scope being
	 * populated with variables.
	 * Usually one should not override this function but override initialiseScope,
	 * initialiseNode and/or initialiseChildren instead. BlockScopes have a special
	 * alternative initialisation initialiseAndReplaceScope.
	 * @param {Scope} parentScope
	 */
	initialise ( parentScope ) {
		this.initialiseScope( parentScope );
		this.initialiseNode( parentScope );
		this.initialiseChildren( parentScope );
	}

	/**
	 * Override to change how and with what scopes children are initialised
	 * @param {Scope} parentScope
	 */
	initialiseChildren ( parentScope ) {
		this.eachChild( child => child.initialise( this.scope ) );
	}

	/**
	 * Override to perform special initialisation steps after the scope is initialised
	 * @param {Scope} parentScope
	 */
	initialiseNode ( parentScope ) {}

	/**
	 * Override if this scope should receive a different scope than the parent scope.
	 * @param {Scope} parentScope
	 */
	initialiseScope ( parentScope ) {
		this.scope = parentScope;
	}

	insertSemicolon ( code ) {
		if ( code.original[ this.end - 1 ] !== ';' ) {
			code.appendLeft( this.end, ';' );
		}
	}

	locate () {
		// useful for debugging
		const location = locate( this.module.code, this.start, { offsetLine: 1 } );
		location.file = this.module.id;
		location.toString = () => JSON.stringify( location );

		return location;
	}

	render ( code, es ) {
		this.eachChild( child => child.render( code, es ) );
	}

	/**
	 * Start a new execution path to determine if this node has an effect on the bundle and
	 * should therefore be included. Included nodes should always be included again in subsequent
	 * visits as the inclusion of additional variables may require the inclusion of more child
	 * nodes in e.g. block statements.
	 * @return {boolean}
	 */
	shouldBeIncluded () {
		return this.included
			|| this.hasEffects( ExecutionPathOptions.create() )
			|| this.hasIncludedChild();
	}

	someChild ( callback ) {
		return this.keys.some( key => {
			const value = this[ key ];
			if ( !value ) return false;

			if ( Array.isArray( value ) ) {
				return value.some( child => child && callback( child ) );
			}
			return callback( value );
		} );
	}

	/**
	 * Returns true if some possible return expression when called at the given
	 * path returns true. predicateFunction receives a `node` as parameter.
	 * @param {String[]} path
	 * @param {CallOptions} callOptions
	 * @param {Function} predicateFunction
	 * @param {ExecutionPathOptions} options
	 * @returns {boolean}
	 */
	someReturnExpressionWhenCalledAtPath ( path, callOptions, predicateFunction, options ) {
		return predicateFunction( options )( UNKNOWN_ASSIGNMENT );
	}

	toString () {
		return this.module.code.slice( this.start, this.end );
	}
}
