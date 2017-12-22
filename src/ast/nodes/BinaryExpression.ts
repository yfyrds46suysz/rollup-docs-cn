import Node from '../Node';
import { UNKNOWN_VALUE } from '../values';
import Expression from './Expression';
import ExecutionPathOptions from '../ExecutionPathOptions';

type BinaryOperator = '==' | '!=' | '===' | '!==' | '<' | '<=' | '>' | '>=' | '<<' | '>>' | '>>>' | '+' | '-' | '*' | '/' | '%' | ' |' | '^' | '&' | '**' | 'in' | 'instanceof';

const operators: {
	[operator: string]: (left: any, right: any) => any
} = {
	'==': (left: any, right: any) => left == right,
	'!=': (left: any, right: any) => left != right,
	'===': (left: any, right: any) => left === right,
	'!==': (left: any, right: any) => left !== right,
	'<': (left: any, right: any) => left < right,
	'<=': (left: any, right: any) => left <= right,
	'>': (left: any, right: any) => left > right,
	'>=': (left: any, right: any) => left >= right,
	'<<': (left: any, right: any) => left << right,
	'>>': (left: any, right: any) => left >> right,
	'>>>': (left: any, right: any) => left >>> right,
	'+': (left: any, right: any) => left + right,
	'-': (left: any, right: any) => left - right,
	'*': (left: any, right: any) => left * right,
	'/': (left: any, right: any) => left / right,
	'%': (left: any, right: any) => left % right,
	'|': (left: any, right: any) => left | right,
	'^': (left: any, right: any) => left ^ right,
	'&': (left: any, right: any) => left & right,
	'**': (left: any, right: any) => Math.pow(left, right),
	in: (left: any, right: any) => left in right,
	instanceof: (left: any, right: any) => left instanceof right
};

export default class BinaryExpression extends Node {
	type: 'BinaryExpression';
	left: Expression;
	right: Expression;
	operator: BinaryOperator;

	getValue (): any {
		const leftValue = this.left.getValue();
		if (leftValue === UNKNOWN_VALUE) return UNKNOWN_VALUE;

		const rightValue = this.right.getValue();
		if (rightValue === UNKNOWN_VALUE) return UNKNOWN_VALUE;

		const operatorFn = operators[this.operator];
		if (!operatorFn) return UNKNOWN_VALUE;

		return operatorFn(leftValue, rightValue);
	}

	hasEffectsWhenAccessedAtPath (path: string[], _options: ExecutionPathOptions) {
		return path.length > 1;
	}
}
