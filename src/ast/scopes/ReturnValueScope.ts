import ParameterScope from './ParameterScope';
import { UnknownAssignment } from '../values';
import Expression from '../nodes/Expression';
import CallOptions from '../CallOptions';
import ExecutionPathOptions from '../ExecutionPathOptions';
import { ForEachReturnExpressionCallback } from '../Node';

export default class ReturnValueScope extends ParameterScope {
	_returnExpressions: Set<Expression | UnknownAssignment>;

	constructor (options = {}) {
		super(options);
		this._returnExpressions = new Set();
	}

	addReturnExpression (expression: Expression) {
		this._returnExpressions.add(expression);
	}

	forEachReturnExpressionWhenCalled (_callOptions: CallOptions, callback: ForEachReturnExpressionCallback, options: ExecutionPathOptions) {
		this._returnExpressions.forEach(callback(options));
	}

	someReturnExpressionWhenCalled (
		_callOptions: CallOptions, predicateFunction: (options: ExecutionPathOptions) => (node: Expression) => boolean,
		options: ExecutionPathOptions
	): boolean {
		return Array.from(this._returnExpressions).some(predicateFunction(options));
	}
}
