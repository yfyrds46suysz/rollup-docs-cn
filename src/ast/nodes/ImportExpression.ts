import type MagicString from 'magic-string';
import ExternalModule from '../../ExternalModule';
import type Module from '../../Module';
import type { GetInterop, NormalizedOutputOptions } from '../../rollup/types';
import type { PluginDriver } from '../../utils/PluginDriver';
import type { GenerateCodeSnippets } from '../../utils/generateCodeSnippets';
import {
	INTEROP_NAMESPACE_DEFAULT_ONLY_VARIABLE,
	namespaceInteropHelpersByInteropType
} from '../../utils/interopHelpers';
import { findFirstOccurrenceOutsideComment, type RenderOptions } from '../../utils/renderHelpers';
import type { InclusionContext } from '../ExecutionContext';
import type ChildScope from '../scopes/ChildScope';
import type NamespaceVariable from '../variables/NamespaceVariable';
import type * as NodeType from './NodeType';
import type ObjectExpression from './ObjectExpression';
import {
	type ExpressionNode,
	type GenericEsTreeNode,
	type IncludeChildren,
	NodeBase
} from './shared/Node';

interface DynamicImportMechanism {
	left: string;
	right: string;
}

// TODO once ImportExpression follows official ESTree specs with "null" as
//  default, keys.ts should be updated
export default class ImportExpression extends NodeBase {
	declare arguments: ObjectExpression[] | undefined;
	inlineNamespace: NamespaceVariable | null = null;
	declare source: ExpressionNode;
	declare type: NodeType.tImportExpression;

	private assertions: string | null | true = null;
	private mechanism: DynamicImportMechanism | null = null;
	private namespaceExportName: string | false | undefined = undefined;
	private resolution: Module | ExternalModule | string | null = null;
	private resolutionString: string | null = null;

	// Do not bind assertions
	bind(): void {
		this.source.bind();
	}

	hasEffects(): boolean {
		return true;
	}

	include(context: InclusionContext, includeChildrenRecursively: IncludeChildren): void {
		if (!this.included) {
			this.included = true;
			this.context.includeDynamicImport(this);
			this.scope.addAccessedDynamicImport(this);
		}
		this.source.include(context, includeChildrenRecursively);
	}

	initialise(): void {
		this.context.addDynamicImport(this);
	}

	parseNode(esTreeNode: GenericEsTreeNode): void {
		// Keep the source AST to be used by renderDynamicImport
		super.parseNode(esTreeNode, ['source']);
	}

	render(code: MagicString, options: RenderOptions): void {
		const {
			snippets: { _, getDirectReturnFunction, getObject, getPropertyAccess }
		} = options;
		if (this.inlineNamespace) {
			const [left, right] = getDirectReturnFunction([], {
				functionReturn: true,
				lineBreakIndent: null,
				name: null
			});
			code.overwrite(
				this.start,
				this.end,
				`Promise.resolve().then(${left}${this.inlineNamespace.getName(getPropertyAccess)}${right})`
			);
			return;
		}
		if (this.mechanism) {
			code.overwrite(
				this.start,
				findFirstOccurrenceOutsideComment(code.original, '(', this.start + 6) + 1,
				this.mechanism.left
			);
			code.overwrite(this.end - 1, this.end, this.mechanism.right);
		}
		if (this.resolutionString) {
			code.overwrite(this.source.start, this.source.end, this.resolutionString);
			if (this.namespaceExportName) {
				const [left, right] = getDirectReturnFunction(['n'], {
					functionReturn: true,
					lineBreakIndent: null,
					name: null
				});
				code.prependLeft(this.end, `.then(${left}n.${this.namespaceExportName}${right})`);
			}
		} else {
			this.source.render(code, options);
		}
		if (this.assertions !== true) {
			if (this.arguments) {
				code.overwrite(this.source.end, this.end - 1, '', { contentOnly: true });
			}
			if (this.assertions) {
				code.appendLeft(
					this.end - 1,
					`,${_}${getObject([['assert', this.assertions]], {
						lineBreakIndent: null
					})}`
				);
			}
		}
	}

	setExternalResolution(
		exportMode: 'none' | 'named' | 'default' | 'external',
		resolution: Module | ExternalModule | string | null,
		options: NormalizedOutputOptions,
		snippets: GenerateCodeSnippets,
		pluginDriver: PluginDriver,
		accessedGlobalsByScope: Map<ChildScope, Set<string>>,
		resolutionString: string,
		namespaceExportName: string | false | undefined,
		assertions: string | null | true
	): void {
		const { format } = options;
		this.inlineNamespace = null;
		this.resolution = resolution;
		this.resolutionString = resolutionString;
		this.namespaceExportName = namespaceExportName;
		this.assertions = assertions;
		const accessedGlobals = [...(accessedImportGlobals[format] || [])];
		let helper: string | null;
		({ helper, mechanism: this.mechanism } = this.getDynamicImportMechanismAndHelper(
			resolution,
			exportMode,
			options,
			snippets,
			pluginDriver
		));
		if (helper) {
			accessedGlobals.push(helper);
		}
		if (accessedGlobals.length > 0) {
			this.scope.addAccessedGlobals(accessedGlobals, accessedGlobalsByScope);
		}
	}

