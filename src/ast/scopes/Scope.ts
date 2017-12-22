import { blank, keys } from '../../utils/object';
import LocalVariable from '../variables/LocalVariable';
import ExportDefaultVariable from '../variables/ExportDefaultVariable';
import { UNDEFINED_ASSIGNMENT } from '../values';
import ExecutionPathOptions from '../ExecutionPathOptions';
import Identifier from '../nodes/Identifier';
import Expression from '../nodes/Expression';
import Variable from '../variables/Variable';

export default class Scope {
	parent: Scope | void;
	variables: {
		[name: string]: Variable
	};
	isModuleScope: boolean;
	children: Scope[];

	constructor (options = {}) {
		this.parent = options.parent;
		this.isModuleScope = !!options.isModuleScope;

		this.children = [];
		if (this.parent) this.parent.children.push(this);

		this.variables = blank();
	}

	/**
	 * @param identifier
	 * @param {Object} [options] - valid options are
	 *        {(Node|null)} init
	 *        {boolean} isHoisted
	 * @return {Variable}
	 */
	addDeclaration (identifier: Identifier, options = {}) {
		const name = identifier.name;
		if (this.variables[name]) {
			const variable = this.variables[name];
			variable.addDeclaration(identifier);
			variable.reassignPath([], ExecutionPathOptions.create());
		} else {
			this.variables[name] = new LocalVariable(
				identifier.name,
				identifier,
				options.init || UNDEFINED_ASSIGNMENT
			);
		}
		return this.variables[name];
	}

	addExportDefaultDeclaration (name: string, exportDefaultDeclaration) {
		this.variables.default = new ExportDefaultVariable(
			name,
			exportDefaultDeclaration
		);
		return this.variables.default;
	}

	addReturnExpression (expression: Expression) {
		this.parent && this.parent.addReturnExpression(expression);
	}

	contains (name: string): boolean {
		return (
			!!this.variables[name] ||
			(this.parent ? this.parent.contains(name) : false)
		);
	}

	deshadow (names: string[]) {
		keys(this.variables).forEach(key => {
			const declaration = this.variables[key];

			// we can disregard exports.foo etc
			if (declaration.exportName && declaration.isReassigned) return;

			const name = declaration.getName(true);
			let deshadowed = name;

			let i = 1;

			while (names.has(deshadowed)) {
				deshadowed = `${name}$$${i++}`;
			}

			declaration.name = deshadowed;
		});

		this.children.forEach(scope => scope.deshadow(names));
	}

	findLexicalBoundary () {
		return this.parent.findLexicalBoundary();
	}

	findVariable (name) {
		return (
			this.variables[name] || (this.parent && this.parent.findVariable(name))
		);
	}
}
