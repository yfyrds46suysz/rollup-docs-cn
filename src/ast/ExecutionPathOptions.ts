import Immutable from 'immutable';
import CallExpression from './nodes/CallExpression';
import CallOptions from './CallOptions';
import ThisVariable from './variables/ThisVariable';
import ParameterVariable from './variables/ParameterVariable';
import { Entity, WritableEntity } from './Entity';
import Property from './nodes/Property';
import { ExpressionEntity } from './nodes/shared/Expression';
import { ObjectPath } from './values';

export enum OptionTypes {
	IGNORED_LABELS,
	ACCESSED_NODES,
	ARGUMENTS_VARIABLES,
	ASSIGNED_NODES,
	IGNORE_BREAK_STATEMENTS,
	IGNORE_RETURN_AWAIT_YIELD,
	NODES_CALLED_AT_PATH_WITH_OPTIONS,
	REPLACED_VARIABLE_INITS,
	RETURN_EXPRESSIONS_ACCESSED_AT_PATH,
	RETURN_EXPRESSIONS_ASSIGNED_AT_PATH,
	RETURN_EXPRESSIONS_CALLED_AT_PATH
}

export type RESULT_KEY = {};
export const RESULT_KEY: RESULT_KEY = {};
export type KeyTypes = OptionTypes | Entity | RESULT_KEY;

export default class ExecutionPathOptions {
	private optionValues: Immutable.Map<KeyTypes, boolean | Entity | ExpressionEntity[]>;

	static create() {
		return new this(Immutable.Map());
	}

	private constructor(
		optionValues: Immutable.Map<KeyTypes, boolean | Entity | ExpressionEntity[]>
	) {
		this.optionValues = optionValues;
	}

	private get(option: OptionTypes) {
		return this.optionValues.get(option);
	}

	private remove(option: OptionTypes) {
		return new ExecutionPathOptions(this.optionValues.remove(option));
	}

	private set(option: OptionTypes, value: boolean | ExpressionEntity[]) {
		return new ExecutionPathOptions(this.optionValues.set(option, value));
	}

	private setIn(optionPath: (string | Entity | RESULT_KEY)[], value: boolean | Entity) {
		return new ExecutionPathOptions(this.optionValues.setIn(optionPath, value));
	}

	addAccessedNodeAtPath(path: ObjectPath, node: ExpressionEntity) {
		return this.setIn([OptionTypes.ACCESSED_NODES, node, ...path, RESULT_KEY], true);
	}

	addAccessedReturnExpressionAtPath(path: ObjectPath, callExpression: CallExpression | Property) {
		return this.setIn(
			[OptionTypes.RETURN_EXPRESSIONS_ACCESSED_AT_PATH, callExpression, ...path, RESULT_KEY],
			true
		);
	}

	addAssignedNodeAtPath(path: ObjectPath, node: WritableEntity) {
		return this.setIn([OptionTypes.ASSIGNED_NODES, node, ...path, RESULT_KEY], true);
	}

	addAssignedReturnExpressionAtPath(path: ObjectPath, callExpression: CallExpression | Property) {
		return this.setIn(
			[OptionTypes.RETURN_EXPRESSIONS_ASSIGNED_AT_PATH, callExpression, ...path, RESULT_KEY],
			true
		);
	}

	addCalledNodeAtPathWithOptions(
		path: ObjectPath,
		node: ExpressionEntity,
		callOptions: CallOptions
	) {
		return this.setIn(
			[OptionTypes.NODES_CALLED_AT_PATH_WITH_OPTIONS, node, ...path, RESULT_KEY, callOptions],
			true
		);
	}

	addCalledReturnExpressionAtPath(path: ObjectPath, callExpression: CallExpression | Property) {
		return this.setIn(
			[OptionTypes.RETURN_EXPRESSIONS_CALLED_AT_PATH, callExpression, ...path, RESULT_KEY],
			true
		);
	}

