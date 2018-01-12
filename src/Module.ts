import * as acorn from 'acorn';
import wrapDynamicImportPlugin from './utils/dynamic-import-plugin';
import MagicString from 'magic-string';
import { locate } from 'locate-character';
import { timeStart, timeEnd } from './utils/flushTime';
import { assign, blank, keys } from './utils/object';
import { basename, extname } from './utils/path';
import { makeLegal } from './utils/identifierHelpers';
import getCodeFrame from './utils/getCodeFrame';
import { SOURCEMAPPING_URL_RE } from './utils/sourceMappingURL';
import error, { RollupError } from './utils/error';
import NamespaceVariable from './ast/variables/NamespaceVariable';
import extractNames from './ast/utils/extractNames';
import enhance from './ast/enhance';
import clone from './ast/clone';
import ModuleScope from './ast/scopes/ModuleScope';
import { encode } from 'sourcemap-codec';
import { RawSourceMap, SourceMapConsumer } from 'source-map';
import ImportSpecifier from './ast/nodes/ImportSpecifier';
import Graph, { ResolveDynamicImportHandler } from './Graph';
import Variable from './ast/variables/Variable';
import Program from './ast/nodes/Program';
import VariableDeclarator from './ast/nodes/VariableDeclarator';
import { Node } from './ast/nodes/shared/Node';
import ExportNamedDeclaration from './ast/nodes/ExportNamedDeclaration';
import ImportDeclaration from './ast/nodes/ImportDeclaration';
import Identifier from './ast/nodes/Identifier';
import ExportDefaultDeclaration from './ast/nodes/ExportDefaultDeclaration';
import FunctionDeclaration from './ast/nodes/FunctionDeclaration';
import ExportAllDeclaration from './ast/nodes/ExportAllDeclaration';
import ImportDefaultSpecifier from './ast/nodes/ImportDefaultSpecifier';
import ImportNamespaceSpecifier from './ast/nodes/ImportNamespaceSpecifier';
import { RollupWarning } from './rollup/index';
import ExternalModule from './ExternalModule';
import Import from './ast/nodes/Import';
import TemplateLiteral from './ast/nodes/TemplateLiteral';
import Literal from './ast/nodes/Literal';
import { missingExport } from './utils/defaults';

const setModuleDynamicImportsReturnBinding = wrapDynamicImportPlugin(acorn);

export interface IdMap {[key: string]: string;}

export interface CommentDescription {
	block: boolean;
	text: string;
	start: number;
	end: number;
}

export interface ExportDescription {
	localName: string;
	identifier?: string;
}

export interface ReexportDescription {
	localName: string;
	start: number;
	source: string;
	module: Module;
}

function tryParse (module: Module, acornOptions: Object) {
	try {
		return acorn.parse(module.code, assign({
			ecmaVersion: 8,
			sourceType: 'module',
			onComment: (block: boolean, text: string, start: number, end: number) =>
				module.comments.push({ block, text, start, end }),
			preserveParens: false
		}, acornOptions));
	} catch (err) {
		module.error({
			code: 'PARSE_ERROR',
			message: err.message.replace(/ \(\d+:\d+\)$/, '')
		}, err.pos);
	}
}

function includeFully (node: Node) {
	node.included = true;
	if (node.variable && !node.variable.included) {
		node.variable.includeVariable();
	}
	node.eachChild(includeFully);
}

export interface ModuleJSON {
	id: string;
	dependencies: string[];
	code: string;
	originalCode: string;
	originalSourcemap: RawSourceMap;
	ast: Program;
	sourcemapChain: RawSourceMap[];
	resolvedIds: IdMap;
	resolvedExternalIds: IdMap;
}

export default class Module {
	type: 'Module';
	graph: Graph;
	code: string;
	comments: CommentDescription[];
	context: string;
	dependencies: (Module | ExternalModule)[];
	excludeFromSourcemap: boolean;
	exports: { [name: string]: ExportDescription };
	exportsAll: { [name: string]: string };
	exportAllSources: string[];
	id: string;

