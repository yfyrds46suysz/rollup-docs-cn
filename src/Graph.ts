import * as acorn from 'acorn';
import injectDynamicImportPlugin from 'acorn-dynamic-import/lib/inject';
import { timeEnd, timeStart } from './utils/flushTime';
import first from './utils/first';
import Module, { IdMap, ModuleJSON } from './Module';
import ExternalModule from './ExternalModule';
import ensureArray from './utils/ensureArray';
import { load, makeOnwarn, resolveId, handleMissingExport } from './utils/defaults';
import { mapSequence } from './utils/promise';
import transform from './utils/transform';
import relativeId from './utils/relativeId';
import error from './utils/error';
import { isAbsolute, isRelative, normalize, relative, resolve } from './utils/path';
import {
	InputOptions,
	IsExternalHook,
	MissingExportHook,
	Plugin,
	ResolveIdHook,
	RollupWarning,
	SourceDescription,
	TreeshakingOptions,
	WarningHandler
} from './rollup/index';
import { RawSourceMap } from 'source-map';
import Program from './ast/nodes/Program';
import { Node } from './ast/nodes/shared/Node';
import Chunk from './Chunk';
import * as path from './utils/path';
import GlobalScope from './ast/scopes/GlobalScope';
import { randomUint8Array, Uint8ArrayXor, Uint8ArrayToHexString } from './utils/entryHashing';
import { blank } from './utils/object';
import firstSync from './utils/first-sync';
import commondir from './utils/commondir';

export type ResolveDynamicImportHandler = (
	specifier: string | Node,
	parentId: string
) => Promise<string | void>;

function generateChunkName(
	id: string,
	chunkNames: { [name: string]: boolean },
	startAtTwo = false,
	inputRelativeDir = ''
): string {
	let name;
	if (inputRelativeDir) {
		name = path.relative(inputRelativeDir, id).replace(/\\/g, '/');
	} else {
		name = path.basename(id);
	}
	let ext = path.extname(name);
	name = name.substr(0, name.length - ext.length);
	if (ext !== '.js' && ext !== '.mjs') {
		name += ext;
		ext = '.js';
	}
	let uniqueName = name;
	let uniqueIndex = startAtTwo ? 2 : 1;
	while (chunkNames[uniqueName]) uniqueName = name + uniqueIndex++;
	chunkNames[uniqueName] = true;
	return uniqueName + ext;
}

export default class Graph {
	acornOptions: acorn.Options;
	acornParse: acorn.IParse;
	cachedModules: Map<string, ModuleJSON>;
	context: string;
	dynamicImport: boolean;
	externalModules: ExternalModule[];
	getModuleContext: (id: string) => string;
	hasLoaders: boolean;
	isExternal: IsExternalHook;
	isPureExternalModule: (id: string) => boolean;
	legacy: boolean;
	load: (id: string) => Promise<SourceDescription | string | void>;
	handleMissingExport: MissingExportHook;
	moduleById: Map<string, Module | ExternalModule>;
	modules: Module[];
	onwarn: WarningHandler;
	plugins: Plugin[];
	resolveDynamicImport: ResolveDynamicImportHandler;
	resolveId: (id: string, parent: string) => Promise<string | boolean | void>;
	scope: GlobalScope;
	treeshakingOptions: TreeshakingOptions;
	varOrConst: 'var' | 'const';

	// deprecated
	treeshake: boolean;

