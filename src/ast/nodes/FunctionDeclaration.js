import Node from '../Node.js';
import Scope from '../scopes/Scope.js';

export default class FunctionDeclaration extends Node {
	gatherPossibleValues ( values ) {
		values.add( this );
	}

	hasEffects () {
		return this.included || (this.id && this.id.hasEffects());
	}

	initialiseChildren ( parentScope ) {
		this.id && this.id.initialiseAndDeclare( parentScope, 'function', this );
		this.params.forEach( param => param.initialiseAndDeclare( this.scope, 'parameter' ) );
		this.body.initialiseAndReplaceScope ?
			this.body.initialiseAndReplaceScope( this.scope ) :
			this.body.initialise( this.scope );
	}

	initialiseScope ( parentScope ) {
		this.scope = new Scope( {
			parent: parentScope,
			isBlockScope: false,
			isLexicalBoundary: true
		} );
	}

	hasEffectsWhenMutated () {
		return this.included;
	}

	render ( code, es ) {
		if ( !this.module.bundle.treeshake || this.included ) {
			super.render( code, es );
		} else {
			code.remove( this.leadingCommentStart || this.start, this.next || this.end );
		}
	}
}