	getArgumentsVariables(): ExpressionEntity[] {
		return <ExpressionEntity[]>(this.get(OptionTypes.ARGUMENTS_VARIABLES) || []);
	}

	getHasEffectsWhenCalledOptions() {
		return this.setIgnoreReturnAwaitYield()
			.setIgnoreBreakStatements(false)
			.setIgnoreNoLabels();
	}

	getReplacedVariableInit(variable: ThisVariable | ParameterVariable): ExpressionEntity {
		return this.optionValues.getIn([OptionTypes.REPLACED_VARIABLE_INITS, variable]);
	}

	hasNodeBeenAccessedAtPath(path: ObjectPath, node: ExpressionEntity): boolean {
		return this.optionValues.getIn([OptionTypes.ACCESSED_NODES, node, ...path, RESULT_KEY]);
	}

	hasNodeBeenAssignedAtPath(path: ObjectPath, node: WritableEntity): boolean {
		return this.optionValues.getIn([OptionTypes.ASSIGNED_NODES, node, ...path, RESULT_KEY]);
	}

	hasNodeBeenCalledAtPathWithOptions(
		path: ObjectPath,
		node: ExpressionEntity,
		callOptions: CallOptions
	): boolean {
		const previousCallOptions = this.optionValues.getIn([
			OptionTypes.NODES_CALLED_AT_PATH_WITH_OPTIONS,
			node,
			...path,
			RESULT_KEY
		]);
		return (
			previousCallOptions &&
			previousCallOptions.find((_: any, otherCallOptions: CallOptions) =>
				otherCallOptions.equals(callOptions)
			)
		);
	}

	hasReturnExpressionBeenAccessedAtPath(
		path: ObjectPath,
		callExpression: CallExpression | Property
	): boolean {
		return this.optionValues.getIn([
			OptionTypes.RETURN_EXPRESSIONS_ACCESSED_AT_PATH,
			callExpression,
			...path,
			RESULT_KEY
		]);
	}

	hasReturnExpressionBeenAssignedAtPath(
		path: ObjectPath,
		callExpression: CallExpression | Property
	): boolean {
		return this.optionValues.getIn([
			OptionTypes.RETURN_EXPRESSIONS_ASSIGNED_AT_PATH,
			callExpression,
			...path,
			RESULT_KEY
		]);
	}

	hasReturnExpressionBeenCalledAtPath(
		path: ObjectPath,
		callExpression: CallExpression | Property
	): boolean {
		return this.optionValues.getIn([
			OptionTypes.RETURN_EXPRESSIONS_CALLED_AT_PATH,
			callExpression,
			...path,
			RESULT_KEY
		]);
	}

	ignoreBreakStatements() {
		return this.get(OptionTypes.IGNORE_BREAK_STATEMENTS);
	}

	ignoreLabel(labelName: string) {
		return this.optionValues.getIn([OptionTypes.IGNORED_LABELS, labelName]);
	}

	ignoreReturnAwaitYield() {
		return this.get(OptionTypes.IGNORE_RETURN_AWAIT_YIELD);
	}

	replaceVariableInit(variable: ThisVariable | ParameterVariable, init: ExpressionEntity) {
		return this.setIn([OptionTypes.REPLACED_VARIABLE_INITS, variable], init);
	}

	setArgumentsVariables(variables: ExpressionEntity[]) {
		return this.set(OptionTypes.ARGUMENTS_VARIABLES, variables);
	}

	setIgnoreBreakStatements(value = true) {
		return this.set(OptionTypes.IGNORE_BREAK_STATEMENTS, value);
	}

	setIgnoreLabel(labelName: string) {
		return this.setIn([OptionTypes.IGNORED_LABELS, labelName], true);
	}

	setIgnoreNoLabels() {
		return this.remove(OptionTypes.IGNORED_LABELS);
	}

	setIgnoreReturnAwaitYield(value = true) {
		return this.set(OptionTypes.IGNORE_RETURN_AWAIT_YIELD, value);
	}
}
