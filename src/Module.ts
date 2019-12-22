import * as acorn from 'acorn';
import * as ESTree from 'estree';
import { locate } from 'locate-character';
import MagicString from 'magic-string';
import extractAssignedNames from 'rollup-pluginutils/src/extractAssignedNames';
import { createInclusionContext, InclusionContext } from './ast/ExecutionContext';
import ExportAllDeclaration from './ast/nodes/ExportAllDeclaration';
import ExportDefaultDeclaration from './ast/nodes/ExportDefaultDeclaration';
import ExportNamedDeclaration from './ast/nodes/ExportNamedDeclaration';
import ExportSpecifier from './ast/nodes/ExportSpecifier';
import Identifier from './ast/nodes/Identifier';
import ImportDeclaration from './ast/nodes/ImportDeclaration';
import ImportExpression from './ast/nodes/ImportExpression';
import ImportSpecifier from './ast/nodes/ImportSpecifier';
import { nodeConstructors } from './ast/nodes/index';
import Literal from './ast/nodes/Literal';
import MetaProperty from './ast/nodes/MetaProperty';
import * as NodeType from './ast/nodes/NodeType';
import Program from './ast/nodes/Program';
import { Node, NodeBase } from './ast/nodes/shared/Node';
import TemplateLiteral from './ast/nodes/TemplateLiteral';
import VariableDeclaration from './ast/nodes/VariableDeclaration';
import ModuleScope from './ast/scopes/ModuleScope';
import { PathTracker, UNKNOWN_PATH } from './ast/utils/PathTracker';
import ExportShimVariable from './ast/variables/ExportShimVariable';
import ExternalVariable from './ast/variables/ExternalVariable';
import NamespaceVariable from './ast/variables/NamespaceVariable';
import Variable from './ast/variables/Variable';
import Chunk from './Chunk';
import ExternalModule from './ExternalModule';
import Graph from './Graph';
import {
	DecodedSourceMapOrMissing,
	EmittedFile,
	ExistingDecodedSourceMap,
	ModuleJSON,
	ResolvedIdMap,
	RollupError,
	RollupWarning,
	TransformModuleJSON
} from './rollup/types';
import { error } from './utils/error';
import getCodeFrame from './utils/getCodeFrame';
import { getOriginalLocation } from './utils/getOriginalLocation';
import { makeLegal } from './utils/identifierHelpers';
import { basename, extname } from './utils/path';
import { markPureCallExpressions } from './utils/pureComments';
import relativeId from './utils/relativeId';
import { RenderOptions } from './utils/renderHelpers';
import { SOURCEMAPPING_URL_RE } from './utils/sourceMappingURL';
import { timeEnd, timeStart } from './utils/timers';
import { markModuleAndImpureDependenciesAsExecuted } from './utils/traverseStaticDependencies';
import { MISSING_EXPORT_SHIM_VARIABLE } from './utils/variableNames';

export interface CommentDescription {
	block: boolean;
	end: number;
	start: number;
	text: string;
}

export interface ImportDescription {
	module: Module | ExternalModule | null;
	name: string;
	source: string;
	start: number;
}

export interface ExportDescription {
	identifier: string | null;
	localName: string;
}

export interface ReexportDescription {
	localName: string;
	module: Module;
	source: string;
	start: number;
}

export interface AstContext {
	addDynamicImport: (node: ImportExpression) => void;
	addExport: (
		node: ExportAllDeclaration | ExportNamedDeclaration | ExportDefaultDeclaration
	) => void;
	addImport: (node: ImportDeclaration) => void;
	addImportMeta: (node: MetaProperty) => void;
	annotations: boolean;
	code: string;
	deoptimizationTracker: PathTracker;
	error: (props: RollupError, pos: number) => void;
	fileName: string;
	getExports: () => string[];
	getModuleExecIndex: () => number;
	getModuleName: () => string;
	getReexports: () => string[];
	importDescriptions: { [name: string]: ImportDescription };
	includeDynamicImport: (node: ImportExpression) => void;
	includeVariable: (context: InclusionContext, variable: Variable) => void;
	isCrossChunkImport: (importDescription: ImportDescription) => boolean;
	magicString: MagicString;
	module: Module; // not to be used for tree-shaking
	moduleContext: string;
	nodeConstructors: { [name: string]: typeof NodeBase };
	preserveModules: boolean;
	propertyReadSideEffects: boolean;
	traceExport: (name: string) => Variable;
	traceVariable: (name: string) => Variable | null;
	treeshake: boolean;
	tryCatchDeoptimization: boolean;
	unknownGlobalSideEffects: boolean;
	usesTopLevelAwait: boolean;
	warn: (warning: RollupWarning, pos: number) => void;
	warnDeprecation: (deprecation: string | RollupWarning, activeDeprecation: boolean) => void;
}

