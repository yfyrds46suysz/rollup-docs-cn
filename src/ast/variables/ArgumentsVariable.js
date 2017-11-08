import LocalVariable from './LocalVariable';
import { UNKNOWN_ASSIGNMENT } from '../values';

const getParameterVariable = ( path, options ) =>
	(typeof path[ 0 ] === 'number' && options.getArgumentsVariables()[ path[ 0 ] ] )
	|| UNKNOWN_ASSIGNMENT;

export default class ArgumentsVariable extends LocalVariable {
	constructor ( parameters ) {
		super( 'arguments', null, UNKNOWN_ASSIGNMENT );
		this._parameters = parameters;
	}

	assignExpressionAtPath ( path, expression ) {
		if ( path.length >= 1 ) {
			if ( typeof path[ 0 ] === 'number' && this._parameters[ path[ 0 ] ] ) {
				this._parameters[ path[ 0 ] ].assignExpressionAtPath( path.slice( 1 ), expression );
			}
		}
	}

	hasEffectsWhenAccessedAtPath ( path, options ) {
		if ( path.length < 2 ) {
			return false;
		}
		return getParameterVariable( path, options )
			.hasEffectsWhenAccessedAtPath( path.slice( 1 ), options );
	}

	hasEffectsWhenAssignedAtPath ( path, options ) {
		if ( path.length === 0 ) {
			return true;
		}
		return getParameterVariable( path, options )
			.hasEffectsWhenAssignedAtPath( path.slice( 1 ), options );
	}

	hasEffectsWhenCalledAtPath ( path, callOptions, options ) {
		if ( path.length === 0 ) {
			return true;
		}
		return getParameterVariable( path, options )
			.hasEffectsWhenCalledAtPath( path.slice( 1 ), callOptions, options );
	}

	someReturnExpressionWhenCalledAtPath ( path, callOptions, predicateFunction, options ) {
		if ( path.length === 0 ) {
			return true;
		}
		return getParameterVariable( path, options )
			.someReturnExpressionWhenCalledAtPath( path.slice( 1 ), callOptions, predicateFunction, options );
	}
}
