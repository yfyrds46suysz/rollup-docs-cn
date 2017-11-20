import Statement from './shared/Statement.js';
import BlockScope from '../scopes/BlockScope';

export default class ForStatement extends Statement {
	hasEffects ( options ) {
		return this.init && this.init.hasEffects( options )
			|| this.test && this.test.hasEffects( options )
			|| this.update && this.update.hasEffects( options )
			|| this.body.hasEffects( options.setIgnoreBreakStatements() );
	}

	initialiseChildren () {
		if ( this.init ) this.init.initialise( this.scope );
		if ( this.test ) this.test.initialise( this.scope );
		if ( this.update ) this.update.initialise( this.scope );

		if ( this.body.type === 'BlockStatement' ) {
			this.body.initialiseScope( this.scope );
			this.body.initialiseChildren();
		} else {
			this.body.initialise( this.scope );
		}
	}

	initialiseScope ( parentScope ) {
		this.scope = new BlockScope( { parent: parentScope } );
	}
}
