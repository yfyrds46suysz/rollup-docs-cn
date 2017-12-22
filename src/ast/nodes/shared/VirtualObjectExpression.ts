import Node from '../../Node';

export default class VirtualObjectExpression extends Node {
	hasEffectsWhenAccessedAtPath (path: string[]) {
		return path.length > 1;
	}

	hasEffectsWhenAssignedAtPath (path: string[]) {
		return path.length > 1;
	}

	toString () {
		return '[[VIRTUAL OBJECT]]';
	}
}
