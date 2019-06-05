import MagicString from 'magic-string';
import { RenderOptions } from '../../utils/renderHelpers';
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
	UNKNOWN_EXPRESSION,
	UNKNOWN_KEY,
	UNKNOWN_VALUE
} from '../values';
import * as NodeType from './NodeType';
import { ExpressionEntity } from './shared/Expression';
import { ExpressionNode, NodeBase } from './shared/Node';

export default class Property extends NodeBase implements DeoptimizableEntity {
	computed!: boolean;
	key!: ExpressionNode;
	kind!: 'init' | 'get' | 'set';
	method!: boolean;
	shorthand!: boolean;
	type!: NodeType.tProperty;
	value!: ExpressionNode;

	private accessorCallOptions!: CallOptions;
	private declarationInit: ExpressionEntity | null = null;
	private returnExpression: ExpressionEntity | null = null;

	bind() {
		super.bind();
		if (this.kind === 'get' && this.returnExpression === null) this.updateReturnExpression();
		if (this.declarationInit !== null) {
			this.declarationInit.deoptimizePath([UNKNOWN_KEY, UNKNOWN_KEY]);
		}
	}

	declare(kind: string, init: ExpressionEntity) {
		this.declarationInit = init;
		return this.value.declare(kind, UNKNOWN_EXPRESSION);
	}

	deoptimizeCache() {
		// As getter properties directly receive their values from function expressions that always
		// have a fixed return value, there is no known situation where a getter is deoptimized.
		throw new Error('Unexpected deoptimization');
	}

	deoptimizePath(path: ObjectPath) {
		if (this.kind === 'get') {
			if (path.length > 0) {
				if (this.returnExpression === null) this.updateReturnExpression();
				(this.returnExpression as ExpressionEntity).deoptimizePath(path);
			}
		} else if (this.kind !== 'set') {
			this.value.deoptimizePath(path);
		}
	}

	getLiteralValueAtPath(
		path: ObjectPath,
		recursionTracker: ImmutableEntityPathTracker,
		origin: DeoptimizableEntity
	): LiteralValueOrUnknown {
		if (this.kind === 'set') {
			return UNKNOWN_VALUE;
		}
		if (this.kind === 'get') {
			if (this.returnExpression === null) this.updateReturnExpression();
			return (this.returnExpression as ExpressionEntity).getLiteralValueAtPath(
				path,
				recursionTracker,
				origin
			);
		}
		return this.value.getLiteralValueAtPath(path, recursionTracker, origin);
	}

	getReturnExpressionWhenCalledAtPath(
		path: ObjectPath,
		recursionTracker: ImmutableEntityPathTracker,
		origin: DeoptimizableEntity
	): ExpressionEntity {
		if (this.kind === 'set') {
			return UNKNOWN_EXPRESSION;
		}
		if (this.kind === 'get') {
			if (this.returnExpression === null) this.updateReturnExpression();
			return (this.returnExpression as ExpressionEntity).getReturnExpressionWhenCalledAtPath(
				path,
				recursionTracker,
				origin
			);
		}
		return this.value.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
	}

	hasEffects(options: ExecutionPathOptions): boolean {
		return this.key.hasEffects(options) || this.value.hasEffects(options);
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		if (this.kind === 'get') {
			return (
				this.value.hasEffectsWhenCalledAtPath(
					EMPTY_PATH,
					this.accessorCallOptions,
					options.getHasEffectsWhenCalledOptions()
				) ||
				(path.length > 0 &&
					(this.returnExpression as ExpressionEntity).hasEffectsWhenAccessedAtPath(path, options))
			);
		}
		return this.value.hasEffectsWhenAccessedAtPath(path, options);
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		if (this.kind === 'get') {
			return (
				path.length === 0 ||
				(this.returnExpression as ExpressionEntity).hasEffectsWhenAssignedAtPath(path, options)
			);
		}
		if (this.kind === 'set') {
			return (
				path.length > 0 ||
				this.value.hasEffectsWhenCalledAtPath(
					EMPTY_PATH,
					this.accessorCallOptions,
					options.getHasEffectsWhenCalledOptions()
				)
			);
		}
		return this.value.hasEffectsWhenAssignedAtPath(path, options);
	}

	hasEffectsWhenCalledAtPath(
		path: ObjectPath,
		callOptions: CallOptions,
		options: ExecutionPathOptions
	) {
		if (this.kind === 'get') {
			return (this.returnExpression as ExpressionEntity).hasEffectsWhenCalledAtPath(
				path,
				callOptions,
				options
			);
		}
		return this.value.hasEffectsWhenCalledAtPath(path, callOptions, options);
	}

	initialise() {
		this.accessorCallOptions = CallOptions.create({
			callIdentifier: this,
			withNew: false
		});
	}

	render(code: MagicString, options: RenderOptions) {
		if (!this.shorthand) {
			this.key.render(code, options);
		}
		this.value.render(code, options, { isShorthandProperty: this.shorthand });
	}

	private updateReturnExpression() {
		this.returnExpression = UNKNOWN_EXPRESSION;
		this.returnExpression = this.value.getReturnExpressionWhenCalledAtPath(
			EMPTY_PATH,
			EMPTY_IMMUTABLE_TRACKER,
			this
		);
	}
}