export const defaultAcornOptions: acorn.Options = {
	ecmaVersion: 2020 as any,
	preserveParens: false,
	sourceType: 'module'
};

function tryParse(module: Module, Parser: typeof acorn.Parser, acornOptions: acorn.Options) {
	try {
		return Parser.parse(module.code, {
			...defaultAcornOptions,
			...acornOptions,
			onComment: (block: boolean, text: string, start: number, end: number) =>
				module.comments.push({ block, text, start, end })
		});
	} catch (err) {
		let message = err.message.replace(/ \(\d+:\d+\)$/, '');
		if (module.id.endsWith('.json')) {
			message += ' (Note that you need @rollup/plugin-json to import JSON files)';
		} else if (!module.id.endsWith('.js')) {
			message += ' (Note that you need plugins to import files that are not JavaScript)';
		}
		module.error(
			{
				code: 'PARSE_ERROR',
				message,
				parserError: err
			},
			err.pos
		);
	}
}

function handleMissingExport(
	exportName: string,
	importingModule: Module,
	importedModule: string,
	importerStart?: number
) {
	importingModule.error(
		{
			code: 'MISSING_EXPORT',
			message: `'${exportName}' is not exported by ${relativeId(importedModule)}`,
			url: `https://rollupjs.org/guide/en/#error-name-is-not-exported-by-module`
		},
		importerStart as number
	);
}

const MISSING_EXPORT_SHIM_DESCRIPTION: ExportDescription = {
	identifier: null,
	localName: MISSING_EXPORT_SHIM_VARIABLE
};

export default class Module {
	chunk: Chunk | null = null;
	chunkFileNames = new Set<string>();
	chunkName: string | null = null;
	code!: string;
	comments: CommentDescription[] = [];
	customTransformCache!: boolean;
	dependencies: (Module | ExternalModule)[] = [];
	dynamicallyImportedBy: Module[] = [];
	dynamicDependencies: (Module | ExternalModule)[] = [];
	dynamicImports: {
		node: ImportExpression;
		resolution: Module | ExternalModule | string | null;
	}[] = [];
	entryPointsHash: Uint8Array = new Uint8Array(10);
	excludeFromSourcemap: boolean;
	execIndex = Infinity;
	exportAllModules: (Module | ExternalModule)[] = [];
	exportAllSources = new Set<string>();
	exports: { [name: string]: ExportDescription } = Object.create(null);
	exportsAll: { [name: string]: string } = Object.create(null);
	exportShimVariable: ExportShimVariable = new ExportShimVariable(this);
	facadeChunk: Chunk | null = null;
	id: string;
	importDescriptions: { [name: string]: ImportDescription } = Object.create(null);
	importMetas: MetaProperty[] = [];
	imports = new Set<Variable>();
	isEntryPoint: boolean;
	isExecuted = false;
	isUserDefinedEntryPoint = false;
	manualChunkAlias: string = null as any;
	moduleSideEffects: boolean;
	originalCode!: string;
	originalSourcemap!: ExistingDecodedSourceMap | null;
	reexportDescriptions: { [name: string]: ReexportDescription } = Object.create(null);
	resolvedIds!: ResolvedIdMap;
	scope!: ModuleScope;
	sourcemapChain!: DecodedSourceMapOrMissing[];
	sources = new Set<string>();
	transformFiles?: EmittedFile[];
	userChunkNames = new Set<string>();
	usesTopLevelAwait = false;

	private allExportNames: Set<string> | null = null;
	private ast!: Program;
	private astContext!: AstContext;
	private context: string;
	private esTreeAst!: ESTree.Program;
	private graph: Graph;
	private magicString!: MagicString;
	private namespaceVariable: NamespaceVariable | null = null;
	private transformDependencies: string[] = [];
	private transitiveReexports: string[] | null = null;

	constructor(graph: Graph, id: string, moduleSideEffects: boolean, isEntry: boolean) {
		this.id = id;
		this.graph = graph;
		this.excludeFromSourcemap = /\0/.test(id);
		this.context = graph.getModuleContext(id);
		this.moduleSideEffects = moduleSideEffects;
		this.isEntryPoint = isEntry;
	}

