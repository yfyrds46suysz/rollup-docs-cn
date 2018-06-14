import CallOptions from '../CallOptions';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import ReturnValueScope from '../scopes/ReturnValueScope';
import Scope from '../scopes/Scope';
import { ObjectPath, UNKNOWN_EXPRESSION } from '../values';
import BlockStatement from './BlockStatement';
import * as NodeType from './NodeType';
import { ExpressionNode, GenericEsTreeNode, NodeBase } from './shared/Node';
import { PatternNode } from './shared/Pattern';

export default class ArrowFunctionExpression extends NodeBase {
	type: NodeType.tArrowFunctionExpression;
	body: BlockStatement | ExpressionNode;
	params: PatternNode[];

	scope: ReturnValueScope;
	preventChildBlockScope: true;

	createScope(parentScope: Scope) {
		this.scope = new ReturnValueScope(parentScope);
	}

	getReturnExpressionWhenCalledAtPath(path: ObjectPath) {
		return path.length === 0 ? this.scope.getReturnExpression() : UNKNOWN_EXPRESSION;
	}

	hasEffects(_options: ExecutionPathOptions) {
		return false;
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, _options: ExecutionPathOptions) {
		return path.length > 1;
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, _options: ExecutionPathOptions) {
		return path.length > 1;
	}

	hasEffectsWhenCalledAtPath(
		path: ObjectPath,
		_callOptions: CallOptions,
		options: ExecutionPathOptions
	): boolean {
		if (path.length > 0) {
			return true;
		}
		for (const param of this.params) {
			if (param.hasEffects(options)) return true;
		}
		return this.body.hasEffects(options);
	}

	initialise() {
		this.included = false;
		for (const param of this.params) {
			param.declare('parameter', null);
		}
		if (this.body instanceof BlockStatement) {
			this.body.addImplicitReturnExpressionToScope();
		} else {
			this.scope.addReturnExpression(this.body);
		}
	}

	parseNode(esTreeNode: GenericEsTreeNode) {
		if (esTreeNode.body.type === NodeType.BlockStatement) {
			this.body = new this.context.nodeConstructors.BlockStatement(
				esTreeNode.body,
				this,
				new Scope(this.scope)
			);
		}
		super.parseNode(esTreeNode);
	}
}

ArrowFunctionExpression.prototype.preventChildBlockScope = true;
