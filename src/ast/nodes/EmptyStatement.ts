import MagicString from 'magic-string';
import { StatementBase } from './shared/Statement';
import { NodeType } from './NodeType';

export default class EmptyStatement extends StatementBase {
	type: NodeType.EmptyStatement;

	render (code: MagicString) {
		if (
			this.parent.type === NodeType.BlockStatement ||
			this.parent.type === NodeType.Program
		) {
			code.remove(this.start, this.end);
		}
	}
}
