import { ExpressionNode, NodeBase } from './shared/Node';
import ExecutionPathOptions from '../ExecutionPathOptions';
import FunctionExpression from './FunctionExpression';
import CallOptions from '../CallOptions';
import { NodeType } from './NodeType';
import { ObjectPath } from '../values';

export default class MethodDefinition extends NodeBase {
	type: NodeType.MethodDefinition;
	key: ExpressionNode;
	value: FunctionExpression;
	kind: 'constructor' | 'method' | 'get' | 'set';
	computed: boolean;
	static: boolean;

	hasEffects(options: ExecutionPathOptions) {
		return this.key.hasEffects(options);
	}

	hasEffectsWhenCalledAtPath(path: ObjectPath, callOptions: CallOptions, options: ExecutionPathOptions) {
		return path.length > 0 || this.value.hasEffectsWhenCalledAtPath([], callOptions, options);
	}
}