	constructor(options: InputOptions) {
		this.cachedModules = new Map();
		if (options.cache) {
			options.cache.modules.forEach(module => {
				this.cachedModules.set(module.id, module);
			});
		}
		delete options.cache; // TODO not deleting it here causes a memory leak; needs further investigation

		this.plugins = ensureArray(options.plugins);

		options = this.plugins.reduce((acc, plugin) => {
			if (plugin.options) return plugin.options(acc) || acc;
			return acc;
		}, options);

		if (!options.input) {
			throw new Error('You must supply options.input to rollup');
		}

		this.treeshake = options.treeshake !== false;
		if (this.treeshake) {
			this.treeshakingOptions = {
				propertyReadSideEffects: options.treeshake
					? (<TreeshakingOptions>options.treeshake).propertyReadSideEffects !== false
					: true,
				pureExternalModules: options.treeshake
					? (<TreeshakingOptions>options.treeshake).pureExternalModules
					: false
			};
			if (this.treeshakingOptions.pureExternalModules === true) {
				this.isPureExternalModule = () => true;
			} else if (typeof this.treeshakingOptions.pureExternalModules === 'function') {
				this.isPureExternalModule = this.treeshakingOptions.pureExternalModules;
			} else if (Array.isArray(this.treeshakingOptions.pureExternalModules)) {
				const pureExternalModules = new Set(this.treeshakingOptions.pureExternalModules);
				this.isPureExternalModule = id => pureExternalModules.has(id);
			} else {
				this.isPureExternalModule = () => false;
			}
		} else {
			this.isPureExternalModule = () => false;
		}

		this.resolveId = first(
			[
				((id: string, parentId: string) =>
					this.isExternal(id, parentId, false) ? false : null) as ResolveIdHook
			]
				.concat(this.plugins.map(plugin => plugin.resolveId).filter(Boolean))
				.concat(resolveId(options))
		);

		const loaders = this.plugins.map(plugin => plugin.load).filter(Boolean);
		this.hasLoaders = loaders.length !== 0;
		this.load = first(loaders.concat(load));

		this.handleMissingExport = firstSync(
			this.plugins
				.map(plugin => plugin.missingExport)
				.filter(Boolean)
				.concat(handleMissingExport)
		);

		this.scope = new GlobalScope();

		// TODO strictly speaking, this only applies with non-ES6, non-default-only bundles
		['module', 'exports', '_interopDefault'].forEach(name => {
			this.scope.findVariable(name); // creates global variable as side-effect
		});

		this.moduleById = new Map();
		this.modules = [];
		this.externalModules = [];

		this.context = String(options.context);

		const optionsModuleContext = options.moduleContext;
		if (typeof optionsModuleContext === 'function') {
			this.getModuleContext = id => optionsModuleContext(id) || this.context;
		} else if (typeof optionsModuleContext === 'object') {
			const moduleContext = new Map();
			Object.keys(optionsModuleContext).forEach(key =>
				moduleContext.set(resolve(key), optionsModuleContext[key])
			);
			this.getModuleContext = id => moduleContext.get(id) || this.context;
		} else {
			this.getModuleContext = () => this.context;
		}

		if (typeof options.external === 'function') {
			this.isExternal = options.external;
		} else {
			const ids = ensureArray(options.external);
			this.isExternal = id => ids.indexOf(id) !== -1;
		}

		this.onwarn = options.onwarn || makeOnwarn();

		this.varOrConst = options.preferConst ? 'const' : 'var';
		this.legacy = options.legacy;

		this.acornOptions = options.acorn || {};
		const acornPluginsToInject = [];

		this.dynamicImport =
			typeof options.experimentalDynamicImport === 'boolean'
				? options.experimentalDynamicImport
				: false;

		if (this.dynamicImport) {
			this.resolveDynamicImport = first([
				...this.plugins.map(plugin => plugin.resolveDynamicImport).filter(Boolean),
				<ResolveDynamicImportHandler>((specifier, parentId) =>
					typeof specifier === 'string' && this.resolveId(specifier, parentId))
			]);
			acornPluginsToInject.push(injectDynamicImportPlugin);
			this.acornOptions.plugins = this.acornOptions.plugins || {};
			this.acornOptions.plugins.dynamicImport = true;
		}

		acornPluginsToInject.push(...ensureArray(options.acornInjectPlugins));
		this.acornParse = acornPluginsToInject.reduce((acc, plugin) => plugin(acc), acorn).parse;
	}

	getPathRelativeToBaseDirname(resolvedId: string, parentId: string): string {
		if (isRelative(resolvedId) || isAbsolute(resolvedId)) {
			const relativeToEntry = normalize(relative(path.dirname(parentId), resolvedId));

			return isRelative(relativeToEntry) ? relativeToEntry : `./${relativeToEntry}`;
		}

		return resolvedId;
	}

