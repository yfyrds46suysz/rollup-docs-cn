/// <reference path="./ExecutionPathOptions.d.ts" />

import Immutable from 'immutable/dist/immutable.js';
import { Map } from 'immutable';
import Node from './Node';
import CallExpression from './nodes/CallExpression';
import Property from './nodes/Property';
import CallOptions from './CallOptions';
import ThisVariable from './variables/ThisVariable';
import ParameterVariable from './variables/ParameterVariable';
import Variable from './variables/Variable';
import { UnknownAssignment } from './values';
import { ObjectPath } from './variables/VariableReassignmentTracker';

const OPTION_IGNORED_LABELS = 'IGNORED_LABELS';
const OPTION_ACCESSED_NODES = 'ACCESSED_NODES';
const OPTION_ARGUMENTS_VARIABLES = 'ARGUMENTS_VARIABLES';
const OPTION_ASSIGNED_NODES = 'ASSIGNED_NODES';
const OPTION_IGNORE_BREAK_STATEMENTS = 'IGNORE_BREAK_STATEMENTS';
const OPTION_IGNORE_RETURN_AWAIT_YIELD = 'IGNORE_RETURN_AWAIT_YIELD';
const OPTION_NODES_CALLED_AT_PATH_WITH_OPTIONS =
	'NODES_CALLED_AT_PATH_WITH_OPTIONS';
const OPTION_REPLACED_VARIABLE_INITS = 'REPLACED_VARIABLE_INITS';
const OPTION_RETURN_EXPRESSIONS_ACCESSED_AT_PATH =
	'RETURN_EXPRESSIONS_ACCESSED_AT_PATH';
const OPTION_RETURN_EXPRESSIONS_ASSIGNED_AT_PATH =
	'RETURN_EXPRESSIONS_ASSIGNED_AT_PATH';
const OPTION_RETURN_EXPRESSIONS_CALLED_AT_PATH =
	'RETURN_EXPRESSIONS_CALLED_AT_PATH';

export type RESULT_KEY = {};
export const RESULT_KEY: RESULT_KEY = {};

/** Wrapper to ensure immutability */
export default class ExecutionPathOptions {
	_optionValues: Map<string, Node | Variable>;

	/**
	 * @returns {ExecutionPathOptions}
	 */
	static create () {
		return new this(<Map<string, any>>Immutable.Map());
	}

	constructor (optionValues: Map<string, any>) {
		this._optionValues = optionValues;
	}

	/**
	 * @param {string} option - The name of an option
	 * @returns {*} Its value
	 */
	get (option: string) {
		return this._optionValues.get(option);
	}

	/**
	 * Returns a new ExecutionPathOptions instance with the given option removed.
	 * Does not mutate the current instance. Also works in sub-classes.
	 * @param {string} option - The name of an option
	 * @returns {*} Its value
	 */
	remove (option: string) {
		return new ExecutionPathOptions(this._optionValues.remove(option));
	}

	/**
	 * Returns a new ExecutionPathOptions instance with the given option set to a new value.
	 * Does not mutate the current instance. Also works in sub-classes.
	 * @param {string} option - The name of an option
	 * @param {*} value - The new value of the option
	 * @returns {ExecutionPathOptions} A new options instance
	 */
	set (option: string, value: any) {
		return new ExecutionPathOptions(this._optionValues.set(option, value));
	}

	setIn (optionPath: (string | Node | Variable | RESULT_KEY)[], value: any) {
		return new ExecutionPathOptions(this._optionValues.setIn(optionPath, value));
	}

	/**
	 * @param {String[]} path
	 * @param {Node} node
	 * @return {ExecutionPathOptions}
	 */
	addAccessedNodeAtPath (path: ObjectPath, node: Node | UnknownAssignment) {
		return this.setIn([OPTION_ACCESSED_NODES, node, ...path, RESULT_KEY], true);
	}

	/**
	 * @param {String[]} path
	 * @param {CallExpression|Property} callExpression
	 * @return {ExecutionPathOptions}
	 */
	addAccessedReturnExpressionAtPath (path: ObjectPath, callExpression: CallExpression | Property) {
		return this.setIn(
			[
				OPTION_RETURN_EXPRESSIONS_ACCESSED_AT_PATH,
				callExpression,
				...path,
				RESULT_KEY
			],
			true
		);
	}

	/**
	 * @param {String[]} path
	 * @param {Node} node
	 * @return {ExecutionPathOptions}
	 */
	addAssignedNodeAtPath (path: ObjectPath, node: Node | Variable | UnknownAssignment) {
		return this.setIn([OPTION_ASSIGNED_NODES, node, ...path, RESULT_KEY], true);
	}

	/**
	 * @param {String[]} path
	 * @param {CallExpression|Property} callExpression
	 * @return {ExecutionPathOptions}
	 */
	addAssignedReturnExpressionAtPath (path: ObjectPath, callExpression: CallExpression | Property) {
		return this.setIn(
			[
				OPTION_RETURN_EXPRESSIONS_ASSIGNED_AT_PATH,
				callExpression,
				...path,
				RESULT_KEY
			],
			true
		);
	}

	/**
	 * @param {String[]} path
	 * @param {Node} node
	 * @param {CallOptions} callOptions
	 * @return {ExecutionPathOptions}
	 */
	addCalledNodeAtPathWithOptions (path: ObjectPath, node: Node | UnknownAssignment, callOptions: CallOptions) {
		return this.setIn(
			[
				OPTION_NODES_CALLED_AT_PATH_WITH_OPTIONS,
				node,
				...path,
				RESULT_KEY,
				callOptions
			],
			true
		);
	}

