import Variable from './Variable';
import { UNKNOWN_ASSIGNMENT } from '../values';

export default class GlobalVariable extends Variable {
	constructor ( name ) {
		super( name );
		this.isExternal = true;
		this.isGlobal = true;
		this.isReassigned = false;
		this.included = true;
	}

	addReference ( reference ) {
		if ( reference.isReassignment ) this.isReassigned = true;
	}

	assignExpression () {}

	gatherPossibleValues ( values ) {
		values.add( UNKNOWN_ASSIGNMENT );
	}

	includeDeclaration () {
		this.included = true;
		return false;
	}
}