	private loadModule(entryName: string) {
		return this.resolveId(entryName, undefined).then(id => {
			if (id === false) {
				error({
					code: 'UNRESOLVED_ENTRY',
					message: `Entry module cannot be external`
				});
			}

			if (id == null) {
				error({
					code: 'UNRESOLVED_ENTRY',
					message: `Could not resolve entry (${entryName})`
				});
			}

			return this.fetchModule(<string>id, undefined);
		});
	}

	private link() {
		this.modules.forEach(module => module.linkDependencies());
		this.modules.forEach(module => module.bindReferences());
	}

	includeMarked(modules: Module[]) {
		if (this.treeshake) {
			let addedNewNodes;
			do {
				addedNewNodes = false;
				modules.forEach(module => {
					if (module.includeInBundle()) {
						addedNewNodes = true;
					}
				});
			} while (addedNewNodes);
		} else {
			// Necessary to properly replace namespace imports
			modules.forEach(module => module.includeAllInBundle());
		}
	}

	buildSingle(entryModuleId: string): Promise<Chunk> {
		// Phase 1 – discovery. We load the entry module and find which
		// modules it imports, and import those, until we have all
		// of the entry module's dependencies
		timeStart('phase 1');
		return this.loadModule(entryModuleId).then(entryModule => {
			timeEnd('phase 1');

			// Phase 2 - linking. We populate the module dependency links and
			// determine the topological execution order for the bundle
			timeStart('phase 2');

			this.link();

			const { orderedModules, dynamicImports } = this.analyseExecution([entryModule]);

			timeEnd('phase 2');

			// Phase 3 – marking. We include all statements that should be included
			timeStart('phase 3');

			entryModule.markExports();

			dynamicImports.forEach(dynamicImportModule => {
				if (entryModule !== dynamicImportModule) dynamicImportModule.markExports();
				// all dynamic import modules inlined for single-file build
				dynamicImportModule.namespace().includeVariable();
			});

			// only include statements that should appear in the bundle
			this.includeMarked(orderedModules);

			// check for unused external imports
			this.externalModules.forEach(module => module.warnUnusedImports());

			timeEnd('phase 3');

			// Phase 4 – we construct the chunk itself, generating its import and export facades
			timeStart('phase 4');

			// generate the imports and exports for the output chunk file
			const chunk = new Chunk(this, orderedModules);
			chunk.setId(entryModule.id);
			chunk.collectDependencies();
			chunk.generateImports();
			chunk.generateEntryExports(entryModule);

			timeEnd('phase 4');

			return chunk;
		});
	}