	imports: {
		[name: string]: {
			source: string;
			specifier: ImportSpecifier | ImportNamespaceSpecifier | ImportDefaultSpecifier;
			name: string;
			module: Module | ExternalModule | null;
		}
	};
	isExternal: boolean;
	magicString: MagicString;
	originalCode: string;
	originalSourcemap: RawSourceMap;
	reexports: { [name: string]: ReexportDescription };
	resolvedExternalIds: IdMap;
	resolvedIds: IdMap;
	scope: ModuleScope;
	sourcemapChain: RawSourceMap[];
	sources: string[];
	strongDependencies: (Module | ExternalModule)[];

	ast: Program;
	private astClone: Program;
	declarations: {
		'*'?: NamespaceVariable;
		[name: string]: Variable;
	};
	private exportAllModules: (Module | ExternalModule)[];
	private dynamicImports: Import[];

	constructor ({
		id,
		code,
		originalCode,
		originalSourcemap,
		ast,
		sourcemapChain,
		resolvedIds,
		resolvedExternalIds,
		graph
	}: {
		id: string,
		code: string,
		originalCode: string,
		originalSourcemap: RawSourceMap,
		ast: Program,
		sourcemapChain: RawSourceMap[],
		resolvedIds: IdMap,
		resolvedExternalIds?: IdMap,
		graph: Graph
	}) {
		this.code = code;
		this.id = id;
		this.graph = graph;
		this.originalCode = originalCode;
		this.originalSourcemap = originalSourcemap;
		this.sourcemapChain = sourcemapChain;
		this.comments = [];
		this.dynamicImports = [];

		timeStart('ast');

		if (ast) {
			// prevent mutating the provided AST, as it may be reused on
			// subsequent incremental rebuilds
			this.ast = clone(ast);
			this.astClone = ast;
		} else {
			// We bind the dynamic imports array to the plugin binding above, to get the nodes added
			// to this array during parsing itself. This is faster than having to do a separate walk.
			if (graph.dynamicImport)
				setModuleDynamicImportsReturnBinding(this.dynamicImports);
			this.ast = <any>tryParse(this, graph.acornOptions); // TODO what happens to comments if AST is provided?
			if (graph.dynamicImport)
				setModuleDynamicImportsReturnBinding(undefined);
			this.astClone = clone(this.ast);
		}

		timeEnd('ast');

		this.excludeFromSourcemap = /\0/.test(id);
		this.context = graph.getModuleContext(id);

		// all dependencies
		this.sources = [];
		this.dependencies = [];
		this.resolvedIds = resolvedIds || blank();
		this.resolvedExternalIds = resolvedExternalIds || blank();

		// imports and exports, indexed by local name
		this.imports = blank();
		this.exports = blank();
		this.exportsAll = blank();
		this.reexports = blank();

		this.exportAllSources = [];
		this.exportAllModules = null;

		// By default, `id` is the filename. Custom resolvers and loaders
		// can change that, but it makes sense to use it for the source filename
		this.magicString = new MagicString(code, {
			filename: this.excludeFromSourcemap ? null : id, // don't include plugin helpers in sourcemap
			indentExclusionRanges: []
		});

		// remove existing sourceMappingURL comments
		this.comments = this.comments.filter(comment => {
			//only one line comment can contain source maps
			const isSourceMapComment =
				!comment.block && SOURCEMAPPING_URL_RE.test(comment.text);
			if (isSourceMapComment) {
				this.magicString.remove(comment.start, comment.end);
			}
			return !isSourceMapComment;
		});

		this.declarations = blank();
		this.scope = new ModuleScope(this);

		timeStart('analyse');

		this.analyse();

		timeEnd('analyse');

		this.strongDependencies = [];
	}

