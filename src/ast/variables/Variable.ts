import ExternalModule from '../../ExternalModule';
import Module from '../../Module';
import CallOptions from '../CallOptions';
import { DeoptimizableEntity } from '../DeoptimizableEntity';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import Identifier from '../nodes/Identifier';
import { ExpressionEntity } from '../nodes/shared/Expression';
import { ImmutableEntityPathTracker } from '../utils/ImmutableEntityPathTracker';
import { LiteralValueOrUnknown, ObjectPath, UNKNOWN_EXPRESSION, UNKNOWN_VALUE } from '../values';

export default class Variable implements ExpressionEntity {
	exportName: string | null = null;
	included = false;
	isDefault?: boolean;
	isExternal?: boolean;
	isId = false;
	isNamespace?: boolean;
	isReassigned = false;
	module: Module | ExternalModule | null;
	name: string;
	reexported = false;
	renderBaseName: string | null = null;
	renderName: string | null = null;
	safeExportName: string | null = null;

	constructor(name: string) {
		this.name = name;
	}

	/**
	 * Binds identifiers that reference this variable to this variable.
	 * Necessary to be able to change variable names.
	 */
	addReference(_identifier: Identifier) {}

	deoptimizePath(_path: ObjectPath) {}

	getBaseVariableName(): string {
		return this.renderBaseName || this.renderName || this.name;
	}

	getLiteralValueAtPath(
		_path: ObjectPath,
		_recursionTracker: ImmutableEntityPathTracker,
		_origin: DeoptimizableEntity
	): LiteralValueOrUnknown {
		return UNKNOWN_VALUE;
	}

	getName(): string {
		const name = this.renderName || this.name;
		return this.renderBaseName ? `${this.renderBaseName}.${name}` : name;
	}

	getReturnExpressionWhenCalledAtPath(
		_path: ObjectPath,
		_recursionTracker: ImmutableEntityPathTracker,
		_origin: DeoptimizableEntity
	): ExpressionEntity {
		return UNKNOWN_EXPRESSION;
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, _options: ExecutionPathOptions) {
		return path.length > 0;
	}

	hasEffectsWhenAssignedAtPath(_path: ObjectPath, _options: ExecutionPathOptions) {
		return true;
	}

	hasEffectsWhenCalledAtPath(
		_path: ObjectPath,
		_callOptions: CallOptions,
		_options: ExecutionPathOptions
	) {
		return true;
	}

	/**
	 * Marks this variable as being part of the bundle, which is usually the case when one of
	 * its identifiers becomes part of the bundle. Returns true if it has not been included
	 * previously.
	 * Once a variable is included, it should take care all its declarations are included.
	 */
	include() {
		this.included = true;
	}

	setRenderNames(baseName: string | null, name: string | null) {
		this.renderBaseName = baseName;
		this.renderName = name;
	}

	setSafeName(name: string | null) {
		this.renderName = name;
	}

	toString() {
		return this.name;
	}
}