	buildChunks(
		entryModuleIds: string[],
		preserveModules: boolean
	): Promise<{ [name: string]: Chunk }> {
		// Phase 1 – discovery. We load the entry module and find which
		// modules it imports, and import those, until we have all
		// of the entry module's dependencies
		timeStart('phase 1');
		return Promise.all(entryModuleIds.map(entryId => this.loadModule(entryId))).then(
			entryModules => {
				timeEnd('phase 1');

				// Phase 2 - linking. We populate the module dependency links and
				// determine the topological execution order for the bundle
				timeStart('phase 2');

				this.link();

				const { orderedModules, dynamicImports } = this.analyseExecution(
					entryModules,
					preserveModules
				);

				dynamicImports.forEach(dynamicImportModule => {
					if (entryModules.indexOf(dynamicImportModule) === -1)
						entryModules.push(dynamicImportModule);
				});

				// Phase 3 – marking. We include all statements that should be included
				timeStart('phase 3');

				entryModules.forEach(entryModule => {
					entryModule.markExports();
				});

				// only include statements that should appear in the bundle
				this.includeMarked(orderedModules);

				// check for unused external imports
				this.externalModules.forEach(module => module.warnUnusedImports());

				timeEnd('phase 3');

				// Phase 4 – we construct the chunks, working out the optimal chunking using
				// entry point graph colouring, before generating the import and export facades
				timeStart('phase 4');

				// TODO: there is one special edge case unhandled here and that is that any module
				//       exposed as an unresolvable export * (to a graph external export *,
				//       either as a namespace import reexported or top-level export *)
				//       should be made to be its own entry point module before chunking
				const chunkList: Chunk[] = [];
				if (!preserveModules) {
					const chunkModules: { [entryHashSum: string]: Module[] } = {};
					orderedModules.forEach(module => {
						const entryPointsHashStr = Uint8ArrayToHexString(module.entryPointsHash);
						let curChunk = chunkModules[entryPointsHashStr];
						if (curChunk) {
							curChunk.push(module);
						} else {
							chunkModules[entryPointsHashStr] = [module];
						}
					});

					// create each chunk
					Object.keys(chunkModules).forEach(entryHashSum => {
						const chunk = chunkModules[entryHashSum];
						const chunkModulesOrdered = chunk.sort(
							(moduleA, moduleB) => (moduleA.execIndex > moduleB.execIndex ? 1 : -1)
						);
						chunkList.push(new Chunk(this, chunkModulesOrdered));
					});
				} else {
					orderedModules.forEach(module => {
						const chunkInstance = new Chunk(this, [module]);
						chunkInstance.entryModule = module;
						chunkInstance.isEntryModuleFacade = true;
						chunkList.push(chunkInstance);
					});
				}

				// for each entry point module, ensure its exports
				// are exported by the chunk itself, with safe name deduping
				entryModules.forEach(entryModule => {
					entryModule.chunk.generateEntryExports(entryModule);
				});
				// for each chunk module, set up its imports to other
				// chunks, if those variables are included after treeshaking
				chunkList.forEach(chunk => {
					chunk.collectDependencies();
					chunk.generateImports();
				});

				// finally prepare output chunks
				const chunks: {
					[name: string]: Chunk;
				} = {};

				let inputRelativeDir: string;
				if (preserveModules) {
					if (orderedModules.length === 1) {
						inputRelativeDir = path.dirname(orderedModules[0].id);
					} else {
						inputRelativeDir = commondir(orderedModules.map(module => module.id));
					}
				}

				// name the chunks
				const chunkNames: { [name: string]: boolean } = blank();
				chunkNames['chunk'] = true;
				chunkList.forEach(chunk => {
					// generate the imports and exports for the output chunk file
					if (chunk.entryModule) {
						const entryName = generateChunkName(
							chunk.entryModule.id,
							chunkNames,
							true,
							inputRelativeDir
						);

						// if the chunk exactly exports the entry point exports then
						// it can replace the entry point
						if (chunk.isEntryModuleFacade || preserveModules) {
							chunks['./' + entryName] = chunk;
							chunk.setId('./' + entryName);
							return;
							// otherwise we create a special re-exporting entry point
							// facade chunk with no modules
						} else {
							const entryPointFacade = new Chunk(this, []);
							entryPointFacade.setId('./' + entryName);
							entryPointFacade.collectDependencies(chunk.entryModule);
							entryPointFacade.generateImports();
							entryPointFacade.generateEntryExports(chunk.entryModule);
							chunks['./' + entryName] = entryPointFacade;
						}
					}
					// name the chunk itself
					const chunkName = generateChunkName('chunk', chunkNames);
					chunk.setId('./' + chunkName);
					chunks['./' + chunkName] = chunk;
				});

				timeEnd('phase 4');

				return chunks;
			}
		);
	}

