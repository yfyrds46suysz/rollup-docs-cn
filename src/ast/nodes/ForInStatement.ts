import BlockScope from '../scopes/BlockScope';
import VariableDeclaration from './VariableDeclaration';
import Scope from '../scopes/Scope';
import ExecutionPathOptions from '../ExecutionPathOptions';
import { PatternNode } from './shared/Pattern';
import { NodeType } from './NodeType';
import { ExpressionNode, Node, StatementBase, StatementNode } from './shared/Node';
import MagicString from 'magic-string';
import { NO_SEMICOLON, RenderOptions } from '../../utils/renderHelpers';

export function isForInStatement(node: Node): node is ForInStatement {
	return node.type === NodeType.ForInStatement;
}

export default class ForInStatement extends StatementBase {
	type: NodeType.ForInStatement;
	left: VariableDeclaration | PatternNode;
	right: ExpressionNode;
	body: StatementNode;

	createScope(parentScope: Scope) {
		this.scope = new BlockScope({ parent: parentScope });
	}

	hasEffects(options: ExecutionPathOptions): boolean {
		return (
			(this.left &&
				(this.left.hasEffects(options) || this.left.hasEffectsWhenAssignedAtPath([], options))) ||
			(this.right && this.right.hasEffects(options)) ||
			this.body.hasEffects(options.setIgnoreBreakStatements())
		);
	}

	include() {
		let anotherPassNeeded = false;
		this.included = true;
		if (this.left.includeWithAllDeclaredVariables()) anotherPassNeeded = true;
		if (this.right.include()) anotherPassNeeded = true;
		if (this.body.include()) anotherPassNeeded = true;
		return anotherPassNeeded;
	}

	render(code: MagicString, options: RenderOptions) {
		this.left.render(code, options, NO_SEMICOLON);
		this.right.render(code, options, NO_SEMICOLON);
		this.body.render(code, options);
	}
}
