import Node from '../../Node';

export default class VirtualObjectExpression extends Node {
	hasEffectsWhenAssignedAtPath ( path ) {
		return path.length > 1;
	}

	hasEffectsWhenMutatedAtPath ( path ) {
		return path.length > 0;
	}
}
