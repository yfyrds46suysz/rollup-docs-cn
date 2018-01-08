import BlockScope from '../scopes/BlockScope';
import VariableDeclaration from './VariableDeclaration';
import Scope from '../scopes/Scope';
import ExecutionPathOptions from '../ExecutionPathOptions';
import BlockStatement from './BlockStatement';
import { BasicStatementNode, StatementNode } from './shared/Statement';
import { PatternNode } from './shared/Pattern';
import { ExpressionNode } from './shared/Expression';

export default class ForInStatement extends BasicStatementNode {
	type: 'ForInStatement';
	left: VariableDeclaration | PatternNode;
	right: ExpressionNode;
	body: StatementNode;

	hasEffects (options: ExecutionPathOptions): boolean {
		return (
			(this.left &&
				(this.left.hasEffects(options) ||
					this.left.hasEffectsWhenAssignedAtPath([], options))) ||
			(this.right && this.right.hasEffects(options)) ||
			this.body.hasEffects(options.setIgnoreBreakStatements())
		);
	}

	initialiseChildren () {
		this.left.initialise(this.scope);
		this.right.initialise(<Scope>this.scope.parent);
		(<BlockStatement>this.body).initialiseAndReplaceScope
			? (<BlockStatement>this.body).initialiseAndReplaceScope(this.scope)
			: this.body.initialise(this.scope);
	}

	includeInBundle () {
		let addedNewNodes = super.includeInBundle();
		if (this.left.includeWithAllDeclarations()) {
			addedNewNodes = true;
		}
		return addedNewNodes;
	}

	initialiseScope (parentScope: Scope) {
		this.scope = new BlockScope({ parent: parentScope });
	}
}
