import MagicString from 'magic-string';
import { BLANK } from '../../utils/blank';
import relativeId from '../../utils/relativeId';
import { NodeRenderOptions, RenderOptions } from '../../utils/renderHelpers';
import CallOptions from '../CallOptions';
import { DeoptimizableEntity } from '../DeoptimizableEntity';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import {
	EMPTY_IMMUTABLE_TRACKER,
	ImmutableEntityPathTracker
} from '../utils/ImmutableEntityPathTracker';
import {
	EMPTY_PATH,
	LiteralValueOrUnknown,
	ObjectPath,
	ObjectPathKey,
	UNKNOWN_KEY,
	UNKNOWN_VALUE
} from '../values';
import ExternalVariable from '../variables/ExternalVariable';
import NamespaceVariable from '../variables/NamespaceVariable';
import Variable from '../variables/Variable';
import Identifier from './Identifier';
import Literal from './Literal';
import * as NodeType from './NodeType';
import { ExpressionNode, Node, NodeBase } from './shared/Node';

function getResolvablePropertyKey(memberExpression: MemberExpression): string | null {
	return memberExpression.computed
		? getResolvableComputedPropertyKey(memberExpression.property)
		: (<Identifier>memberExpression.property).name;
}

function getResolvableComputedPropertyKey(propertyKey: ExpressionNode): string | null {
	if (propertyKey instanceof Literal) {
		return String(propertyKey.value);
	}
	return null;
}

type PathWithPositions = { key: string; pos: number }[];

function getPathIfNotComputed(memberExpression: MemberExpression): PathWithPositions | null {
	const nextPathKey = memberExpression.propertyKey;
	const object = memberExpression.object;
	if (typeof nextPathKey === 'string') {
		if (object instanceof Identifier) {
			return [
				{ key: object.name, pos: object.start },
				{ key: nextPathKey, pos: memberExpression.property.start }
			];
		}
		if (isMemberExpression(object)) {
			const parentPath = getPathIfNotComputed(object);
			return (
				parentPath && [...parentPath, { key: nextPathKey, pos: memberExpression.property.start }]
			);
		}
	}
	return null;
}

export function isMemberExpression(node: Node): node is MemberExpression {
	return node.type === NodeType.MemberExpression;
}

export default class MemberExpression extends NodeBase implements DeoptimizableEntity {
	type: NodeType.tMemberExpression;
	object: ExpressionNode;
	property: ExpressionNode;
	computed: boolean;

	propertyKey: ObjectPathKey | null;
	variable: Variable = null;
	private bound: boolean;
	private replacement: string | null;
	private expressionsToBeDeoptimized: DeoptimizableEntity[];

	bind() {
		if (this.bound) return;
		this.bound = true;
		const path = getPathIfNotComputed(this);
		const baseVariable = path && this.scope.findVariable(path[0].key);
		if (baseVariable && baseVariable.isNamespace) {
			const resolvedVariable = this.resolveNamespaceVariables(baseVariable, path.slice(1));
			if (!resolvedVariable) {
				super.bind();
			} else if (typeof resolvedVariable === 'string') {
				this.replacement = resolvedVariable;
			} else {
				if (resolvedVariable.isExternal && (<ExternalVariable>resolvedVariable).module) {
					(<ExternalVariable>resolvedVariable).module.suggestName(path[0].key);
				}
				this.variable = resolvedVariable;
			}
		} else {
			super.bind();
			if (this.propertyKey === null) this.analysePropertyKey();
		}
	}

	deoptimizeCache() {
		for (const expression of this.expressionsToBeDeoptimized) {
			expression.deoptimizeCache();
		}
	}

	getLiteralValueAtPath(
		path: ObjectPath,
		recursionTracker: ImmutableEntityPathTracker,
		origin: DeoptimizableEntity
	): LiteralValueOrUnknown {
		if (this.variable !== null) {
			return this.variable.getLiteralValueAtPath(path, recursionTracker, origin);
		}
		if (this.propertyKey === null) this.analysePropertyKey();
		this.expressionsToBeDeoptimized.push(origin);
		return this.object.getLiteralValueAtPath([this.propertyKey, ...path], recursionTracker, origin);
	}

	getReturnExpressionWhenCalledAtPath(
		path: ObjectPath,
		recursionTracker: ImmutableEntityPathTracker,
		origin: DeoptimizableEntity
	) {
		if (this.variable !== null) {
			return this.variable.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
		}
		if (this.propertyKey === null) this.analysePropertyKey();
		this.expressionsToBeDeoptimized.push(origin);
		return this.object.getReturnExpressionWhenCalledAtPath(
			[this.propertyKey, ...path],
			recursionTracker,
			origin
		);
	}

