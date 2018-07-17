import CallOptions from '../CallOptions';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import Identifier from '../nodes/Identifier';
import { ExpressionEntity } from '../nodes/shared/Expression';
import { EntityPathTracker } from '../utils/EntityPathTracker';
import { LiteralValueOrUnknown, ObjectPath, UNKNOWN_EXPRESSION, UNKNOWN_VALUE } from '../values';
import LocalVariable from './LocalVariable';

export default class ReplaceableInitializationVariable extends LocalVariable {
	constructor(
		name: string,
		declarator: Identifier | null,
		deoptimizationTracker: EntityPathTracker
	) {
		super(name, declarator, null, deoptimizationTracker);
	}

	getLiteralValueAtPath(): LiteralValueOrUnknown {
		return UNKNOWN_VALUE;
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, options: ExecutionPathOptions) {
		return (
			this._getInit(options).hasEffectsWhenAccessedAtPath(path, options) ||
			super.hasEffectsWhenAccessedAtPath(path, options)
		);
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, options: ExecutionPathOptions) {
		return (
			this._getInit(options).hasEffectsWhenAssignedAtPath(path, options) ||
			super.hasEffectsWhenAssignedAtPath(path, options)
		);
	}

	hasEffectsWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		options: ExecutionPathOptions
	) {
		return (
			this._getInit(options).hasEffectsWhenCalledAtPath(path, callOptions, options) ||
			super.hasEffectsWhenCalledAtPath(path, callOptions, options)
		);
	}

	_getInit(options: ExecutionPathOptions): ExpressionEntity {
		return options.getReplacedVariableInit(this) || UNKNOWN_EXPRESSION;
	}
}
