import Node from '../Node.js';
import { UNKNOWN_ASSIGNMENT } from '../values';

export default class RestElement extends Node {
	assignExpression () {
		this.argument.assignExpression( UNKNOWN_ASSIGNMENT );
	}

	hasEffectsWhenAssigned ( options ) {
		return this.argument.hasEffectsWhenAssigned( options );
	}

	initialiseAndDeclare ( parentScope, kind ) {
		this.initialiseScope( parentScope );
		this.argument.initialiseAndDeclare( parentScope, kind, UNKNOWN_ASSIGNMENT );
	}
}
