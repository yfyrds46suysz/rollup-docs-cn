import MagicString from 'magic-string';
import { BLANK } from '../../utils/blank';
import { NodeRenderOptions, RenderOptions } from '../../utils/renderHelpers';
import CallOptions from '../CallOptions';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import { EntityPathTracker } from '../utils/EntityPathTracker';
import {
	EMPTY_IMMUTABLE_TRACKER,
	ImmutableEntityPathTracker
} from '../utils/ImmutableEntityPathTracker';
import {
	EMPTY_PATH,
	LiteralValueOrUnknown,
	ObjectPath,
	UNKNOWN_EXPRESSION,
	UNKNOWN_VALUE
} from '../values';
import CallExpression from './CallExpression';
import * as NodeType from './NodeType';
import {
	ExpressionEntity,
	ForEachReturnExpressionCallback,
	SomeReturnExpressionCallback
} from './shared/Expression';
import { ExpressionNode, NodeBase } from './shared/Node';

export type LogicalOperator = '||' | '&&';

export default class LogicalExpression extends NodeBase {
	type: NodeType.tLogicalExpression;
	operator: LogicalOperator;
	left: ExpressionNode;
	right: ExpressionNode;

	private hasUnknownLeftValue: boolean;
	private isOrExpression: boolean;

	forEachReturnExpressionWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		callback: ForEachReturnExpressionCallback,
		recursionTracker: EntityPathTracker
	) {
		const leftValue = this.hasUnknownLeftValue
			? UNKNOWN_VALUE
			: this.getLeftValue(EMPTY_IMMUTABLE_TRACKER);
		if (leftValue === UNKNOWN_VALUE) {
			this.left.forEachReturnExpressionWhenCalledAtPath(
				path,
				callOptions,
				callback,
				recursionTracker
			);
			this.right.forEachReturnExpressionWhenCalledAtPath(
				path,
				callOptions,
				callback,
				recursionTracker
			);
		} else if (this.isOrExpression ? leftValue : !leftValue) {
			this.left.forEachReturnExpressionWhenCalledAtPath(
				path,
				callOptions,
				callback,
				recursionTracker
			);
		} else {
			this.right.forEachReturnExpressionWhenCalledAtPath(
				path,
				callOptions,
				callback,
				recursionTracker
			);
		}
	}

	getLiteralValueAtPath(
		path: ObjectPath,
		recursionTracker: ImmutableEntityPathTracker
	): LiteralValueOrUnknown {
		const leftValue = this.hasUnknownLeftValue
			? UNKNOWN_VALUE
			: this.getLeftValue(recursionTracker);
		if (leftValue === UNKNOWN_VALUE) return UNKNOWN_VALUE;
		if (this.isOrExpression ? leftValue : !leftValue) return leftValue;
		return this.right.getLiteralValueAtPath(path, recursionTracker);
	}

	getReturnExpressionWhenCalledAtPath(
		path: ObjectPath,
		calledPathTracker: ImmutableEntityPathTracker
	): ExpressionEntity {
		const leftValue = this.hasUnknownLeftValue
			? UNKNOWN_VALUE
			: this.getLeftValue(EMPTY_IMMUTABLE_TRACKER);
		if (leftValue === UNKNOWN_VALUE) return UNKNOWN_EXPRESSION;
		if (this.isOrExpression ? leftValue : !leftValue)
			return this.left.getReturnExpressionWhenCalledAtPath(path, calledPathTracker);
		return this.right.getReturnExpressionWhenCalledAtPath(path, calledPathTracker);
	}

	hasEffects(options: ExecutionPathOptions): boolean {
		if (this.left.hasEffects(options)) return true;
		const leftValue = this.hasUnknownLeftValue
			? UNKNOWN_VALUE
			: this.getLeftValue(EMPTY_IMMUTABLE_TRACKER);
		return (
			(leftValue === UNKNOWN_VALUE || (this.isOrExpression ? !leftValue : leftValue)) &&
			this.right.hasEffects(options)
		);
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		if (path.length === 0) return false;
		const leftValue = this.hasUnknownLeftValue
			? UNKNOWN_VALUE
			: this.getLeftValue(EMPTY_IMMUTABLE_TRACKER);
		if (leftValue === UNKNOWN_VALUE) {
			return (
				this.left.hasEffectsWhenAccessedAtPath(path, options) ||
				this.right.hasEffectsWhenAccessedAtPath(path, options)
			);
		}
		return (this.isOrExpression
		? leftValue
		: !leftValue)
			? this.left.hasEffectsWhenAccessedAtPath(path, options)
			: this.right.hasEffectsWhenAccessedAtPath(path, options);
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		if (path.length === 0) return true;
		const leftValue = this.hasUnknownLeftValue
			? UNKNOWN_VALUE
			: this.getLeftValue(EMPTY_IMMUTABLE_TRACKER);
		if (leftValue === UNKNOWN_VALUE) {
			return (
				this.left.hasEffectsWhenAssignedAtPath(path, options) ||
				this.right.hasEffectsWhenAssignedAtPath(path, options)
			);
		}
		return (this.isOrExpression
		? leftValue
		: !leftValue)
			? this.left.hasEffectsWhenAssignedAtPath(path, options)
			: this.right.hasEffectsWhenAssignedAtPath(path, options);
	}

	hasEffectsWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		options: ExecutionPathOptions
	): boolean {
		const leftValue = this.hasUnknownLeftValue
			? UNKNOWN_VALUE
			: this.getLeftValue(EMPTY_IMMUTABLE_TRACKER);
		if (leftValue === UNKNOWN_VALUE) {
			return (
				this.left.hasEffectsWhenCalledAtPath(path, callOptions, options) ||
				this.right.hasEffectsWhenCalledAtPath(path, callOptions, options)
			);
		}
		return (this.isOrExpression
		? leftValue
		: !leftValue)
			? this.left.hasEffectsWhenCalledAtPath(path, callOptions, options)
			: this.right.hasEffectsWhenCalledAtPath(path, callOptions, options);
	}

	include() {
		this.included = true;
		const leftValue = this.hasUnknownLeftValue
			? UNKNOWN_VALUE
			: this.getLeftValue(EMPTY_IMMUTABLE_TRACKER);
		if (
			leftValue === UNKNOWN_VALUE ||
			(this.isOrExpression ? leftValue : !leftValue) ||
			this.left.shouldBeIncluded()
		) {
			this.left.include();
		}
		if (leftValue === UNKNOWN_VALUE || (this.isOrExpression ? !leftValue : leftValue)) {
			this.right.include();
		}
	}

	initialise() {
		this.included = false;
		this.hasUnknownLeftValue = false;
		this.isOrExpression = this.operator === '||';
	}

	reassignPath(path: ObjectPath) {
		if (path.length > 0) {
			const leftValue = this.hasUnknownLeftValue
				? UNKNOWN_VALUE
				: this.getLeftValue(EMPTY_IMMUTABLE_TRACKER);
			if (leftValue === UNKNOWN_VALUE) {
				this.left.reassignPath(path);
				this.right.reassignPath(path);
			} else if (this.isOrExpression ? leftValue : !leftValue) {
				this.left.reassignPath(path);
			} else {
				this.right.reassignPath(path);
			}
		}
	}

	render(
		code: MagicString,
		options: RenderOptions,
		{ renderedParentType, isCalleeOfRenderedParent }: NodeRenderOptions = BLANK
	) {
		if (!this.left.included || !this.right.included) {
			const singleRetainedBranch = this.left.included ? this.left : this.right;
			code.remove(this.start, singleRetainedBranch.start);
			code.remove(singleRetainedBranch.end, this.end);
			singleRetainedBranch.render(code, options, {
				renderedParentType: renderedParentType || this.parent.type,
				isCalleeOfRenderedParent: renderedParentType
					? isCalleeOfRenderedParent
					: (<CallExpression>this.parent).callee === this
			});
		} else {
			super.render(code, options);
		}
	}

	someReturnExpressionWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		predicateFunction: SomeReturnExpressionCallback,
		options: ExecutionPathOptions
	): boolean {
		const leftValue = this.hasUnknownLeftValue
			? UNKNOWN_VALUE
			: this.getLeftValue(EMPTY_IMMUTABLE_TRACKER);
		if (leftValue === UNKNOWN_VALUE) {
			return (
				this.left.someReturnExpressionWhenCalledAtPath(
					path,
					callOptions,
					predicateFunction,
					options
				) ||
				this.right.someReturnExpressionWhenCalledAtPath(
					path,
					callOptions,
					predicateFunction,
					options
				)
			);
		}
		return (this.isOrExpression
		? leftValue
		: !leftValue)
			? this.left.someReturnExpressionWhenCalledAtPath(
					path,
					callOptions,
					predicateFunction,
					options
			  )
			: this.right.someReturnExpressionWhenCalledAtPath(
					path,
					callOptions,
					predicateFunction,
					options
			  );
	}

	private getLeftValue(recursionTracker: ImmutableEntityPathTracker) {
		if (this.hasUnknownLeftValue) return UNKNOWN_VALUE;
		const value = this.left.getLiteralValueAtPath(EMPTY_PATH, recursionTracker);
		if (value === UNKNOWN_VALUE) {
			this.hasUnknownLeftValue = true;
		}
		return value;
	}
}
