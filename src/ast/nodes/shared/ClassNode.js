import Node from '../../Node.js';
import Scope from '../../scopes/Scope';

export default class ClassNode extends Node {
	bindCall ( callOptions ) {
		if ( this.superClass ) {
			this.superClass.bindCall( callOptions );
		}
		this.body.bindCall( callOptions );
	}

	hasEffectsAsExpressionStatement ( options ) {
		return this.hasEffects( options );
	}

	hasEffectsWhenCalled ( options ) {
		return this.body.hasEffectsWhenCalled( options )
			|| ( this.superClass && this.superClass.hasEffectsWhenCalled( options ) );
	}

	initialiseChildren () {
		if ( this.superClass ) {
			this.superClass.initialise( this.scope );
		}
		this.body.initialise( this.scope );
	}

	initialiseScope ( parentScope ) {
		this.scope = new Scope( { parent: parentScope } );
	}
}