	basename() {
		const base = basename(this.id);
		const ext = extname(this.id);

		return makeLegal(ext ? base.slice(0, -ext.length) : base);
	}

	bindReferences() {
		this.ast.bind();
	}

	error(props: RollupError, pos: number) {
		if (pos !== undefined) {
			props.pos = pos;
			let location = locate(this.code, pos, { offsetLine: 1 });
			try {
				location = getOriginalLocation(this.sourcemapChain, location);
			} catch (e) {
				this.warn(
					{
						code: 'SOURCEMAP_ERROR',
						loc: {
							column: location.column,
							file: this.id,
							line: location.line
						},
						message: `Error when using sourcemap for reporting an error: ${e.message}`,
						pos
					},
					undefined as any
				);
			}

			props.loc = {
				column: location.column,
				file: this.id,
				line: location.line
			};
			props.frame = getCodeFrame(this.originalCode, location.line, location.column);
		}

		error(props);
	}

	getAllExportNames(): Set<string> {
		if (this.allExportNames) {
			return this.allExportNames;
		}
		const allExportNames = (this.allExportNames = new Set<string>());
		for (const name of Object.keys(this.exports)) {
			allExportNames.add(name);
		}
		for (const name of Object.keys(this.reexportDescriptions)) {
			allExportNames.add(name);
		}
		for (const module of this.exportAllModules) {
			if (module instanceof ExternalModule) {
				allExportNames.add(`*${module.id}`);
				continue;
			}

			for (const name of module.getAllExportNames()) {
				if (name !== 'default') allExportNames.add(name);
			}
		}

		return allExportNames;
	}

	getDynamicImportExpressions(): (string | Node)[] {
		return this.dynamicImports.map(({ node }) => {
			const importArgument = node.source;
			if (
				importArgument instanceof TemplateLiteral &&
				importArgument.quasis.length === 1 &&
				importArgument.quasis[0].value.cooked
			) {
				return importArgument.quasis[0].value.cooked;
			}
			if (importArgument instanceof Literal && typeof importArgument.value === 'string') {
				return importArgument.value;
			}
			return importArgument;
		});
	}

	getExportNamesByVariable(): Map<Variable, string[]> {
		const exportNamesByVariable: Map<Variable, string[]> = new Map();
		for (const exportName of this.getAllExportNames()) {
			const tracedVariable = this.getVariableForExportName(exportName);
			if (
				!tracedVariable ||
				!(tracedVariable.included || tracedVariable instanceof ExternalVariable)
			) {
				continue;
			}
			const existingExportNames = exportNamesByVariable.get(tracedVariable);
			if (existingExportNames) {
				existingExportNames.push(exportName);
			} else {
				exportNamesByVariable.set(tracedVariable, [exportName]);
			}
		}
		return exportNamesByVariable;
	}

	getExports() {
		return Object.keys(this.exports);
	}

	getOrCreateNamespace(): NamespaceVariable {
		if (!this.namespaceVariable) {
			this.namespaceVariable = new NamespaceVariable(this.astContext);
			this.namespaceVariable.initialise();
		}
		return this.namespaceVariable;
	}

	getReexports(): string[] {
		if (this.transitiveReexports) {
			return this.transitiveReexports;
		}
		// to avoid infinite recursion when using circular `export * from X`
		this.transitiveReexports = [];

		const reexports = new Set<string>();
		for (const name in this.reexportDescriptions) {
			reexports.add(name);
		}
		for (const module of this.exportAllModules) {
			if (module instanceof ExternalModule) {
				reexports.add(`*${module.id}`);
			} else {
				for (const name of module.getExports().concat(module.getReexports())) {
					if (name !== 'default') reexports.add(name);
				}
			}
		}
		return (this.transitiveReexports = Array.from(reexports));
	}

	getRenderedExports() {
		// only direct exports are counted here, not reexports at all
		const renderedExports: string[] = [];
		const removedExports: string[] = [];
		for (const exportName in this.exports) {
			const variable = this.getVariableForExportName(exportName);
			(variable && variable.included ? renderedExports : removedExports).push(exportName);
		}
		return { renderedExports, removedExports };
	}

	getTransitiveDependencies() {
		return this.dependencies.concat(
			this.getReexports()
				.concat(this.getExports())
				.map((exportName: string) => this.getVariableForExportName(exportName).module as Module)
		);
	}

