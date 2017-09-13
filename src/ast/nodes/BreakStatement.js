import Node from '../Node.js';

export default class BreakStatement extends Node {
	hasEffects ( options ) {
		return super.hasEffects( options )
			|| !options.ignoreBreakStatements();
	}
}
