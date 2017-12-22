import FunctionNode from './shared/FunctionNode';
import Scope from '../scopes/Scope';

export default class FunctionExpression extends FunctionNode {
	initialiseChildren () {
		this.id && this.id.initialiseAndDeclare(this.scope, 'function', this);
		this.params.forEach(param =>
			param.initialiseAndDeclare(this.scope, 'parameter')
		);
		this.body.initialiseAndReplaceScope(new Scope({ parent: this.scope }));
	}
}
