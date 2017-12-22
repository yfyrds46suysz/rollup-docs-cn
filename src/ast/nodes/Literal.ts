import Node from '../Node';
import ExecutionPathOptions from '../ExecutionPathOptions';

export default class Literal extends Node {
	type: 'Literal';
	value: string | boolean | null | number | RegExp;

	getValue () {
		return this.value;
	}

	hasEffectsWhenAccessedAtPath (path: string[], options: ExecutionPathOptions) {
		if (this.value === null) {
			return path.length > 0;
		}
		return path.length > 1;
	}

	hasEffectsWhenAssignedAtPath (path: string[], options: ExecutionPathOptions) {
		if (this.value === null) {
			return path.length > 0;
		}
		return path.length > 1;
	}

	render (code) {
		if (typeof this.value === 'string') {
			code.indentExclusionRanges.push([this.start + 1, this.end - 1]);
		}
	}
}
