import AssignmentProperty from './AssignmentProperty';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import { ExpressionEntity } from './shared/Expression';
import { PatternNode } from './shared/Pattern';
import { NodeBase } from './shared/Node';
import * as NodeType from './NodeType';
import { EMPTY_PATH, ObjectPath } from '../values';

export default class ObjectPattern extends NodeBase implements PatternNode {
	type: NodeType.tObjectPattern;
	properties: AssignmentProperty[];

	declare(kind: string, init: ExpressionEntity | null) {
		for (const property of this.properties) {
			property.declare(kind, init);
		}
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, options: ExecutionPathOptions) {
		if (path.length > 0) return true;
		for (const property of this.properties) {
			if (property.hasEffectsWhenAssignedAtPath(EMPTY_PATH, options)) return true;
		}
		return false;
	}

	reassignPath(path: ObjectPath, options: ExecutionPathOptions) {
		if (path.length === 0) {
			for (const property of this.properties) {
				property.reassignPath(path, options);
			}
		}
	}
}