	private addExport (node: ExportAllDeclaration | ExportNamedDeclaration | ExportDefaultDeclaration) {
		const source = (<ExportAllDeclaration>node).source && (<ExportAllDeclaration>node).source.value;

		// export { name } from './other'
		if (source) {
			if (!~this.sources.indexOf(source)) this.sources.push(source);

			if (node.type === 'ExportAllDeclaration') {
				// Store `export * from '...'` statements in an array of delegates.
				// When an unknown import is encountered, we see if one of them can satisfy it.
				this.exportAllSources.push(source);
			} else {
				(<ExportNamedDeclaration>node).specifiers.forEach(specifier => {
					const name = specifier.exported.name;

					if (this.exports[name] || this.reexports[name]) {
						this.error(
							{
								code: 'DUPLICATE_EXPORT',
								message: `A module cannot have multiple exports with the same name ('${name}')`
							},
							specifier.start
						);
					}

					this.reexports[name] = {
						start: specifier.start,
						source,
						localName: specifier.local.name,
						module: null // filled in later
					};
				});
			}
		} else if (node.type === 'ExportDefaultDeclaration') {
			// export default function foo () {}
			// export default foo;
			// export default 42;
			const identifier =
				((<FunctionDeclaration>(<ExportDefaultDeclaration>node).declaration).id
					&& (<FunctionDeclaration>(<ExportDefaultDeclaration>node).declaration).id.name)
				|| (<Identifier>(<ExportDefaultDeclaration>node).declaration).name;
			if (this.exports.default) {
				this.error(
					{
						code: 'DUPLICATE_EXPORT',
						message: `A module can only have one default export`
					},
					node.start
				);
			}

			this.exports.default = {
				localName: 'default',
				identifier
			};
		} else if ((<ExportNamedDeclaration>node).declaration) {
			// export var { foo, bar } = ...
			// export var foo = 42;
			// export var a = 1, b = 2, c = 3;
			// export function foo () {}
			const declaration = (<ExportNamedDeclaration>node).declaration;

			if (declaration.type === 'VariableDeclaration') {
				declaration.declarations.forEach((decl: VariableDeclarator) => {
					extractNames(decl.id).forEach(localName => {
						this.exports[localName] = { localName };
					});
				});
			} else {
				// export function foo () {}
				const localName = declaration.id.name;
				this.exports[localName] = { localName };
			}
		} else {
			// export { foo, bar, baz }
			(<ExportNamedDeclaration>node).specifiers.forEach(specifier => {
				const localName = specifier.local.name;
				const exportedName = specifier.exported.name;

				if (this.exports[exportedName] || this.reexports[exportedName]) {
					this.error(
						{
							code: 'DUPLICATE_EXPORT',
							message: `A module cannot have multiple exports with the same name ('${exportedName}')`
						},
						specifier.start
					);
				}

				this.exports[exportedName] = { localName };
			});
		}
	}

	private addImport (node: ImportDeclaration) {
		const source = node.source.value;

		if (!~this.sources.indexOf(source)) this.sources.push(source);

		node.specifiers.forEach(specifier => {
			const localName = specifier.local.name;

			if (this.imports[localName]) {
				this.error(
					{
						code: 'DUPLICATE_IMPORT',
						message: `Duplicated import '${localName}'`
					},
					specifier.start
				);
			}

			const isDefault = specifier.type === 'ImportDefaultSpecifier';
			const isNamespace = specifier.type === 'ImportNamespaceSpecifier';

			const name = isDefault
				? 'default'
				: isNamespace ? '*' : (<ImportSpecifier>specifier).imported.name;
			this.imports[localName] = { source, specifier, name, module: null };
		});
	}

	private analyse () {
		enhance(this.ast, this, this.comments);

		// discover this module's imports and exports
		let lastNode;

		for (const node of this.ast.body) {
			if ((<ImportDeclaration>node).isImportDeclaration) {
				this.addImport(<ImportDeclaration>node);
			} else if ((<ExportDefaultDeclaration | ExportNamedDeclaration | ExportAllDeclaration>node).isExportDeclaration) {
				this.addExport((<ExportDefaultDeclaration | ExportNamedDeclaration | ExportAllDeclaration>node));
			}

			if (lastNode) lastNode.next = node.leadingCommentStart || node.start;
			lastNode = node;
		}
	}

