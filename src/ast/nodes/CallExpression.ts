import Node from '../Node';
import CallOptions from '../CallOptions';
import Expression, { CallableExpression } from './Expression';
import ExecutionPathOptions from '../ExecutionPathOptions';
import SpreadElement from './SpreadElement';
import { PredicateFunction } from '../values';
import GlobalVariable from '../variables/GlobalVariable';

export default class CallExpression extends Node {
	type: 'CallExpression';
	callee:	CallableExpression
	arguments: (Expression | SpreadElement)[];

	private _callOptions: CallOptions;

	reassignPath (path: string[], options: ExecutionPathOptions) {
		!options.hasReturnExpressionBeenAssignedAtPath(path, this) &&
			// Type TODO: Failure because AwaitExpression has no forEachReturnExpressionWhenCalledAtPath
			this.callee.forEachReturnExpressionWhenCalledAtPath(
				[],
				this._callOptions,
				(innerOptions: ExecutionPathOptions) => (node: Node) =>
					node.reassignPath(
						path,
						innerOptions.addAssignedReturnExpressionAtPath(path, this)
					),
				options
			);
	}

	bindNode () {
		if (this.callee.type === 'Identifier') {
			const variable = this.scope.findVariable(this.callee.name);

			if (variable.isNamespace) {
				this.module.error(
					{
						code: 'CANNOT_CALL_NAMESPACE',
						message: `Cannot call a namespace ('${this.callee.name}')`
					},
					this.start
				);
			}

			if (this.callee.name === 'eval' && (<GlobalVariable>variable).isGlobal) {
				this.module.warn(
					{
						code: 'EVAL',
						message: `Use of eval is strongly discouraged, as it poses security risks and may cause issues with minification`,
						url:
							'https://github.com/rollup/rollup/wiki/Troubleshooting#avoiding-eval'
					},
					this.start
				);
			}
		}
	}

	forEachReturnExpressionWhenCalledAtPath (
		path: string[],
		callOptions: CallOptions,
		callback: (options: ExecutionPathOptions) => (node: Node) => void,
		options: ExecutionPathOptions
	) {
		this.callee.forEachReturnExpressionWhenCalledAtPath(
			[],
			this._callOptions,
			(innerOptions: ExecutionPathOptions) => (node: Node) =>
				node.forEachReturnExpressionWhenCalledAtPath(
					path,
					callOptions,
					callback,
					innerOptions
				),
			options
		);
	}

	hasEffects (options: ExecutionPathOptions): boolean {
		return (
			this.arguments.some(child => child.hasEffects(options)) ||
			this.callee.hasEffectsWhenCalledAtPath(
				[],
				this._callOptions,
				options.getHasEffectsWhenCalledOptions()
			)
		);
	}

	hasEffectsWhenAccessedAtPath (path: string[], options: ExecutionPathOptions): boolean {
		return (
			path.length > 0 &&
			!options.hasReturnExpressionBeenAccessedAtPath(path, this) &&
			this.callee.someReturnExpressionWhenCalledAtPath(
				[],
				this._callOptions,
				(innerOptions: ExecutionPathOptions) => (node: Node) =>
					node.hasEffectsWhenAccessedAtPath(
						path,
						innerOptions.addAccessedReturnExpressionAtPath(path, this)
					),
				options
			)
		);
	}

	hasEffectsWhenAssignedAtPath (path: string[], options: ExecutionPathOptions): boolean {
		return (
			!options.hasReturnExpressionBeenAssignedAtPath(path, this) &&
			this.callee.someReturnExpressionWhenCalledAtPath(
				[],
				this._callOptions,
				(innerOptions: ExecutionPathOptions) => (node: Node) =>
					node.hasEffectsWhenAssignedAtPath(
						path,
						innerOptions.addAssignedReturnExpressionAtPath(path, this)
					),
				options
			)
		);
	}

	hasEffectsWhenCalledAtPath (path: string[], callOptions: CallOptions, options: ExecutionPathOptions): boolean {
		return (
			!options.hasReturnExpressionBeenCalledAtPath(path, this) &&
			this.callee.someReturnExpressionWhenCalledAtPath(
				[],
				this._callOptions,
				(innerOptions: ExecutionPathOptions) => (node: Node) =>
					node.hasEffectsWhenCalledAtPath(
						path,
						callOptions,
						innerOptions.addCalledReturnExpressionAtPath(path, this)
					),
				options
			)
		);
	}

	initialiseNode () {
		this._callOptions = CallOptions.create({
			withNew: false,
			args: this.arguments,
			caller: this
		});
	}

	someReturnExpressionWhenCalledAtPath (
		path: string[],
		callOptions: CallOptions,
		predicateFunction: (options: ExecutionPathOptions) => PredicateFunction,
		options: ExecutionPathOptions
	): boolean {
		return this.callee.someReturnExpressionWhenCalledAtPath(
			[],
			this._callOptions,
			(innerOptions: ExecutionPathOptions) => (node: Node) =>
				node.someReturnExpressionWhenCalledAtPath(
					path,
					callOptions,
					predicateFunction,
					innerOptions
				),
			options
		);
	}
}
