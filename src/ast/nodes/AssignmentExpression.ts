import { ExecutionPathOptions, NEW_EXECUTION_PATH } from '../ExecutionPathOptions';
import { PatternNode } from './shared/Pattern';
import { ExpressionNode, NodeBase } from './shared/Node';
import * as NodeType from './NodeType';
import { EMPTY_PATH, ObjectPath, UNKNOWN_PATH } from '../values';

export default class AssignmentExpression extends NodeBase {
	type: NodeType.tAssignmentExpression;
	left: PatternNode | ExpressionNode;
	right: ExpressionNode;

	bind() {
		super.bind();
		this.left.reassignPath(EMPTY_PATH, NEW_EXECUTION_PATH);
		// We can not propagate mutations of the new binding to the old binding with certainty
		this.right.reassignPath(UNKNOWN_PATH, NEW_EXECUTION_PATH);
	}

	hasEffects(options: ExecutionPathOptions): boolean {
		return (
			this.right.hasEffects(options) ||
			this.left.hasEffects(options) ||
			this.left.hasEffectsWhenAssignedAtPath(EMPTY_PATH, options)
		);
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		return path.length > 0 && this.right.hasEffectsWhenAccessedAtPath(path, options);
	}
}
