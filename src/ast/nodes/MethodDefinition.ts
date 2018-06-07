import CallOptions from '../CallOptions';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import { EMPTY_PATH, ObjectPath } from '../values';
import FunctionExpression from './FunctionExpression';
import * as NodeType from './NodeType';
import { ExpressionNode, NodeBase } from './shared/Node';

export default class MethodDefinition extends NodeBase {
	type: NodeType.tMethodDefinition;
	key: ExpressionNode;
	value: FunctionExpression;
	kind: 'constructor' | 'method' | 'get' | 'set';
	computed: boolean;
	static: boolean;

	hasEffects(options: ExecutionPathOptions) {
		return this.key.hasEffects(options);
	}

	hasEffectsWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		options: ExecutionPathOptions
	) {
		return (
			path.length > 0 || this.value.hasEffectsWhenCalledAtPath(EMPTY_PATH, callOptions, options)
		);
	}
}
