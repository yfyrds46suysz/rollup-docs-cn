import CallOptions from '../CallOptions';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import ExportDefaultDeclaration from '../nodes/ExportDefaultDeclaration';
import Identifier from '../nodes/Identifier';
import * as NodeType from '../nodes/NodeType';
import { ExpressionEntity } from '../nodes/shared/Expression';
import { Node } from '../nodes/shared/Node';
import { EntityPathTracker } from '../utils/EntityPathTracker';
import { ImmutableEntityPathTracker } from '../utils/ImmutableEntityPathTracker';
import {
	LiteralValueOrUnknown,
	ObjectPath,
	UNKNOWN_EXPRESSION,
	UNKNOWN_PATH,
	UNKNOWN_VALUE
} from '../values';
import Variable from './Variable';

// To avoid infinite recursions
const MAX_PATH_DEPTH = 7;

export default class LocalVariable extends Variable {
	declarations: (Identifier | ExportDefaultDeclaration)[];
	init: ExpressionEntity | null;
	isLocal: true;
	additionalInitializers: ExpressionEntity[] | null = null;

	private reassignmentTracker: EntityPathTracker;

	constructor(
		name: string,
		declarator: Identifier | ExportDefaultDeclaration | null,
		init: ExpressionEntity | null,
		reassignmentTracker: EntityPathTracker
	) {
		super(name);
		this.declarations = declarator ? [declarator] : [];
		this.init = init;
		this.reassignmentTracker = reassignmentTracker;
	}

	addDeclaration(identifier: Identifier, init: ExpressionEntity | null) {
		this.declarations.push(identifier);
		if (this.additionalInitializers === null) {
			this.additionalInitializers = this.init === null ? [] : [this.init];
			this.init = UNKNOWN_EXPRESSION;
			this.isReassigned = true;
		}
		if (init !== null) {
			this.additionalInitializers.push(init);
		}
	}

	consolidateInitializers() {
		if (this.additionalInitializers !== null) {
			for (const initializer of this.additionalInitializers) {
				initializer.reassignPath(UNKNOWN_PATH);
			}
			this.additionalInitializers = null;
		}
	}

	getLiteralValueAtPath(
		path: ObjectPath,
		recursionTracker: ImmutableEntityPathTracker
	): LiteralValueOrUnknown {
		if (
			this.isReassigned ||
			!this.init ||
			path.length > MAX_PATH_DEPTH ||
			recursionTracker.isTracked(this.init, path)
		) {
			return UNKNOWN_VALUE;
		}
		return this.init.getLiteralValueAtPath(path, recursionTracker.track(this.init, path));
	}

	getReturnExpressionWhenCalledAtPath(
		path: ObjectPath,
		recursionTracker: ImmutableEntityPathTracker
	): ExpressionEntity {
		if (
			this.isReassigned ||
			!this.init ||
			path.length > MAX_PATH_DEPTH ||
			recursionTracker.isTracked(this.init, path)
		) {
			return UNKNOWN_EXPRESSION;
		}
		return this.init.getReturnExpressionWhenCalledAtPath(
			path,
			recursionTracker.track(this.init, path)
		);
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, options: ExecutionPathOptions) {
		if (path.length === 0) return false;
		return (
			this.isReassigned ||
			path.length > MAX_PATH_DEPTH ||
			(this.init &&
				!options.hasNodeBeenAccessedAtPath(path, this.init) &&
				this.init.hasEffectsWhenAccessedAtPath(
					path,
					options.addAccessedNodeAtPath(path, this.init)
				))
		);
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, options: ExecutionPathOptions) {
		if (this.included || path.length > MAX_PATH_DEPTH) return true;
		if (path.length === 0) return false;
		return (
			this.isReassigned ||
			(this.init &&
				!options.hasNodeBeenAssignedAtPath(path, this.init) &&
				this.init.hasEffectsWhenAssignedAtPath(
					path,
					options.addAssignedNodeAtPath(path, this.init)
				))
		);
	}

	hasEffectsWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		options: ExecutionPathOptions
	) {
		if (path.length > MAX_PATH_DEPTH) return true;
		return (
			this.isReassigned ||
			(this.init &&
				!options.hasNodeBeenCalledAtPathWithOptions(path, this.init, callOptions) &&
				this.init.hasEffectsWhenCalledAtPath(
					path,
					callOptions,
					options.addCalledNodeAtPathWithOptions(path, this.init, callOptions)
				))
		);
	}

	include() {
		if (!this.included) {
			this.included = true;
			for (const declaration of this.declarations) {
				// If node is a default export, it can save a tree-shaking run to include the full declaration now
				if (!declaration.included) declaration.include();
				let node = <Node>declaration.parent;
				while (!node.included) {
					// We do not want to properly include parents in case they are part of a dead branch
					// in which case .include() might pull in more dead code
					node.included = true;
					if (node.type === NodeType.Program) break;
					node = <Node>node.parent;
				}
			}
		}
	}

	reassignPath(path: ObjectPath) {
		if (path.length > MAX_PATH_DEPTH) return;
		if (!(this.isReassigned || this.reassignmentTracker.track(this, path))) {
			if (path.length === 0) {
				this.isReassigned = true;
				if (this.init) {
					this.init.reassignPath(UNKNOWN_PATH);
				}
			} else if (this.init) {
				this.init.reassignPath(path);
			}
		}
	}
}

LocalVariable.prototype.isLocal = true;
