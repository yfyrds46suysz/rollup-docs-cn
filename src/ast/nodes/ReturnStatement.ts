import { UNKNOWN_EXPRESSION } from '../values';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import * as NodeType from './NodeType';
import { ExpressionNode, StatementBase } from './shared/Node';
import { RenderOptions } from '../../utils/renderHelpers';
import MagicString from 'magic-string';

export default class ReturnStatement extends StatementBase {
	type: NodeType.tReturnStatement;
	argument: ExpressionNode | null;

	hasEffects(options: ExecutionPathOptions) {
		return (
			!options.ignoreReturnAwaitYield() || (this.argument && this.argument.hasEffects(options))
		);
	}

	initialise() {
		this.included = false;
		this.scope.addReturnExpression(this.argument || UNKNOWN_EXPRESSION);
	}

	render(code: MagicString, options: RenderOptions) {
		if (this.argument) {
			this.argument.render(code, options);
			if (this.argument.start === this.start + 6 /* 'return'.length */) {
				code.prependLeft(this.start + 6, ' ');
			}
		}
	}
}