	basename () {
		const base = basename(this.id);
		const ext = extname(this.id);

		return makeLegal(ext ? base.slice(0, -ext.length) : base);
	}

	bindImportSpecifiers () {
		[this.imports, this.reexports].forEach(specifiers => {
			keys(specifiers).forEach(name => {
				const specifier = specifiers[name];

				const id =
					this.resolvedIds[specifier.source] ||
					this.resolvedExternalIds[specifier.source];
				specifier.module = this.graph.moduleById.get(id);
			});
		});

		this.exportAllModules = this.exportAllSources.map(source => {
			const id = this.resolvedIds[source] || this.resolvedExternalIds[source];
			return this.graph.moduleById.get(id);
		});

		this.sources.forEach(source => {
			const id = this.resolvedIds[source];

			if (id) {
				const module = this.graph.moduleById.get(id);
				this.dependencies.push(module);
			}
		});
	}

	bindReferences () {
		for (const node of this.ast.body) {
			node.bind();
		}
	}

	private getOriginalLocation (sourcemapChain: RawSourceMap[], line: number, column: number) {
		let location = {
			line,
			column
		};
		const filteredSourcemapChain = sourcemapChain
			.filter(sourcemap => sourcemap.mappings)
			.map(sourcemap => {
				const encodedSourcemap = sourcemap;
				if (sourcemap.mappings) {
					encodedSourcemap.mappings = encode(encodedSourcemap.mappings);
				}
				return encodedSourcemap;
			});
		while (filteredSourcemapChain.length > 0) {
			const sourcemap = filteredSourcemapChain.pop();
			const smc = new SourceMapConsumer(sourcemap);
			location = smc.originalPositionFor({
				line: location.line,
				column: location.column
			});
		}
		return location;
	}

	error (props: RollupError, pos: number) {
		if (pos !== undefined) {
			props.pos = pos;

			const { line, column } = locate(this.code, pos, { offsetLine: 1 });
			const location = this.getOriginalLocation(
				this.sourcemapChain,
				line,
				column
			);

			props.loc = {
				file: this.id,
				line: location.line,
				column: location.column
			};
			props.frame = getCodeFrame(
				this.originalCode,
				location.line,
				location.column
			);
		}

		error(props);
	}

	getExports () {
		return keys(this.exports);
	}

	getReexports () {
		const reexports = blank();

		keys(this.reexports).forEach(name => {
			reexports[name] = true;
		});

		this.exportAllModules.forEach(module => {
			if (module.isExternal) {
				reexports[`*${module.id}`] = true;
				return;
			}

			(<Module>module)
				.getExports()
				.concat((<Module>module).getReexports())
				.forEach(name => {
					if (name !== 'default') reexports[name] = true;
				});
		});

		return keys(reexports);
	}

	includeAllInBundle () {
		this.ast.body.forEach(includeFully);
	}

	includeInBundle () {
		let addedNewNodes = false;
		this.ast.body.forEach((node: Node) => {
			if (node.shouldBeIncluded()) {
				if (node.includeInBundle()) {
					addedNewNodes = true;
				}
			}
		});
		return addedNewNodes;
	}

	processDynamicImports (resolveDynamicImport: ResolveDynamicImportHandler) {
		return Promise.all(this.dynamicImports.map(node => {
			const importArgument = node.parent.arguments[0];
			let dynamicImportSpecifier: string | Node;
			if (importArgument.type === 'TemplateLiteral') {
				if ((<TemplateLiteral>importArgument).expressions.length === 0 && (<TemplateLiteral>importArgument).quasis.length === 1) {
					dynamicImportSpecifier = (<TemplateLiteral>importArgument).quasis[0].value.cooked;
				}
			} else if (importArgument.type === 'Literal') {
				if (typeof (<Literal>importArgument).value === 'string') {
					dynamicImportSpecifier = <string>(<Literal>importArgument).value;
				}
			} else {
				dynamicImportSpecifier = importArgument;
			}

			return Promise.resolve(resolveDynamicImport(dynamicImportSpecifier, this.id))
				.then(replacement => {
					if (!replacement)
						return;

					// string specifier -> direct resolution
					if (typeof dynamicImportSpecifier === 'string') {
						// if we have the module, inline as Promise.resolve(namespace)
						// ensuring that we create a namespace import of it as well
						const replacementModule = this.graph.moduleById.get(replacement);
						if (replacementModule && !replacementModule.isExternal) {
							const namespace = (<Module>replacementModule).namespace();
							namespace.includeVariable();
							const identifierName = namespace.getName(true);
							this.magicString.overwrite(node.parent.start, node.parent.end, `Promise.resolve( ${identifierName} )`);
							// otherwise treat as an external dynamic import resolution
						} else {
							this.magicString.overwrite(importArgument.start, importArgument.end, `"${replacement}"`);
						}
						// AST Node -> source replacement
					} else {
						this.magicString.overwrite(importArgument.start, importArgument.end, replacement);
					}
				});
		}));
	}

