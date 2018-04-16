import ExecutionPathOptions from '../ExecutionPathOptions';
import MagicString from 'magic-string';
import { ExpressionNode, NodeBase } from './shared/Node';
import { NodeType } from './NodeType';
import {
	getCommaSeparatedNodesWithBoundaries,
	NodeRenderOptions,
	RenderOptions
} from '../../utils/renderHelpers';
import { BLANK } from '../../utils/blank';
import { ObjectPath } from '../values';
import CallOptions from '../CallOptions';
import { ForEachReturnExpressionCallback } from './shared/Expression';
import CallExpression from './CallExpression';

export default class SequenceExpression extends NodeBase {
	type: NodeType.SequenceExpression;
	expressions: ExpressionNode[];

	forEachReturnExpressionWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		callback: ForEachReturnExpressionCallback,
		options: ExecutionPathOptions
	) {
		this.expressions[this.expressions.length - 1].forEachReturnExpressionWhenCalledAtPath(
			path,
			callOptions,
			callback,
			options
		);
	}

	getValue(): any {
		return this.expressions[this.expressions.length - 1].getValue();
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

	include() {
		let anotherPassNeeded = false;
		this.included = true;
		for (let i = 0; i < this.expressions.length - 1; i++) {
			const node = this.expressions[i];
			if (node.shouldBeIncluded() && node.include()) anotherPassNeeded = true;
		}
		if (this.expressions[this.expressions.length - 1].include()) anotherPassNeeded = true;
		return anotherPassNeeded;
	}

	reassignPath(path: ObjectPath, options: ExecutionPathOptions) {
		if (path.length > 0) this.expressions[this.expressions.length - 1].reassignPath(path, options);
	}

	render(
		code: MagicString,
		options: RenderOptions,
		{ renderedParentType, isCalleeOfRenderedParent }: NodeRenderOptions = BLANK
	) {
		if (!this.module.graph.treeshake) {
			super.render(code, options);
		} else {
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
}