	private analyseExecution(entryModules: Module[], preserveModules: boolean = false) {
		let curEntry: Module, curEntryHash: Uint8Array;
		const allSeen: { [id: string]: boolean } = {};

		const ordered: Module[] = [];

		const dynamicImports: Module[] = [];

		const visit = (
			module: Module,
			parents: { [id: string]: string | null } = { [module.id]: null }
		) => {
			if (module.isEntryPoint && module !== curEntry) return;

			// Track entry point graph colouring by tracing all modules loaded by a given
			// entry point and colouring those modules by the hash of its id. Colours are mixed as
			// hash xors, providing the unique colouring of the graph into unique hash chunks.
			// This is really all there is to automated chunking, the rest is chunk wiring.
			if (!preserveModules) {
				Uint8ArrayXor(module.entryPointsHash, curEntryHash);
			}

			module.dependencies.forEach(depModule => {
				if (!depModule.isExternal) {
					if (depModule.id in parents) {
						if (!allSeen[depModule.id]) {
							this.warnCycle(depModule.id, module.id, parents);
						}
						return;
					}

					parents[depModule.id] = module.id;
					visit(<Module>depModule, parents);
				}
			});

			if (this.dynamicImport) {
				module.dynamicImportResolutions.forEach(module => {
					if (module instanceof Module) {
						if (dynamicImports.indexOf(module) === -1) {
							dynamicImports.push(module);
						}
					}
				});
			}

			if (allSeen[module.id]) return;
			allSeen[module.id] = true;

			module.execIndex = ordered.length;
			ordered.push(module);
		};

		for (let i = 0; i < entryModules.length; i++) {
			curEntry = entryModules[i];
			curEntry.isEntryPoint = true;
			curEntryHash = randomUint8Array(10);
			visit(curEntry);
		}

		// new items can be added during this loop
		for (let i = 0; i < dynamicImports.length; i++) {
			curEntry = dynamicImports[i];
			curEntry.isEntryPoint = true;
			curEntryHash = randomUint8Array(10);
			visit(curEntry);
		}

		return { orderedModules: ordered, dynamicImports };
	}

	private warnCycle(id: string, parentId: string, parents: { [id: string]: string | null }) {
		const path = [relativeId(id)];
		let curId = parentId;
		while (curId !== id) {
			path.push(relativeId(curId));
			curId = parents[curId];
			if (!curId) break;
		}
		path.push(path[0]);
		path.reverse();
		this.warn({
			code: 'CIRCULAR_DEPENDENCY',
			importer: path[0],
			message: `Circular dependency: ${path.join(' -> ')}`
		});
	}

	private fetchModule(id: string, importer: string): Promise<Module> {
		// short-circuit cycles
		const existingModule = this.moduleById.get(id);
		if (existingModule) {
			if (existingModule.isExternal) throw new Error(`Cannot fetch external module ${id}`);
			return Promise.resolve(<Module>existingModule);
		}

		const module: Module = new Module(this, id);
		this.moduleById.set(id, module);

		return this.load(id)
			.catch((err: Error) => {
				let msg = `Could not load ${id}`;
				if (importer) msg += ` (imported by ${importer})`;

				msg += `: ${err.message}`;
				throw new Error(msg);
			})
			.then(source => {
				if (typeof source === 'string') return source;
				if (source && typeof source === 'object' && typeof source.code === 'string') return source;

				// TODO report which plugin failed
				error({
					code: 'BAD_LOADER',
					message: `Error loading ${relativeId(
						id
					)}: plugin load hook should return a string, a { code, map } object, or nothing/null`
				});
			})
			.then(source => {
				const sourceDescription: SourceDescription =
					typeof source === 'string'
						? {
								code: source,
								ast: null
						  }
						: source;

				if (
					this.cachedModules.has(id) &&
					this.cachedModules.get(id).originalCode === sourceDescription.code
				) {
					return this.cachedModules.get(id);
				}

				return transform(this, sourceDescription, id, this.plugins);
			})
			.then(
				(source: {
					code: string;
					originalCode: string;
					originalSourcemap: RawSourceMap;
					ast: Program;
					sourcemapChain: RawSourceMap[];
					resolvedIds?: IdMap;
				}) => {
					module.setSource(source);

					this.modules.push(module);
					this.moduleById.set(id, module);

					return this.fetchAllDependencies(module).then(() => {
						Object.keys(module.exports).forEach(name => {
							if (name !== 'default') {
								module.exportsAll[name] = module.id;
							}
						});
						module.exportAllSources.forEach(source => {
							const id = module.resolvedIds[source];
							const exportAllModule = this.moduleById.get(id);
							if (exportAllModule.isExternal) return;

							Object.keys((<Module>exportAllModule).exportsAll).forEach(name => {
								if (name in module.exportsAll) {
									this.warn({
										code: 'NAMESPACE_CONFLICT',
										reexporter: module.id,
										name,
										sources: [module.exportsAll[name], (<Module>exportAllModule).exportsAll[name]],
										message: `Conflicting namespaces: ${relativeId(
											module.id
										)} re-exports '${name}' from both ${relativeId(
											module.exportsAll[name]
										)} and ${relativeId(
											(<Module>exportAllModule).exportsAll[name]
										)} (will be ignored)`
									});
								} else {
									module.exportsAll[name] = (<Module>exportAllModule).exportsAll[name];
								}
							});
						});
						return module;
					});
				}
			);
	}

