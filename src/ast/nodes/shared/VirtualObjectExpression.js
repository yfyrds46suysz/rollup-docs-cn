import Node from '../../Node';

export default class VirtualObjectExpression extends Node {
	hasEffectsWhenAccessedAtPath ( path ) {
		return path.length > 1;
	}

	hasEffectsWhenAssignedAtPath ( path ) {
		return path.length > 1;
	}

	hasEffectsWhenMutatedAtPath ( path ) {
		return path.length > 0;
	}

	toString () {
		return '[[VIRTUAL OBJECT]]';
	}
}
