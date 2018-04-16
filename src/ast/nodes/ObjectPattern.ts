import AssignmentProperty from './AssignmentProperty';
import ExecutionPathOptions from '../ExecutionPathOptions';
import { ExpressionEntity } from './shared/Expression';
import { PatternNode } from './shared/Pattern';
import { NodeBase } from './shared/Node';
import { NodeType } from './NodeType';
import { ObjectPath } from '../values';

export default class ObjectPattern extends NodeBase implements PatternNode {
	type: NodeType.ObjectPattern;
	properties: AssignmentProperty[];

	declare(kind: string, init: ExpressionEntity | null) {
		for (const property of this.properties) {
			property.declare(kind, init);
		}
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, options: ExecutionPathOptions) {
		return (
			path.length > 0 ||
			this.properties.some(child => child.hasEffectsWhenAssignedAtPath([], options))
		);
	}

	reassignPath(path: ObjectPath, options: ExecutionPathOptions) {
		if (path.length === 0) {
			for (const property of this.properties) {
				property.reassignPath(path, options);
			}
		}
	}
}
