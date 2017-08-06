import Node from '../../Node.js';

export default class Statement extends Node {
	render ( code, es ) {
		if ( !this.module.bundle.treeshake || this.shouldInclude ) {
			super.render( code, es );
		} else {
			code.remove( this.leadingCommentStart || this.start, this.next || this.end );
		}
	}

	run () {
		this.shouldInclude = true;
		super.run();
	}
}