	getVariableForExportName(name: string, isExportAllSearch?: boolean): Variable {
		if (name[0] === '*') {
			if (name.length === 1) {
				return this.getOrCreateNamespace();
			} else {
				// export * from 'external'
				const module = this.graph.moduleById.get(name.slice(1)) as ExternalModule;
				return module.getVariableForExportName('*');
			}
		}

		// export { foo } from './other'
		const reexportDeclaration = this.reexportDescriptions[name];
		if (reexportDeclaration) {
			const declaration = reexportDeclaration.module.getVariableForExportName(
				reexportDeclaration.localName
			);

			if (!declaration) {
				handleMissingExport(
					reexportDeclaration.localName,
					this,
					reexportDeclaration.module.id,
					reexportDeclaration.start
				);
			}

			return declaration;
		}

		const exportDeclaration = this.exports[name];
		if (exportDeclaration) {
			if (exportDeclaration === MISSING_EXPORT_SHIM_DESCRIPTION) {
				return this.exportShimVariable;
			}
			const name = exportDeclaration.localName;
			return this.traceVariable(name) || this.graph.scope.findVariable(name);
		}

		if (name !== 'default') {
			for (const module of this.exportAllModules) {
				const declaration = module.getVariableForExportName(name, true);

				if (declaration) return declaration;
			}
		}

		// we don't want to create shims when we are just
		// probing export * modules for exports
		if (this.graph.shimMissingExports && !isExportAllSearch) {
			this.shimMissingExport(name);
			return this.exportShimVariable;
		}
		return undefined as any;
	}

	include(): void {
		const context = createInclusionContext();
		if (this.ast.shouldBeIncluded(context)) this.ast.include(context, false);
	}

	includeAllExports() {
		if (!this.isExecuted) {
			this.graph.needsTreeshakingPass = true;
			markModuleAndImpureDependenciesAsExecuted(this);
		}

		const context = createInclusionContext();
		for (const exportName of this.getExports()) {
			const variable = this.getVariableForExportName(exportName);
			variable.deoptimizePath(UNKNOWN_PATH);
			if (!variable.included) {
				variable.include(context);
				this.graph.needsTreeshakingPass = true;
			}
		}

		for (const name of this.getReexports()) {
			const variable = this.getVariableForExportName(name);
			variable.deoptimizePath(UNKNOWN_PATH);
			if (!variable.included) {
				variable.include(context);
				this.graph.needsTreeshakingPass = true;
			}
			if (variable instanceof ExternalVariable) {
				variable.module.reexported = true;
			}
		}
	}

	includeAllInBundle() {
		this.ast.include(createInclusionContext(), true);
	}

	isIncluded() {
		return this.ast.included || (this.namespaceVariable && this.namespaceVariable.included);
	}

	linkDependencies() {
		for (const source of this.sources) {
			const id = this.resolvedIds[source].id;

			if (id) {
				const module = this.graph.moduleById.get(id);
				this.dependencies.push(module as Module);
			}
		}
		for (const { resolution } of this.dynamicImports) {
			if (resolution instanceof Module || resolution instanceof ExternalModule) {
				this.dynamicDependencies.push(resolution);
			}
		}

		this.addModulesToImportDescriptions(this.importDescriptions);
		this.addModulesToImportDescriptions(this.reexportDescriptions);

		const externalExportAllModules: ExternalModule[] = [];
		for (const source of this.exportAllSources) {
			const module = this.graph.moduleById.get(this.resolvedIds[source].id) as
				| Module
				| ExternalModule;
			(module instanceof ExternalModule ? externalExportAllModules : this.exportAllModules).push(
				module
			);
		}
		this.exportAllModules = this.exportAllModules.concat(externalExportAllModules);
	}

	render(options: RenderOptions): MagicString {
		const magicString = this.magicString.clone();
		this.ast.render(magicString, options);
		this.usesTopLevelAwait = this.astContext.usesTopLevelAwait;
		return magicString;
	}

