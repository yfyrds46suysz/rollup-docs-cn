import Node from '../Node.js';
import { UNKNOWN_VALUE } from '../values.js';

export default class ConditionalExpression extends Node {
	bindAssignmentAtPath ( path, expression, options ) {
		path.length > 0
		&& this._forEachRelevantBranch( node => node.bindAssignmentAtPath( path, expression, options ) );
	}

	forEachReturnExpressionWhenCalledAtPath ( path, callOptions, callback, options ) {
		this._forEachRelevantBranch( node => node.forEachReturnExpressionWhenCalledAtPath( path, callOptions, callback, options ) );
	}

	getValue () {
		const testValue = this.test.getValue();
		if ( testValue === UNKNOWN_VALUE ) return UNKNOWN_VALUE;

		return testValue ? this.consequent.getValue() : this.alternate.getValue();
	}

	hasEffects ( options ) {
		return (
			this.test.hasEffects( options )
			|| this._someRelevantBranch( node => node.hasEffects( options ) )
		);
	}

	hasEffectsWhenAccessedAtPath ( path, options ) {
		return path.length > 0
			&& this._someRelevantBranch( node => node.hasEffectsWhenAccessedAtPath( path, options ) );
	}

	hasEffectsWhenAssignedAtPath ( path, options ) {
		return path.length === 0
			|| this._someRelevantBranch( node => node.hasEffectsWhenAssignedAtPath( path, options ) );
	}

	hasEffectsWhenCalledAtPath ( path, callOptions, options ) {
		return this._someRelevantBranch( node => node.hasEffectsWhenCalledAtPath( path, callOptions, options ) );
	}

	initialiseChildren ( parentScope ) {
		super.initialiseChildren( parentScope );
		if ( this.module.bundle.treeshake ) {
			this.testValue = this.test.getValue();

			if ( this.testValue === UNKNOWN_VALUE ) {
				return;
			} else if ( this.testValue ) {
				this.alternate = null;
			} else if ( this.alternate ) {
				this.consequent = null;
			}
		}
	}

	render ( code, es ) {
		if ( !this.module.bundle.treeshake ) {
			super.render( code, es );
		}

		else {
			if ( this.testValue === UNKNOWN_VALUE ) {
				super.render( code, es );
			}

			else {
				const branchToRetain = this.testValue ? this.consequent : this.alternate;

				code.remove( this.start, branchToRetain.start );
				code.remove( branchToRetain.end, this.end );
				if ( branchToRetain.type === 'SequenceExpression' ) {
					code.prependLeft( branchToRetain.start, '(' );
					code.appendRight( branchToRetain.end, ')' );
				}
				branchToRetain.render( code, es );
			}
		}
	}

	someReturnExpressionWhenCalledAtPath ( path, callOptions, predicateFunction, options ) {
		return this._someRelevantBranch( node =>
			node.someReturnExpressionWhenCalledAtPath( path, callOptions, predicateFunction, options ) );
	}

	_forEachRelevantBranch ( callback ) {
		if ( this.testValue === UNKNOWN_VALUE ) {
			callback( this.consequent );
			callback( this.alternate );
		} else {
			this.testValue
				? callback( this.consequent )
				: callback( this.alternate );
		}
	}

	_someRelevantBranch ( predicateFunction ) {
		return this.testValue === UNKNOWN_VALUE
			? predicateFunction( this.consequent ) || predicateFunction( this.alternate )
			: this.testValue
				? predicateFunction( this.consequent )
				: predicateFunction( this.alternate );
	}
}