	namespace (): NamespaceVariable {
		if (!this.declarations['*']) {
			this.declarations['*'] = new NamespaceVariable(this);
		}

		return this.declarations['*'];
	}

	render (es: boolean, legacy: boolean, freeze: boolean) {
		const magicString = this.magicString.clone();

		for (const node of this.ast.body) {
			node.render(magicString, es);
		}

		if (this.namespace().needsNamespaceBlock) {
			magicString.append(
				'\n\n' + this.namespace().renderBlock(es, legacy, freeze, '\t')
			); // TODO use correct indentation
		}

		// TODO TypeScript: It seems magicString is missing type information here
		return (<any>magicString).trim();
	}

	toJSON (): ModuleJSON {
		return {
			id: this.id,
			dependencies: this.dependencies.map(module => module.id),
			code: this.code,
			originalCode: this.originalCode,
			originalSourcemap: this.originalSourcemap,
			ast: this.astClone,
			sourcemapChain: this.sourcemapChain,
			resolvedIds: this.resolvedIds,
			resolvedExternalIds: this.resolvedExternalIds
		};
	}

	trace (name: string): Variable {
		// TODO this is slightly circular
		if (name in this.scope.variables) {
			return this.scope.variables[name];
		}

		if (name in this.imports) {
			const importDeclaration = this.imports[name];
			const otherModule = importDeclaration.module;

			if (importDeclaration.name === '*' && !otherModule.isExternal) {
				return (<Module>otherModule).namespace();
			}

			const declaration = otherModule.traceExport(importDeclaration.name);

			if (!declaration) {
				missingExport(this, importDeclaration.name, otherModule, importDeclaration.specifier.start);
			}

			return declaration;
		}

		return null;
	}

	traceExport (name: string): Variable {
		// export * from 'external'
		if (name[0] === '*') {
			const module = this.graph.moduleById.get(name.slice(1));
			return module.traceExport('*');
		}

		// export { foo } from './other'
		const reexportDeclaration = this.reexports[name];
		if (reexportDeclaration) {
			const declaration = reexportDeclaration.module.traceExport(
				reexportDeclaration.localName
			);

			if (!declaration) {
				missingExport(this, reexportDeclaration.localName, reexportDeclaration.module, reexportDeclaration.start);
			}

			return declaration;
		}

		const exportDeclaration = this.exports[name];
		if (exportDeclaration) {
			const name = exportDeclaration.localName;
			const declaration = this.trace(name);

			return declaration || this.graph.scope.findVariable(name);
		}

		if (name === 'default') return;

		for (let i = 0; i < this.exportAllModules.length; i += 1) {
			const module = this.exportAllModules[i];
			const declaration = module.traceExport(name);

			if (declaration) return declaration;
		}
	}

	warn (warning: RollupWarning, pos: number) {
		if (pos !== undefined) {
			warning.pos = pos;

			const { line, column } = locate(this.code, pos, { offsetLine: 1 }); // TODO trace sourcemaps, cf. error()

			warning.loc = { file: this.id, line, column };
			warning.frame = getCodeFrame(this.code, line, column);
		}

		warning.id = this.id;
		this.graph.warn(warning);
	}
}