	setSource({
		ast,
		code,
		customTransformCache,
		moduleSideEffects,
		originalCode,
		originalSourcemap,
		resolvedIds,
		sourcemapChain,
		transformDependencies,
		transformFiles
	}: TransformModuleJSON & {
		transformFiles?: EmittedFile[] | undefined;
	}) {
		this.code = code;
		this.originalCode = originalCode;
		this.originalSourcemap = originalSourcemap;
		this.sourcemapChain = sourcemapChain;
		if (transformFiles) {
			this.transformFiles = transformFiles;
		}
		this.transformDependencies = transformDependencies;
		this.customTransformCache = customTransformCache;
		if (typeof moduleSideEffects === 'boolean') {
			this.moduleSideEffects = moduleSideEffects;
		}

		timeStart('generate ast', 3);

		this.esTreeAst = ast || tryParse(this, this.graph.acornParser, this.graph.acornOptions);
		markPureCallExpressions(this.comments, this.esTreeAst);

		timeEnd('generate ast', 3);

		this.resolvedIds = resolvedIds || Object.create(null);

		// By default, `id` is the file name. Custom resolvers and loaders
		// can change that, but it makes sense to use it for the source file name
		const fileName = this.id;

		this.magicString = new MagicString(code, {
			filename: (this.excludeFromSourcemap ? null : fileName) as string, // don't include plugin helpers in sourcemap
			indentExclusionRanges: []
		});
		this.removeExistingSourceMap();

		timeStart('analyse ast', 3);

		this.astContext = {
			addDynamicImport: this.addDynamicImport.bind(this),
			addExport: this.addExport.bind(this),
			addImport: this.addImport.bind(this),
			addImportMeta: this.addImportMeta.bind(this),
			annotations: (this.graph.treeshakingOptions &&
				this.graph.treeshakingOptions.annotations) as boolean,
			code, // Only needed for debugging
			deoptimizationTracker: this.graph.deoptimizationTracker,
			error: this.error.bind(this),
			fileName, // Needed for warnings
			getExports: this.getExports.bind(this),
			getModuleExecIndex: () => this.execIndex,
			getModuleName: this.basename.bind(this),
			getReexports: this.getReexports.bind(this),
			importDescriptions: this.importDescriptions,
			includeDynamicImport: this.includeDynamicImport.bind(this),
			includeVariable: this.includeVariable.bind(this),
			isCrossChunkImport: importDescription =>
				(importDescription.module as Module).chunk !== this.chunk,
			magicString: this.magicString,
			module: this,
			moduleContext: this.context,
			nodeConstructors,
			preserveModules: this.graph.preserveModules,
			propertyReadSideEffects: (!this.graph.treeshakingOptions ||
				this.graph.treeshakingOptions.propertyReadSideEffects) as boolean,
			traceExport: this.getVariableForExportName.bind(this),
			traceVariable: this.traceVariable.bind(this),
			treeshake: !!this.graph.treeshakingOptions,
			tryCatchDeoptimization: (!this.graph.treeshakingOptions ||
				this.graph.treeshakingOptions.tryCatchDeoptimization) as boolean,
			unknownGlobalSideEffects: (!this.graph.treeshakingOptions ||
				this.graph.treeshakingOptions.unknownGlobalSideEffects) as boolean,
			usesTopLevelAwait: false,
			warn: this.warn.bind(this),
			warnDeprecation: this.graph.warnDeprecation.bind(this.graph)
		};

		this.scope = new ModuleScope(this.graph.scope, this.astContext);
		this.ast = new Program(
			this.esTreeAst,
			{ type: 'Module', context: this.astContext },
			this.scope
		);

		timeEnd('analyse ast', 3);
	}

	toJSON(): ModuleJSON {
		return {
			ast: this.esTreeAst,
			code: this.code,
			customTransformCache: this.customTransformCache,
			dependencies: this.dependencies.map(module => module.id),
			id: this.id,
			moduleSideEffects: this.moduleSideEffects,
			originalCode: this.originalCode,
			originalSourcemap: this.originalSourcemap,
			resolvedIds: this.resolvedIds,
			sourcemapChain: this.sourcemapChain,
			transformDependencies: this.transformDependencies,
			transformFiles: this.transformFiles
		};
	}

	traceVariable(name: string): Variable | null {
		const localVariable = this.scope.variables.get(name);
		if (localVariable) {
			return localVariable;
		}

		if (name in this.importDescriptions) {
			const importDeclaration = this.importDescriptions[name];
			const otherModule = importDeclaration.module as Module | ExternalModule;

			if (otherModule instanceof Module && importDeclaration.name === '*') {
				return otherModule.getOrCreateNamespace();
			}

			const declaration = otherModule.getVariableForExportName(importDeclaration.name);

			if (!declaration) {
				handleMissingExport(importDeclaration.name, this, otherModule.id, importDeclaration.start);
			}

			return declaration;
		}

		return null;
	}

	warn(warning: RollupWarning, pos: number) {
		if (pos !== undefined) {
			warning.pos = pos;

			const { line, column } = locate(this.code, pos, { offsetLine: 1 }); // TODO trace sourcemaps, cf. error()

			warning.loc = { file: this.id, line, column };
			warning.frame = getCodeFrame(this.code, line, column);
		}

		warning.id = this.id;
		this.graph.warn(warning);
	}

