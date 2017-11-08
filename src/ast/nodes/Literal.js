import Node from '../Node.js';

export default class Literal extends Node {
	getValue () {
		return this.value;
	}

	hasEffectsWhenMutatedAtPath ( path ) {
		return path.length > 0;
	}

	render ( code ) {
		if ( typeof this.value === 'string' ) {
			code.indentExclusionRanges.push( [ this.start + 1, this.end - 1 ] );
		}
	}
}
