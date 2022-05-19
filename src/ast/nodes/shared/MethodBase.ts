import { type CallOptions, NO_ARGS } from '../../CallOptions';
import type { DeoptimizableEntity } from '../../DeoptimizableEntity';
import type { HasEffectsContext, InclusionContext } from '../../ExecutionContext';
import { EVENT_ACCESSED, EVENT_ASSIGNED, EVENT_CALLED, type NodeEvent } from '../../NodeEvents';
import {
	EMPTY_PATH,
	type ObjectPath,
	type PathTracker,
	SHARED_RECURSION_TRACKER
} from '../../utils/PathTracker';
import type PrivateIdentifier from '../PrivateIdentifier';
import SpreadElement from '../SpreadElement';
import {
	type ExpressionEntity,
	type LiteralValueOrUnknown,
	UNKNOWN_EXPRESSION
} from './Expression';
import { type ExpressionNode, NodeBase } from './Node';
import type { PatternNode } from './Pattern';

export default class MethodBase extends NodeBase implements DeoptimizableEntity {
	declare computed: boolean;
	declare key: ExpressionNode | PrivateIdentifier;
	declare kind: 'constructor' | 'method' | 'init' | 'get' | 'set';
	declare value: ExpressionNode | (ExpressionNode & PatternNode);

	private accessedValue: ExpressionEntity | null = null;
	private accessorCallOptions: CallOptions = {
		args: NO_ARGS,
		thisParam: null,
		withNew: false
	};

	// As getter properties directly receive their values from fixed function
	// expressions, there is no known situation where a getter is deoptimized.
	deoptimizeCache(): void {}

	deoptimizePath(path: ObjectPath): void {
		this.getAccessedValue().deoptimizePath(path);
	}

	deoptimizeThisOnEventAtPath(
		event: NodeEvent,
		path: ObjectPath,
		thisParameter: ExpressionEntity,
		recursionTracker: PathTracker
	): void {
		if (event === EVENT_ACCESSED && this.kind === 'get' && path.length === 0) {
			return this.value.deoptimizeThisOnEventAtPath(
				EVENT_CALLED,
				EMPTY_PATH,
				thisParameter,
				recursionTracker
			);
		}
		if (event === EVENT_ASSIGNED && this.kind === 'set' && path.length === 0) {
			return this.value.deoptimizeThisOnEventAtPath(
				EVENT_CALLED,
				EMPTY_PATH,
				thisParameter,
				recursionTracker
			);
		}
		this.getAccessedValue().deoptimizeThisOnEventAtPath(
			event,
			path,
			thisParameter,
			recursionTracker
		);
	}

	getLiteralValueAtPath(
		path: ObjectPath,
		recursionTracker: PathTracker,
		origin: DeoptimizableEntity
	): LiteralValueOrUnknown {
		return this.getAccessedValue().getLiteralValueAtPath(path, recursionTracker, origin);
	}

	getReturnExpressionWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		recursionTracker: PathTracker,
		origin: DeoptimizableEntity
	): ExpressionEntity {
		return this.getAccessedValue().getReturnExpressionWhenCalledAtPath(
			path,
			callOptions,
			recursionTracker,
			origin
		);
	}

	hasEffects(context: HasEffectsContext): boolean | undefined {
		return this.key.hasEffects(context);
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, context: HasEffectsContext): boolean | undefined {
		if (this.kind === 'get' && path.length === 0) {
			return this.value.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.accessorCallOptions, context);
		}
		return this.getAccessedValue().hasEffectsWhenAccessedAtPath(path, context);
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, context: HasEffectsContext): boolean {
		if (this.kind === 'set') {
			return this.value.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.accessorCallOptions, context);
		}
		return this.getAccessedValue().hasEffectsWhenAssignedAtPath(path, context);
	}

	hasEffectsWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		context: HasEffectsContext
	): boolean {
		return this.getAccessedValue().hasEffectsWhenCalledAtPath(path, callOptions, context);
	}

	includeArgumentsWhenCalledAtPath(
		path: ObjectPath,
		context: InclusionContext,
		args: readonly (ExpressionEntity | SpreadElement)[]
	): void {
		this.getAccessedValue().includeArgumentsWhenCalledAtPath(path, context, args);
	}

	protected getAccessedValue(): ExpressionEntity {
		if (this.accessedValue === null) {
			if (this.kind === 'get') {
				this.accessedValue = UNKNOWN_EXPRESSION;
				return (this.accessedValue = this.value.getReturnExpressionWhenCalledAtPath(
					EMPTY_PATH,
					this.accessorCallOptions,
					SHARED_RECURSION_TRACKER,
					this
				));
			} else {
				return (this.accessedValue = this.value);
			}
		}
		return this.accessedValue;
	}
}
