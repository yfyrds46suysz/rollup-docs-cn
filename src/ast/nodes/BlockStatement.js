import Statement from './shared/Statement.js';
import Scope from '../scopes/Scope.js';

export default class BlockStatement extends Statement {
	bind () {
		this.body.forEach( node => node.bind() );
	}

	includeInBundle () {
		if ( this.isFullyIncluded() ) return false;
		let addedNewNodes = false;
		this.body.forEach( node => {
			if ( node.shouldBeIncluded() ) {
				if ( node.includeInBundle() ) {
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

	initialiseAndReplaceScope ( scope ) {
		this.scope = scope;
		this.initialiseNode();
		this.initialiseChildren( scope );
	}

	initialiseChildren () {
		let lastNode;
		for ( const node of this.body ) {
			node.initialise( this.scope );

			if ( lastNode ) lastNode.next = node.start;
			lastNode = node;
		}
	}

	initialiseScope ( parentScope ) {
		this.scope = new Scope( {
			parent: parentScope,
			isBlockScope: true,
			isLexicalBoundary: false
		} );
	}

	render ( code, es ) {
		if ( this.body.length ) {
			for ( const node of this.body ) {
				node.render( code, es );
			}
		} else {
			Statement.prototype.render.call( this, code, es );
		}
	}
}
