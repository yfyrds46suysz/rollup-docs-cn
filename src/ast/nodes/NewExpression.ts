import CallOptions from '../CallOptions';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import { EMPTY_PATH, ObjectPath, UNKNOWN_PATH } from '../values';
import * as NodeType from './NodeType';
import { ExpressionNode, NodeBase } from './shared/Node';

export default class NewExpression extends NodeBase {
	type: NodeType.tNewExpression;
	callee: ExpressionNode;
	arguments: ExpressionNode[];

	private callOptions: CallOptions;

	bind() {
		super.bind();
		for (const argument of this.arguments) {
			// This will make sure all properties of parameters behave as "unknown"
			argument.reassignPath(UNKNOWN_PATH);
		}
	}

	hasEffects(options: ExecutionPathOptions): boolean {
		for (const argument of this.arguments) {
			if (argument.hasEffects(options)) return true;
		}
		return this.callee.hasEffectsWhenCalledAtPath(
			EMPTY_PATH,
			this.callOptions,
			options.getHasEffectsWhenCalledOptions()
		);
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, _options: ExecutionPathOptions) {
		return path.length > 1;
	}

	initialise() {
		this.included = false;
		this.callOptions = CallOptions.create({
			withNew: true,
			args: this.arguments,
			callIdentifier: this
		});
	}
}
