import { forOwn } from '../../utils/object';
import relativeId from '../../utils/relativeId';
import Scope from './Scope';
import LocalVariable from '../variables/LocalVariable';
import { UNDEFINED_ASSIGNMENT } from '../values';

export default class ModuleScope extends Scope {
	constructor (module) {
		super({
			isModuleScope: true,
			parent: module.bundle.scope
		});

		this.module = module;
		this.variables.this = new LocalVariable('this', null, UNDEFINED_ASSIGNMENT);
	}

	deshadow (names) {
		names = new Set(names);

		forOwn(this.module.imports, specifier => {
			if (specifier.module.isExternal) return;

			const addDeclaration = declaration => {
				if (declaration.isNamespace && !declaration.isExternal) {
					declaration.module.getExports().forEach(name => {
						addDeclaration(declaration.module.traceExport(name));
					});
				}

				names.add(declaration.name);
			};

			specifier.module.getExports().forEach(name => {
				addDeclaration(specifier.module.traceExport(name));
			});

			if (specifier.name !== '*') {
				const declaration = specifier.module.traceExport(specifier.name);
				if (!declaration) {
					this.module.warn(
						{
							code: 'NON_EXISTENT_EXPORT',
							name: specifier.name,
							source: specifier.module.id,
							message: `Non-existent export '${
								specifier.name
								}' is imported from ${relativeId(specifier.module.id)}`
						},
						specifier.specifier.start
					);
					return;
				}

				const name = declaration.getName(true);
				if (name !== specifier.name) {
					names.add(declaration.getName(true));
				}

				if (
					specifier.name !== 'default' &&
					specifier.specifier.imported.name !== specifier.specifier.local.name
				) {
					names.add(specifier.specifier.imported.name);
				}
			}
		});

		super.deshadow(names);
	}

	findLexicalBoundary () {
		return this;
	}

	findVariable (name: string) {
		if (this.variables[name]) {
			return this.variables[name];
		}

		return this.module.trace(name) || this.parent.findVariable(name);
	}
}
