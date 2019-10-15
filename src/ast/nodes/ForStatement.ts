import MagicString from 'magic-string';
import { NO_SEMICOLON, RenderOptions } from '../../utils/renderHelpers';
import { HasEffectsContext, InclusionContext } from '../ExecutionContext';
import BlockScope from '../scopes/BlockScope';
import Scope from '../scopes/Scope';
import * as NodeType from './NodeType';
import { ExpressionNode, IncludeChildren, StatementBase, StatementNode } from './shared/Node';
import VariableDeclaration from './VariableDeclaration';

export default class ForStatement extends StatementBase {
	body!: StatementNode;
	init!: VariableDeclaration | ExpressionNode | null;
	test!: ExpressionNode | null;
	type!: NodeType.tForStatement;
	update!: ExpressionNode | null;

	createScope(parentScope: Scope) {
		this.scope = new BlockScope(parentScope);
	}

	hasEffects(context: HasEffectsContext): boolean {
		if (
			(this.init && this.init.hasEffects(context)) ||
			(this.test && this.test.hasEffects(context)) ||
			(this.update && this.update.hasEffects(context))
		)
			return true;
		const {
			breakFlow,
			ignore: { breakStatements }
		} = context;
		context.ignore.breakStatements = true;
		if (this.body.hasEffects(context)) return true;
		context.ignore.breakStatements = breakStatements;
		context.breakFlow = breakFlow;
		return false;
	}

	include(context: InclusionContext, includeChildrenRecursively: IncludeChildren) {
		this.included = true;
		if (this.init) this.init.include(context, includeChildrenRecursively);
		if (this.test) this.test.include(context, includeChildrenRecursively);
		const { breakFlow } = context;
		if (this.update) this.update.include(context, includeChildrenRecursively);
		this.body.include(context, includeChildrenRecursively);
		context.breakFlow = breakFlow;
	}

	render(code: MagicString, options: RenderOptions) {
		if (this.init) this.init.render(code, options, NO_SEMICOLON);
		if (this.test) this.test.render(code, options, NO_SEMICOLON);
		if (this.update) this.update.render(code, options, NO_SEMICOLON);
		this.body.render(code, options);
	}
}
