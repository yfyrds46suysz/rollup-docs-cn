import Module, { AstContext } from '../../Module';
import { RenderOptions } from '../../utils/renderHelpers';
import Identifier from '../nodes/Identifier';
import { UNKNOWN_PATH } from '../values';
import Variable from './Variable';

export default class NamespaceVariable extends Variable {
	isNamespace: true;
	context: AstContext;
	module: Module;

	// Not initialised during construction
	memberVariables: { [name: string]: Variable } = Object.create(null);

	private referencedEarly: boolean = false;
	private references: Identifier[] = [];
	private containsExternalNamespace: boolean = false;

	constructor(context: AstContext) {
		super(context.getModuleName());
		this.context = context;
		this.module = context.module;
		for (const name of this.context.getExports().concat(this.context.getReexports())) {
			if (name[0] === '*' && name.length > 1) this.containsExternalNamespace = true;
			this.memberVariables[name] = this.context.traceExport(name);
		}
	}

	addReference(identifier: Identifier) {
		this.references.push(identifier);
		this.name = identifier.name;
	}

	include() {
		if (!this.included) {
			if (this.containsExternalNamespace) {
				this.context.error(
					{
						code: 'NAMESPACE_CANNOT_CONTAIN_EXTERNAL',
						message: `Cannot create an explicit namespace object for module "${this.context.getModuleName()}" because it contains a reexported external namespace`,
						id: this.module.id
					},
					undefined
				);
			}
			this.included = true;
			for (const identifier of this.references) {
				if (identifier.context.getModuleExecIndex() <= this.context.getModuleExecIndex()) {
					this.referencedEarly = true;
					break;
				}
			}
			if (this.context.preserveModules) {
				for (const memberName of Object.keys(this.memberVariables))
					this.memberVariables[memberName].include();
			} else {
				for (const memberName of Object.keys(this.memberVariables))
					this.context.includeVariable(this.memberVariables[memberName]);
			}
		}
	}

	renderFirst() {
		return this.referencedEarly;
	}

	// This is only called if "UNKNOWN_PATH" is reassigned as in all other situations, either the
	// build fails due to an illegal namespace reassignment or MemberExpression already forwards
	// the reassignment to the right variable. This means we lost track of this variable and thus
	// need to reassign all exports.
	deoptimizePath() {
		for (const key in this.memberVariables) {
			this.memberVariables[key].deoptimizePath(UNKNOWN_PATH);
		}
	}

	renderBlock(options: RenderOptions) {
		const _ = options.compact ? '' : ' ';
		const n = options.compact ? '' : '\n';
		const t = options.indent;

		const members = Object.keys(this.memberVariables).map(name => {
			const original = this.memberVariables[name];

			if (this.referencedEarly || original.isReassigned) {
				return `${t}get ${name}${_}()${_}{${_}return ${original.getName()}${
					options.compact ? '' : ';'
				}${_}}`;
			}

			return `${t}${name}: ${original.getName()}`;
		});

		const name = this.getName();

		const callee = options.freeze ? `/*#__PURE__*/Object.freeze` : '';

		let output = `${this.context.varOrConst} ${name} = ${
			options.namespaceToStringTag
				? `{${n}${members.join(`,${n}`)}${n}};`
				: `${callee}({${n}${members.join(`,${n}`)}${n}});`
		}`;

		if (options.namespaceToStringTag) {
			output += `${n}if${_}(typeof Symbol${_}!==${_}'undefined'${_}&&${_}Symbol.toStringTag)${n}`;
			output += `${t}Object.defineProperty(${name},${_}Symbol.toStringTag,${_}{${_}value:${_}'Module'${_}});${n}`;
			output += `else${n || ' '}`;
			output += `${t}Object.defineProperty(${name},${_}'toString',${_}{${_}value:${_}function${_}()${_}{${_}return${_}'[object Module]'${
				options.compact ? ';' : ''
			}${_}}${_}});${n}`;
			output += `${callee}(${name});`;
		}

		if (options.format === 'system' && this.exportName) {
			output += `${n}exports('${this.exportName}',${_}${name});`;
		}

		return output;
	}
}

NamespaceVariable.prototype.isNamespace = true;
