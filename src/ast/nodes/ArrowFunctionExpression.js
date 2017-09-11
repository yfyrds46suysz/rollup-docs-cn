import Node from '../Node';
import Scope from '../scopes/Scope.js';

export default class ArrowFunctionExpression extends Node {
	hasEffects () {
		return this.included;
	}

	hasEffectsWhenCalled ( options ) {
		return this.params.some( param => param.hasEffects( options ) )
			|| this.body.hasEffects( options );
	}

	initialiseChildren () {
		this.params.forEach( param => param.initialiseAndDeclare( this.scope, 'parameter' ) );
		if ( this.body.initialiseAndReplaceScope ) {
			this.body.initialiseAndReplaceScope( new Scope( {
				parent: this.scope,
				isBlockScope: false,
				isLexicalBoundary: false
			} ) );
		} else {
			this.body.initialise( this.scope );
		}
	}

	initialiseScope ( parentScope ) {
		this.scope = new Scope( {
			parent: parentScope,
			isBlockScope: false,
			isLexicalBoundary: false
		} );
	}
}