	/**
	 * @param {String[]} path
	 * @param {CallExpression|Property} callExpression
	 * @return {ExecutionPathOptions}
	 */
	addCalledReturnExpressionAtPath (path: ObjectPath, callExpression: CallExpression | Property) {
		return this.setIn(
			[
				OPTION_RETURN_EXPRESSIONS_CALLED_AT_PATH,
				callExpression,
				...path,
				RESULT_KEY
			],
			true
		);
	}

	/**
	 * @return {ParameterVariable[]}
	 */
	getArgumentsVariables (): ParameterVariable[] {
		return <ParameterVariable[]>(this.get(OPTION_ARGUMENTS_VARIABLES) || []);
	}

	/**
	 * @return {ExecutionPathOptions}
	 */
	getHasEffectsWhenCalledOptions () {
		return this.setIgnoreReturnAwaitYield()
			.setIgnoreBreakStatements(false)
			.setIgnoreNoLabels();
	}

	/**
	 * @param {ThisVariable|ParameterVariable} variable
	 * @returns {Node}
	 */
	getReplacedVariableInit (variable: ThisVariable | ParameterVariable): Node {
		return this._optionValues.getIn([OPTION_REPLACED_VARIABLE_INITS, variable]);
	}

	/**
	 * @param {String[]} path
	 * @param {Node} node
	 * @return {boolean}
	 */
	hasNodeBeenAccessedAtPath (path: ObjectPath, node: Node | Variable | UnknownAssignment): boolean {
		return this._optionValues.getIn([
			OPTION_ACCESSED_NODES,
			node,
			...path,
			RESULT_KEY
		]);
	}

	/**
	 * @param {String[]} path
	 * @param {Node} node
	 * @return {boolean}
	 */
	hasNodeBeenAssignedAtPath (path: ObjectPath, node: Node | Variable | UnknownAssignment): boolean {
		return this._optionValues.getIn([
			OPTION_ASSIGNED_NODES,
			node,
			...path,
			RESULT_KEY
		]);
	}

	/**
	 * @param {String[]} path
	 * @param {Node} node
	 * @param {CallOptions} callOptions
	 * @return {boolean}
	 */
	hasNodeBeenCalledAtPathWithOptions (
		path: ObjectPath, node: Node | UnknownAssignment, callOptions: CallOptions): boolean {
		const previousCallOptions = this._optionValues.getIn([
			OPTION_NODES_CALLED_AT_PATH_WITH_OPTIONS,
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

	/**
	 * @param {String[]} path
	 * @param {CallExpression|Property} callExpression
	 * @return {boolean}
	 */
	hasReturnExpressionBeenAccessedAtPath (path: ObjectPath, callExpression: CallExpression | Property): boolean {
		return this._optionValues.getIn([
			OPTION_RETURN_EXPRESSIONS_ACCESSED_AT_PATH,
			callExpression,
			...path,
			RESULT_KEY
		]);
	}

	/**
	 * @param {String[]} path
	 * @param {CallExpression|Property} callExpression
	 * @return {boolean}
	 */
	hasReturnExpressionBeenAssignedAtPath (path: ObjectPath, callExpression: CallExpression | Property): boolean {
		return this._optionValues.getIn([
			OPTION_RETURN_EXPRESSIONS_ASSIGNED_AT_PATH,
			callExpression,
			...path,
			RESULT_KEY
		]);
	}

	/**
	 * @param {String[]} path
	 * @param {CallExpression|Property} callExpression
	 * @return {boolean}
	 */
	hasReturnExpressionBeenCalledAtPath (path: ObjectPath, callExpression: CallExpression | Property): boolean {
		return this._optionValues.getIn([
			OPTION_RETURN_EXPRESSIONS_CALLED_AT_PATH,
			callExpression,
			...path,
			RESULT_KEY
		]);
	}

	/**
	 * @return {boolean}
	 */
	ignoreBreakStatements () {
		return this.get(OPTION_IGNORE_BREAK_STATEMENTS);
	}

	/**
	 * @param {string} labelName
	 * @return {boolean}
	 */
	ignoreLabel (labelName: string) {
		return this._optionValues.getIn([OPTION_IGNORED_LABELS, labelName]);
	}

	/**
	 * @return {boolean}
	 */
	ignoreReturnAwaitYield () {
		return this.get(OPTION_IGNORE_RETURN_AWAIT_YIELD);
	}

	/**
	 * @param {ThisVariable|ParameterVariable} variable
	 * @param {Node} init
	 * @return {ExecutionPathOptions}
	 */
	replaceVariableInit (variable: ThisVariable | ParameterVariable, init: Node | UnknownAssignment) {
		return this.setIn([OPTION_REPLACED_VARIABLE_INITS, variable], init);
	}

	/**
	 * @param {ParameterVariable[]} variables
	 * @return {ExecutionPathOptions}
	 */
	setArgumentsVariables (variables: (ParameterVariable | Node)[]) {
		return this.set(OPTION_ARGUMENTS_VARIABLES, variables);
	}

	/**
	 * @param {boolean} [value=true]
	 * @return {ExecutionPathOptions}
	 */
	setIgnoreBreakStatements (value = true) {
		return this.set(OPTION_IGNORE_BREAK_STATEMENTS, value);
	}

	/**
	 * @param {string} labelName
	 * @return {ExecutionPathOptions}
	 */
	setIgnoreLabel (labelName: string) {
		return this.setIn([OPTION_IGNORED_LABELS, labelName], true);
	}

	/**
	 * @return {ExecutionPathOptions}
	 */
	setIgnoreNoLabels () {
		return this.remove(OPTION_IGNORED_LABELS);
	}

	/**
	 * @param {boolean} [value=true]
	 * @return {ExecutionPathOptions}
	 */
	setIgnoreReturnAwaitYield (value = true) {
		return this.set(OPTION_IGNORE_RETURN_AWAIT_YIELD, value);
	}
}