	hasEffects(options: ExecutionPathOptions): boolean {
		return (
			this.property.hasEffects(options) ||
			this.object.hasEffects(options) ||
			(this.context.propertyReadSideEffects &&
				this.object.hasEffectsWhenAccessedAtPath([this.propertyKey], options))
		);
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		if (path.length === 0) {
			return false;
		}
		if (this.variable !== null) {
			return this.variable.hasEffectsWhenAccessedAtPath(path, options);
		}
		return this.object.hasEffectsWhenAccessedAtPath([this.propertyKey, ...path], options);
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		if (this.variable !== null) {
			return this.variable.hasEffectsWhenAssignedAtPath(path, options);
		}
		return this.object.hasEffectsWhenAssignedAtPath([this.propertyKey, ...path], options);
	}

	hasEffectsWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		options: ExecutionPathOptions
	): boolean {
		if (this.variable !== null) {
			return this.variable.hasEffectsWhenCalledAtPath(path, callOptions, options);
		}
		return this.object.hasEffectsWhenCalledAtPath(
			[this.propertyKey, ...path],
			callOptions,
			options
		);
	}

	include() {
		if (!this.included) {
			this.included = true;
			if (this.variable !== null && !this.variable.included) {
				this.variable.include();
				this.context.requestTreeshakingPass();
			}
		}
		this.object.include();
		this.property.include();
	}

	initialise() {
		this.included = false;
		this.propertyKey = getResolvablePropertyKey(this);
		this.variable = null;
		this.bound = false;
		this.replacement = null;
		this.expressionsToBeDeoptimized = [];
	}

	deoptimizePath(path: ObjectPath) {
		if (!this.bound) this.bind();
		if (path.length === 0) this.disallowNamespaceReassignment();
		if (this.variable) {
			this.variable.deoptimizePath(path);
		} else {
			if (this.propertyKey === null) this.analysePropertyKey();
			this.object.deoptimizePath([this.propertyKey, ...path]);
		}
	}

	render(
		code: MagicString,
		options: RenderOptions,
		{ renderedParentType, isCalleeOfRenderedParent }: NodeRenderOptions = BLANK
	) {
		const isCalleeOfDifferentParent =
			renderedParentType === NodeType.CallExpression && isCalleeOfRenderedParent;
		if (this.variable || this.replacement) {
			let replacement = this.variable ? this.variable.getName() : this.replacement;
			if (isCalleeOfDifferentParent) replacement = '0, ' + replacement;
			code.overwrite(this.start, this.end, replacement, {
				storeName: true,
				contentOnly: true
			});
		} else {
			if (isCalleeOfDifferentParent) {
				code.appendRight(this.start, '0, ');
			}
			super.render(code, options);
		}
	}

	private disallowNamespaceReassignment() {
		if (
			this.object instanceof Identifier &&
			this.scope.findVariable(this.object.name).isNamespace
		) {
			this.context.error(
				{
					code: 'ILLEGAL_NAMESPACE_REASSIGNMENT',
					message: `Illegal reassignment to import '${this.object.name}'`
				},
				this.start
			);
		}
	}

	private resolveNamespaceVariables(
		baseVariable: Variable,
		path: PathWithPositions
	): Variable | string | null {
		if (path.length === 0) return baseVariable;
		if (!baseVariable.isNamespace) return null;
		const exportName = path[0].key;
		const variable = baseVariable.isExternal
			? (<ExternalVariable>baseVariable).module.traceExport(exportName)
			: (<NamespaceVariable>baseVariable).context.traceExport(exportName);
		if (!variable) {
			const fileName = baseVariable.isExternal
				? (<ExternalVariable>baseVariable).module.id
				: (<NamespaceVariable>baseVariable).context.fileName;
			this.context.warn(
				{
					code: 'MISSING_EXPORT',
					missing: exportName,
					importer: relativeId(this.context.fileName),
					exporter: relativeId(fileName),
					message: `'${exportName}' is not exported by '${relativeId(fileName)}'`,
					url: `https://github.com/rollup/rollup/wiki/Troubleshooting#name-is-not-exported-by-module`
				},
				path[0].pos
			);
			return 'undefined';
		}
		return this.resolveNamespaceVariables(variable, path.slice(1));
	}

	private analysePropertyKey() {
		this.propertyKey = UNKNOWN_KEY;
		const value = this.property.getLiteralValueAtPath(EMPTY_PATH, EMPTY_IMMUTABLE_TRACKER, this);
		this.propertyKey = value === UNKNOWN_VALUE ? UNKNOWN_KEY : String(value);
	}
}
