import { locate } from 'locate-character';
import MagicString from 'magic-string';
import { AstContext, CommentDescription } from '../../../Module';
import { NodeRenderOptions, RenderOptions } from '../../../utils/renderHelpers';
import CallOptions from '../../CallOptions';
import { DeoptimizableEntity } from '../../DeoptimizableEntity';
import { Entity } from '../../Entity';
import { ExecutionPathOptions } from '../../ExecutionPathOptions';
import { getAndCreateKeys, keys } from '../../keys';
import ChildScope from '../../scopes/ChildScope';
import { ImmutableEntityPathTracker } from '../../utils/ImmutableEntityPathTracker';
import { LiteralValueOrUnknown, ObjectPath, UNKNOWN_EXPRESSION, UNKNOWN_VALUE } from '../../values';
import Variable from '../../variables/Variable';
import { ExpressionEntity } from './Expression';

export interface GenericEsTreeNode {
	type: string;
	[key: string]: any;
}

export interface Node extends Entity {
	annotations?: CommentDescription[];
	context: AstContext;
	end: number;
	included: boolean;
	keys: string[];
	needsBoundaries?: boolean;
	parent: Node | { type?: string };
	preventChildBlockScope?: boolean;
	start: number;
	type: string;
	variable?: Variable | null;

	/**
	 * Called once all nodes have been initialised and the scopes have been populated.
	 */
	bind(): void;

	/**
	 * Declare a new variable with the optional initialisation.
	 */
	declare(kind: string, init: ExpressionEntity | null): void;

	/**
	 * Determine if this Node would have an effect on the bundle.
	 * This is usually true for already included nodes. Exceptions are e.g. break statements
	 * which only have an effect if their surrounding loop or switch statement is included.
	 * The options pass on information like this about the current execution path.
	 */
	hasEffects(options: ExecutionPathOptions): boolean;

	/**
	 * Includes the node in the bundle. If the flag is not set, children are usually included
	 * if they are necessary for this node (e.g. a function body) or if they have effects.
	 * Necessary variables need to be included as well.
	 */
	include(includeAllChildrenRecursively: boolean): void;

	/**
	 * Alternative version of include to override the default behaviour of
	 * declarations to only include nodes for declarators that have an effect. Necessary
	 * for for-loops that do not use a declared loop variable.
	 */
	includeWithAllDeclaredVariables(includeAllChildrenRecursively: boolean): void;
	render(code: MagicString, options: RenderOptions, nodeRenderOptions?: NodeRenderOptions): void;

	/**
	 * Start a new execution path to determine if this node has an effect on the bundle and
	 * should therefore be included. Included nodes should always be included again in subsequent
	 * visits as the inclusion of additional variables may require the inclusion of more child
	 * nodes in e.g. block statements.
	 */
	shouldBeIncluded(): boolean;
}

export interface StatementNode extends Node {}

export interface ExpressionNode extends ExpressionEntity, Node {}

const NEW_EXECUTION_PATH = ExecutionPathOptions.create();

export class NodeBase implements ExpressionNode {
	context: AstContext;
	end: number;
	included: boolean;
	keys: string[];
	parent: Node | { context: AstContext; type: string };
	scope: ChildScope;
	start: number;
	type: string;

	constructor(
		esTreeNode: GenericEsTreeNode,
		parent: Node | { context: AstContext; type: string },
		parentScope: ChildScope
	) {
		this.keys = keys[esTreeNode.type] || getAndCreateKeys(esTreeNode);
		this.parent = parent;
		this.context = parent.context;
		this.createScope(parentScope);
		this.parseNode(esTreeNode);
		this.initialise();
		this.context.magicString.addSourcemapLocation(this.start);
		this.context.magicString.addSourcemapLocation(this.end);
	}

	/**
	 * Override this to bind assignments to variables and do any initialisations that
	 * require the scopes to be populated with variables.
	 */
	bind() {
		for (const key of this.keys) {
			const value = (this as GenericEsTreeNode)[key];
			if (value === null || key === 'annotations') continue;
			if (Array.isArray(value)) {
				for (const child of value) {
					if (child !== null) child.bind();
				}
			} else {
				value.bind();
			}
		}
	}