	private fetchAllDependencies(module: Module) {
		// resolve and fetch dynamic imports where possible
		const fetchDynamicImportsPromise = !this.dynamicImport
			? Promise.resolve()
			: Promise.all(
					module.getDynamicImportExpressions().map((dynamicImportExpression, index) => {
						return Promise.resolve(
							this.resolveDynamicImport(dynamicImportExpression, module.id)
						).then(replacement => {
							if (!replacement) {
								module.dynamicImportResolutions[index] = null;
							} else if (typeof dynamicImportExpression !== 'string') {
								module.dynamicImportResolutions[index] = replacement;
							} else if (this.isExternal(replacement, module.id, true)) {
								let externalModule;
								if (!this.moduleById.has(replacement)) {
									externalModule = new ExternalModule({
										graph: this,
										id: replacement
									});
									this.externalModules.push(externalModule);
									this.moduleById.set(replacement, module);
								} else {
									externalModule = <ExternalModule>this.moduleById.get(replacement);
								}
								module.dynamicImportResolutions[index] = externalModule;
								externalModule.exportsNamespace = true;
							} else {
								return this.fetchModule(replacement, module.id).then(depModule => {
									module.dynamicImportResolutions[index] = depModule;
								});
							}
						});
					})
			  ).then(() => {});
		fetchDynamicImportsPromise.catch(() => {});

		return mapSequence(module.sources, source => {
			const resolvedId = module.resolvedIds[source];
			return (resolvedId ? Promise.resolve(resolvedId) : this.resolveId(source, module.id)).then(
				resolvedId => {
					// TODO types of `resolvedId` are not compatable with 'externalId'.
					// `this.resolveId` returns `string`, `void`, and `boolean`
					const externalId =
						<string>resolvedId || (isRelative(source) ? resolve(module.id, '..', source) : source);
					let isExternal = this.isExternal(externalId, module.id, true);

					if (!resolvedId && !isExternal) {
						if (isRelative(source)) {
							error({
								code: 'UNRESOLVED_IMPORT',
								message: `Could not resolve '${source}' from ${relativeId(module.id)}`
							});
						}

						if (resolvedId !== false) {
							this.warn({
								code: 'UNRESOLVED_IMPORT',
								source,
								importer: relativeId(module.id),
								message: `'${source}' is imported by ${relativeId(
									module.id
								)}, but could not be resolved – treating it as an external dependency`,
								url:
									'https://github.com/rollup/rollup/wiki/Troubleshooting#treating-module-as-external-dependency'
							});
						}
						isExternal = true;
					}

					if (isExternal) {
						module.resolvedIds[source] = externalId;

						if (!this.moduleById.has(externalId)) {
							const module = new ExternalModule({ graph: this, id: externalId });
							this.externalModules.push(module);
							this.moduleById.set(externalId, module);
						}

						const externalModule = this.moduleById.get(externalId);

						// add external declarations so we can detect which are never used
						Object.keys(module.imports).forEach(name => {
							const importDeclaration = module.imports[name];
							if (importDeclaration.source !== source) return;

							externalModule.traceExport(importDeclaration.name);
						});
					} else {
						module.resolvedIds[source] = <string>resolvedId;
						return this.fetchModule(<string>resolvedId, module.id);
					}
				}
			);
		}).then(() => fetchDynamicImportsPromise);
	}

	warn(warning: RollupWarning) {
		warning.toString = () => {
			let str = '';

			if (warning.plugin) str += `(${warning.plugin} plugin) `;
			if (warning.loc)
				str += `${relativeId(warning.loc.file)} (${warning.loc.line}:${warning.loc.column}) `;
			str += warning.message;

			return str;
		};

		this.onwarn(warning);
	}
}
