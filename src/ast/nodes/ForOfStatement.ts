import BlockScope from '../scopes/BlockScope';
import { ExecutionPathOptions, NEW_EXECUTION_PATH } from '../ExecutionPathOptions';
import VariableDeclaration from './VariableDeclaration';
import Scope from '../scopes/Scope';
import { PatternNode } from './shared/Pattern';
import * as NodeType from './NodeType';
import { ExpressionNode, Node, StatementBase, StatementNode } from './shared/Node';
import MagicString from 'magic-string';
import { NO_SEMICOLON, RenderOptions } from '../../utils/renderHelpers';
import { EMPTY_PATH } from '../values';

export function isForOfStatement(node: Node): node is ForOfStatement {
	return node.type === NodeType.ForOfStatement;
}

export default class ForOfStatement extends StatementBase {
	type: NodeType.tForOfStatement;
	left: VariableDeclaration | PatternNode;
	right: ExpressionNode;
	body: StatementNode;

	bind() {
		super.bind();
		this.left.reassignPath(EMPTY_PATH, NEW_EXECUTION_PATH);
	}

	createScope(parentScope: Scope) {
		this.scope = new BlockScope({ parent: parentScope });
	}

	hasEffects(options: ExecutionPathOptions): boolean {
		return (
			(this.left &&
				(this.left.hasEffects(options) ||
					this.left.hasEffectsWhenAssignedAtPath(EMPTY_PATH, options))) ||
			(this.right && this.right.hasEffects(options)) ||
			this.body.hasEffects(options.setIgnoreBreakStatements())
		);
	}

	include() {
		this.included = true;
		this.left.includeWithAllDeclaredVariables();
		this.right.include();
		this.body.include();
	}

	render(code: MagicString, options: RenderOptions) {
		this.left.render(code, options, NO_SEMICOLON);
		this.right.render(code, options, NO_SEMICOLON);
		this.body.render(code, options);
	}
}