	private addDynamicImport(node: ImportExpression) {
		this.dynamicImports.push({ node, resolution: null });
	}

	private addExport(
		node: ExportAllDeclaration | ExportNamedDeclaration | ExportDefaultDeclaration
	) {
		if (node instanceof ExportDefaultDeclaration) {
			// export default foo;

			this.exports.default = {
				identifier: node.variable.getAssignedVariableName(),
				localName: 'default'
			};
		} else if (node instanceof ExportAllDeclaration) {
			// export * from './other'

			const source = node.source.value;
			this.sources.add(source);
			this.exportAllSources.add(source);
		} else if (node.source instanceof Literal) {
			// export { name } from './other'

			const source = node.source.value;
			this.sources.add(source);
			for (const specifier of node.specifiers) {
				const name = specifier.exported.name;
				this.reexportDescriptions[name] = {
					localName:
						specifier.type === NodeType.ExportNamespaceSpecifier ? '*' : specifier.local.name,
					module: null as any, // filled in later,
					source,
					start: specifier.start
				};
			}
		} else if (node.declaration) {
			const declaration = node.declaration;
			if (declaration instanceof VariableDeclaration) {
				// export var { foo, bar } = ...
				// export var foo = 1, bar = 2;

				for (const declarator of declaration.declarations) {
					for (const localName of extractAssignedNames(declarator.id)) {
						this.exports[localName] = { identifier: null, localName };
					}
				}
			} else {
				// export function foo () {}

				const localName = (declaration.id as Identifier).name;
				this.exports[localName] = { identifier: null, localName };
			}
		} else {
			// export { foo, bar, baz }

			for (const specifier of node.specifiers) {
				const localName = (specifier as ExportSpecifier).local.name;
				const exportedName = specifier.exported.name;
				this.exports[exportedName] = { identifier: null, localName };
			}
		}
	}

	private addImport(node: ImportDeclaration) {
		const source = node.source.value;
		this.sources.add(source);
		for (const specifier of node.specifiers) {
			const localName = specifier.local.name;

			if (this.importDescriptions[localName]) {
				this.error(
					{
						code: 'DUPLICATE_IMPORT',
						message: `Duplicated import '${localName}'`
					},
					specifier.start
				);
			}

			const isDefault = specifier.type === NodeType.ImportDefaultSpecifier;
			const isNamespace = specifier.type === NodeType.ImportNamespaceSpecifier;

			const name = isDefault
				? 'default'
				: isNamespace
				? '*'
				: (specifier as ImportSpecifier).imported.name;
			this.importDescriptions[localName] = { source, start: specifier.start, name, module: null };
		}
	}

	private addImportMeta(node: MetaProperty) {
		this.importMetas.push(node);
	}

	private addModulesToImportDescriptions(importDescription: {
		[name: string]: ImportDescription | ReexportDescription;
	}) {
		for (const name of Object.keys(importDescription)) {
			const specifier = importDescription[name];
			const id = this.resolvedIds[specifier.source].id;
			specifier.module = this.graph.moduleById.get(id) as Module | ExternalModule | null;
		}
	}

	private includeDynamicImport(node: ImportExpression) {
		const resolution = (this.dynamicImports.find(dynamicImport => dynamicImport.node === node) as {
			resolution: string | Module | ExternalModule | undefined;
		}).resolution;
		if (resolution instanceof Module) {
			resolution.dynamicallyImportedBy.push(this);
			resolution.includeAllExports();
		}
	}

	private includeVariable(context: InclusionContext, variable: Variable) {
		const variableModule = variable.module;
		if (!variable.included) {
			variable.include(context);
			this.graph.needsTreeshakingPass = true;
		}
		if (variableModule && variableModule !== this) {
			this.imports.add(variable);
		}
	}

	private removeExistingSourceMap() {
		for (const comment of this.comments) {
			if (!comment.block && SOURCEMAPPING_URL_RE.test(comment.text)) {
				this.magicString.remove(comment.start, comment.end);
			}
		}
	}

	private shimMissingExport(name: string): void {
		if (!this.exports[name]) {
			this.graph.warn({
				code: 'SHIMMED_EXPORT',
				exporter: relativeId(this.id),
				exportName: name,
				message: `Missing export "${name}" has been shimmed in module ${relativeId(this.id)}.`
			});
			this.exports[name] = MISSING_EXPORT_SHIM_DESCRIPTION;
		}
	}
}