	/**
	 * Override if this node should receive a different scope than the parent scope.
	 */
	createScope(parentScope: ChildScope) {
		this.scope = parentScope;
	}

	declare(_kind: string, _init: ExpressionEntity | null) {}

	deoptimizePath(_path: ObjectPath) {}

	getLiteralValueAtPath(
		_path: ObjectPath,
		_recursionTracker: ImmutableEntityPathTracker,
		_origin: DeoptimizableEntity
	): LiteralValueOrUnknown {
		return UNKNOWN_VALUE;
	}

	getReturnExpressionWhenCalledAtPath(
		_path: ObjectPath,
		_recursionTracker: ImmutableEntityPathTracker,
		_origin: DeoptimizableEntity
	): ExpressionEntity {
		return UNKNOWN_EXPRESSION;
	}

	hasEffects(options: ExecutionPathOptions): boolean {
		for (const key of this.keys) {
			const value = (this as GenericEsTreeNode)[key];
			if (value === null || key === 'annotations') continue;
			if (Array.isArray(value)) {
				for (const child of value) {
					if (child !== null && child.hasEffects(options)) return true;
				}
			} else if (value.hasEffects(options)) return true;
		}
		return false;
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

	include(includeAllChildrenRecursively: boolean) {
		this.included = true;
		for (const key of this.keys) {
			const value = (this as GenericEsTreeNode)[key];
			if (value === null || key === 'annotations') continue;
			if (Array.isArray(value)) {
				for (const child of value) {
					if (child !== null) child.include(includeAllChildrenRecursively);
				}
			} else {
				value.include(includeAllChildrenRecursively);
			}
		}
	}

	includeWithAllDeclaredVariables(includeAllChildrenRecursively: boolean) {
		this.include(includeAllChildrenRecursively);
	}

	/**
	 * Override to perform special initialisation steps after the scope is initialised
	 */
	initialise() {
		this.included = false;
	}

	insertSemicolon(code: MagicString) {
		if (code.original[this.end - 1] !== ';') {
			code.appendLeft(this.end, ';');
		}
	}

	locate() {
		// useful for debugging
		const location = locate(this.context.code, this.start, { offsetLine: 1 });
		location.file = this.context.fileName;
		location.toString = () => JSON.stringify(location);

		return location;
	}

	parseNode(esTreeNode: GenericEsTreeNode) {
		for (const key of Object.keys(esTreeNode)) {
			// That way, we can override this function to add custom initialisation and then call super.parseNode
			if (this.hasOwnProperty(key)) continue;
			const value = esTreeNode[key];
			if (typeof value !== 'object' || value === null || key === 'annotations') {
				(this as GenericEsTreeNode)[key] = value;
			} else if (Array.isArray(value)) {
				(this as GenericEsTreeNode)[key] = [];
				for (const child of value) {
					(this as GenericEsTreeNode)[key].push(
						child === null
							? null
							: new (this.context.nodeConstructors[child.type] ||
									this.context.nodeConstructors.UnknownNode)(child, this, this.scope)
					);
				}
			} else {
				(this as GenericEsTreeNode)[key] = new (this.context.nodeConstructors[value.type] ||
					this.context.nodeConstructors.UnknownNode)(value, this, this.scope);
			}
		}
	}

	render(code: MagicString, options: RenderOptions) {
		for (const key of this.keys) {
			const value = (this as GenericEsTreeNode)[key];
			if (value === null || key === 'annotations') continue;
			if (Array.isArray(value)) {
				for (const child of value) {
					if (child !== null) child.render(code, options);
				}
			} else {
				value.render(code, options);
			}
		}
	}

	shouldBeIncluded(): boolean {
		return this.included || this.hasEffects(NEW_EXECUTION_PATH);
	}

	toString() {
		return this.context.code.slice(this.start, this.end);
	}
}

export { NodeBase as StatementBase };
