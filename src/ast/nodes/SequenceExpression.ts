import MagicString from 'magic-string';
import { BLANK } from '../../utils/blank';
import {
	getCommaSeparatedNodesWithBoundaries,
	NodeRenderOptions,
	RenderOptions
} from '../../utils/renderHelpers';
import CallOptions from '../CallOptions';
import { DeoptimizableEntity } from '../DeoptimizableEntity';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import { ImmutableEntityPathTracker } from '../utils/ImmutableEntityPathTracker';
import { LiteralValueOrUnknown, ObjectPath } from '../values';
import CallExpression from './CallExpression';
import * as NodeType from './NodeType';
import { ExpressionNode, NodeBase } from './shared/Node';

export default class SequenceExpression extends NodeBase {
	type: NodeType.tSequenceExpression;
	expressions: ExpressionNode[];

	getLiteralValueAtPath(
		path: ObjectPath,
		recursionTracker: ImmutableEntityPathTracker,
		origin: DeoptimizableEntity
	): LiteralValueOrUnknown {
		return this.expressions[this.expressions.length - 1].getLiteralValueAtPath(
			path,
			recursionTracker,
			origin
		);
	}

	hasEffects(options: ExecutionPathOptions): boolean {
		for (const expression of this.expressions) {
			if (expression.hasEffects(options)) return true;
		}
		return false;
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		return (
			path.length > 0 &&
			this.expressions[this.expressions.length - 1].hasEffectsWhenAccessedAtPath(path, options)
		);
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		return (
			path.length === 0 ||
			this.expressions[this.expressions.length - 1].hasEffectsWhenAssignedAtPath(path, options)
		);
	}

	hasEffectsWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		options: ExecutionPathOptions
	): boolean {
		return this.expressions[this.expressions.length - 1].hasEffectsWhenCalledAtPath(
			path,
			callOptions,
			options
		);
	}

	include(includeAllChildrenRecursively: boolean) {
		this.included = true;
		for (let i = 0; i < this.expressions.length - 1; i++) {
			const node = this.expressions[i];
			if (includeAllChildrenRecursively || node.shouldBeIncluded())
				node.include(includeAllChildrenRecursively);
		}
		this.expressions[this.expressions.length - 1].include(includeAllChildrenRecursively);
	}

	deoptimizePath(path: ObjectPath) {
		if (path.length > 0) this.expressions[this.expressions.length - 1].deoptimizePath(path);
	}

	render(
		code: MagicString,
		options: RenderOptions,
		{ renderedParentType, isCalleeOfRenderedParent }: NodeRenderOptions = BLANK
	) {
		let firstStart = 0,
			lastEnd,
			includedNodes = 0;
		for (const { node, start, end } of getCommaSeparatedNodesWithBoundaries(
			this.expressions,
			code,
			this.start,
			this.end
		)) {
			if (!node.included) {
				code.remove(start, end);
				continue;
			}
			includedNodes++;
			if (firstStart === 0) firstStart = start;
			lastEnd = end;
			if (node === this.expressions[this.expressions.length - 1] && includedNodes === 1) {
				node.render(code, options, {
					renderedParentType: renderedParentType || this.parent.type,
					isCalleeOfRenderedParent: renderedParentType
						? isCalleeOfRenderedParent
						: (<CallExpression>this.parent).callee === this
				});
			} else {
				node.render(code, options);
			}
		}
		// Round brackets are part of the actual parent and should be re-added in case the parent changed
		if (includedNodes > 1 && renderedParentType) {
			code.prependRight(firstStart, '(');
			code.appendLeft(lastEnd, ')');
		}
	}
}