	setInternalResolution(inlineNamespace: NamespaceVariable): void {
		this.inlineNamespace = inlineNamespace;
	}

	protected applyDeoptimizations() {}

	private getDynamicImportMechanismAndHelper(
		resolution: Module | ExternalModule | string | null,
		exportMode: 'none' | 'named' | 'default' | 'external',
		{
			compact,
			dynamicImportFunction,
			dynamicImportInCjs,
			format,
			generatedCode: { arrowFunctions },
			interop
		}: NormalizedOutputOptions,
		{ _, getDirectReturnFunction, getDirectReturnIifeLeft }: GenerateCodeSnippets,
		pluginDriver: PluginDriver
	): { helper: string | null; mechanism: DynamicImportMechanism | null } {
		const mechanism = pluginDriver.hookFirstSync('renderDynamicImport', [
			{
				customResolution: typeof this.resolution === 'string' ? this.resolution : null,
				format,
				moduleId: this.context.module.id,
				targetModuleId:
					this.resolution && typeof this.resolution !== 'string' ? this.resolution.id : null
			}
		]);
		if (mechanism) {
			return { helper: null, mechanism };
		}
		const hasDynamicTarget = !this.resolution || typeof this.resolution === 'string';
		switch (format) {
			case 'cjs': {
				if (
					dynamicImportInCjs &&
					(!resolution || typeof resolution === 'string' || resolution instanceof ExternalModule)
				) {
					return { helper: null, mechanism: null };
				}
				const helper = getInteropHelper(resolution, exportMode, interop);
				let left = `require(`;
				let right = `)`;
				if (helper) {
					left = `/*#__PURE__*/${helper}(${left}`;
					right += ')';
				}
				const [functionLeft, functionRight] = getDirectReturnFunction([], {
					functionReturn: true,
					lineBreakIndent: null,
					name: null
				});
				left = `Promise.resolve().then(${functionLeft}${left}`;
				right += `${functionRight})`;
				if (!arrowFunctions && hasDynamicTarget) {
					left = getDirectReturnIifeLeft(['t'], `${left}t${right}`, {
						needsArrowReturnParens: false,
						needsWrappedFunction: true
					});
					right = ')';
				}
				return {
					helper,
					mechanism: { left, right }
				};
			}
			case 'amd': {
				const resolve = compact ? 'c' : 'resolve';
				const reject = compact ? 'e' : 'reject';
				const helper = getInteropHelper(resolution, exportMode, interop);
				const [resolveLeft, resolveRight] = getDirectReturnFunction(['m'], {
					functionReturn: false,
					lineBreakIndent: null,
					name: null
				});
				const resolveNamespace = helper
					? `${resolveLeft}${resolve}(/*#__PURE__*/${helper}(m))${resolveRight}`
					: resolve;
				const [handlerLeft, handlerRight] = getDirectReturnFunction([resolve, reject], {
					functionReturn: false,
					lineBreakIndent: null,
					name: null
				});
				let left = `new Promise(${handlerLeft}require([`;
				let right = `],${_}${resolveNamespace},${_}${reject})${handlerRight})`;
				if (!arrowFunctions && hasDynamicTarget) {
					left = getDirectReturnIifeLeft(['t'], `${left}t${right}`, {
						needsArrowReturnParens: false,
						needsWrappedFunction: true
					});
					right = ')';
				}
				return {
					helper,
					mechanism: { left, right }
				};
			}
			case 'system': {
				return {
					helper: null,
					mechanism: {
						left: 'module.import(',
						right: ')'
					}
				};
			}
			case 'es': {
				if (dynamicImportFunction) {
					return {
						helper: null,
						mechanism: {
							left: `${dynamicImportFunction}(`,
							right: ')'
						}
					};
				}
			}
		}
		return { helper: null, mechanism: null };
	}
}

function getInteropHelper(
	resolution: Module | ExternalModule | string | null,
	exportMode: 'none' | 'named' | 'default' | 'external',
	interop: GetInterop
): string | null {
	return exportMode === 'external'
		? namespaceInteropHelpersByInteropType[
				interop(resolution instanceof ExternalModule ? resolution.id : null)
		  ]
		: exportMode === 'default'
		? INTEROP_NAMESPACE_DEFAULT_ONLY_VARIABLE
		: null;
}

const accessedImportGlobals: Record<string, string[]> = {
	amd: ['require'],
	cjs: ['require'],
	system: ['module']
};
