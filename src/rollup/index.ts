import {
	getTimings,
	initialiseTimers,
	SerializedTimings,
	timeEnd,
	timeStart
} from '../utils/timers';
import { basename } from '../utils/path';
import { writeFile } from '../utils/fs';
import { mapSequence } from '../utils/promise';
import error from '../utils/error';
import { SOURCEMAPPING_URL } from '../utils/sourceMappingURL';
import mergeOptions, { GenericConfigObject } from '../utils/mergeOptions';
import { ModuleJSON } from '../Module';
import { RawSourceMap } from 'source-map';
import Program from '../ast/nodes/Program';
import { Node } from '../ast/nodes/shared/Node';
import { WatcherOptions } from '../watch/index';
import { Deprecation } from '../utils/deprecateOptions';
import Graph from '../Graph';
import { TransformContext } from '../utils/transform';
import ensureArray from '../utils/ensureArray';
import { SourceMap } from 'magic-string';

export const VERSION = '<@VERSION@>';

export type SourceDescription = {
	code: string;
	map?: RawSourceMap;
	ast?: Program;
};

export type ResolveIdHook = (
	id: string,
	parent: string
) => Promise<string | boolean | void> | string | boolean | void;
export type MissingExportHook = (
	exportName: string,
	importingModule: string,
	importedModule: string,
	importerStart?: number
) => void;
export type IsExternalHook = (
	id: string,
	parentId: string,
	isResolved: boolean
) => Promise<boolean | void> | boolean | void;
export type LoadHook = (
	id: string
) => Promise<SourceDescription | string | void> | SourceDescription | string | void;
export type TransformHook = (
	this: TransformContext,
	code: string,
	id: String
) => Promise<SourceDescription | string | void>;
export type TransformBundleHook = (
	code: string,
	options: OutputOptions
) => Promise<SourceDescription | string>;
export type ResolveDynamicImportHook = (
	specifier: string | Node,
	parentId: string
) => Promise<string | void> | string | void;

export interface Plugin {
	name: string;
	options?: (options: InputOptions) => void;
	load?: LoadHook;
	resolveId?: ResolveIdHook;
	missingExport?: MissingExportHook;
	transform?: TransformHook;
	transformBundle?: TransformBundleHook;
	ongenerate?: (options: OutputOptions, source: SourceDescription) => void;
	onwrite?: (options: OutputOptions, source: SourceDescription) => void;
	resolveDynamicImport?: ResolveDynamicImportHook;

	banner?: () => string;
	footer?: () => string;
	intro?: () => string;
	outro?: () => string;
}

export interface TreeshakingOptions {
	propertyReadSideEffects: boolean;
	pureExternalModules: boolean;
}

export type ExternalOption = string[] | IsExternalHook;
export type GlobalsOption = { [name: string]: string } | ((name: string) => string);

export type CachedChunk = { modules: ModuleJSON[] };
export type CachedChunkSet = { chunks: { [chunkName: string]: CachedChunk } };
export interface InputOptions {
	input: string | string[] | { [entryAlias: string]: string };
	external?: ExternalOption;
	plugins?: Plugin[];

	onwarn?: WarningHandler;
	cache?: CachedChunk | CachedChunkSet;

	acorn?: {};
	acornInjectPlugins?: Function[];
	treeshake?: boolean | TreeshakingOptions;
	context?: string;
	moduleContext?: string | ((id: string) => string) | { [id: string]: string };
	watch?: WatcherOptions;
	experimentalDynamicImport?: boolean;
	experimentalCodeSplitting?: boolean;
	preserveSymlinks?: boolean;
	experimentalPreserveModules?: boolean;

	// undocumented?
	pureExternalModules?: boolean;
	preferConst?: boolean;
	perf?: boolean;

	// deprecated
	entry?: string;
	transform?: TransformHook;
	load?: LoadHook;
	resolveId?: ResolveIdHook;
	resolveExternal?: any;
}

export type ModuleFormat = 'amd' | 'cjs' | 'system' | 'es' | 'es6' | 'iife' | 'umd';

export interface OutputOptions {
	// only required for bundle.write
	file?: string;
	// only required for bundles.write
	dir?: string;
	// this is optional at the base-level of RollupWatchOptions,
	// which extends from this interface through config merge
	format?: ModuleFormat;
	name?: string;
	globals?: GlobalsOption;

	paths?: Record<string, string> | ((id: string, parent: string) => string);
	banner?: string;
	footer?: string;
	intro?: string;
	outro?: string;
	sourcemap?: boolean | 'inline';
	sourcemapFile?: string;
	interop?: boolean;
	extend?: boolean;

	exports?: 'default' | 'named' | 'none' | 'auto';
	amd?: {
		id?: string;
		define?: string;
	};
	indent?: boolean;
	strict?: boolean;
	freeze?: boolean;
	namespaceToStringTag?: boolean;
	legacy?: boolean;

	// undocumented?
	noConflict?: boolean;

	// deprecated
	dest?: string;
	moduleId?: string;
}

export interface RollupWarning {
	message?: string;
	code?: string;
	loc?: {
		file: string;
		line: number;
		column: number;
	};
	deprecations?: { old: string; new: string }[];
	modules?: string[];
	names?: string[];
	source?: string;
	importer?: string;
	frame?: any;
	missing?: string;
	exporter?: string;
	name?: string;
	sources?: string[];
	reexporter?: string;
	guess?: string;
	url?: string;
	id?: string;
	plugin?: string;
	pos?: number;
	pluginCode?: string;
}

export type WarningHandler = (warning: string | RollupWarning) => void;

function addDeprecations(deprecations: Deprecation[], warn: WarningHandler) {
	const message = `The following options have been renamed — please update your config: ${deprecations
		.map(option => `${option.old} -> ${option.new}`)
		.join(', ')}`;
	warn({
		code: 'DEPRECATED_OPTIONS',
		message,
		deprecations
	});
}

function checkInputOptions(options: InputOptions) {
	if (options.transform || options.load || options.resolveId || options.resolveExternal) {
		throw new Error(
			'The `transform`, `load`, `resolveId` and `resolveExternal` options are deprecated in favour of a unified plugin API. See https://github.com/rollup/rollup/wiki/Plugins for details'
		);
	}
}

function checkOutputOptions(options: OutputOptions) {
	if (options.format === 'es6') {
		error({
			message: 'The `es6` output format is deprecated – use `es` instead',
			url: `https://rollupjs.org/#format-f-output-format-`
		});
	}

	if (!options.format) {
		error({
			message: `You must specify options.format, which can be one of 'amd', 'cjs', 'system', 'es', 'iife' or 'umd'`,
			url: `https://rollupjs.org/#format-f-output-format-`
		});
	}

	if (options.moduleId) {
		if (options.amd) throw new Error('Cannot have both options.amd and options.moduleId');
	}
}

const throwAsyncGenerateError = {
	get() {
		throw new Error(`bundle.generate(...) now returns a Promise instead of a { code, map } object`);
	}
};

export interface OutputChunk {
	imports: string[];
	exports: string[];
	modules: ModuleJSON[];

	generate: (outputOptions: OutputOptions) => Promise<{ code: string; map: SourceMap }>;
	write: (options: OutputOptions) => Promise<void>;
	getTimings?: () => SerializedTimings;
}

function applyOptionHook(inputOptions: InputOptions, plugin: Plugin) {
	if (plugin.options) return plugin.options(inputOptions) || inputOptions;
	return inputOptions;
}

function getInputOptions(rawInputOptions: GenericConfigObject): any {
	if (!rawInputOptions) {
		throw new Error('You must supply an options object to rollup');
	}
	const { inputOptions, deprecations, optionError } = mergeOptions({
		config: rawInputOptions,
		deprecateConfig: { input: true }
	});

	if (optionError) inputOptions.onwarn({ message: optionError, code: 'UNKNOWN_OPTION' });
	if (deprecations.length) addDeprecations(deprecations, inputOptions.onwarn);

	checkInputOptions(inputOptions);
	inputOptions.plugins = ensureArray(inputOptions.plugins);
	return inputOptions.plugins.reduce(applyOptionHook, inputOptions);
}

export interface OutputChunkSet {
	chunks: {
		[chunkName: string]: {
			name: string;
			imports: string[];
			exports: string[];
			modules: ModuleJSON[];
		};
	};
	generate: (outputOptions: OutputOptions) => Promise<{ [chunkName: string]: SourceDescription }>;
	write: (options: OutputOptions) => Promise<void>;
	getTimings?: () => SerializedTimings;
}

export default function rollup(
	rawInputOptions: InputOptions
): Promise<OutputChunk | OutputChunkSet>;
export default function rollup(
	rawInputOptions: GenericConfigObject
): Promise<OutputChunk | OutputChunkSet> {
	try {
		const inputOptions = getInputOptions(rawInputOptions);
		initialiseTimers(inputOptions);
		const graph = new Graph(inputOptions);

		timeStart('BUILD', 1);

		const codeSplitting =
			(inputOptions.experimentalCodeSplitting && typeof inputOptions.input !== 'string') ||
			inputOptions.experimentalPreserveModules;

		if (!codeSplitting)
			return graph.buildSingle(inputOptions.input).then(chunk => {
				timeEnd('BUILD', 1);

				function generate(rawOutputOptions: GenericConfigObject) {
					const outputOptions = normalizeOutputOptions(inputOptions, rawOutputOptions);

					timeStart('GENERATE', 1);

					const promise = Promise.resolve()
						.then(() => chunk.render(outputOptions))
						.then(rendered => {
							timeEnd('GENERATE', 1);

							graph.plugins.forEach(plugin => {
								if (plugin.ongenerate) {
									plugin.ongenerate(
										Object.assign(
											{
												bundle: result
											},
											outputOptions
										),
										rendered
									);
								}
							});

							return rendered;
						});

					Object.defineProperty(promise, 'code', throwAsyncGenerateError);
					Object.defineProperty(promise, 'map', throwAsyncGenerateError);

					return promise;
				}

				const result: OutputChunk = {
					imports: chunk.getImportIds(),
					exports: chunk.getExportNames(),
					modules: chunk.getJsonModules(),

					generate,
					write: (outputOptions: OutputOptions) => {
						if (!outputOptions || (!outputOptions.file && !outputOptions.dest)) {
							error({
								code: 'MISSING_OPTION',
								message: 'You must specify output.file'
							});
						}

						return generate(outputOptions).then(result => {
							const file = outputOptions.file;
							let { code, map } = result;

							const promises = [];

							if (outputOptions.sourcemap) {
								let url;

								if (outputOptions.sourcemap === 'inline') {
									url = map.toUrl();
								} else {
									url = `${basename(file)}.map`;
									promises.push(writeFile(file + '.map', map.toString()));
								}

								code += `//# ${SOURCEMAPPING_URL}=${url}\n`;
							}

							promises.push(writeFile(file, code));
							return (
								Promise.all(promises)
									.then(() =>
										mapSequence(graph.plugins.filter(plugin => plugin.onwrite), (plugin: Plugin) =>
											Promise.resolve(
												plugin.onwrite(
													Object.assign(
														{
															bundle: result
														},
														outputOptions
													),
													result
												)
											)
										)
									)
									// ensures return isn't void[]
									.then(() => {})
							);
						});
					}
				};

				if (inputOptions.perf === true) {
					result.getTimings = getTimings;
				}
				return result;
			});

		// code splitting case
		if (inputOptions.experimentalPreserveModules && typeof inputOptions.input === 'string') {
			inputOptions.input = [inputOptions.input];
		}
		if (!(Array.isArray(inputOptions.input) || typeof inputOptions.input === 'object')) {
			error({
				code: 'INVALID_OPTION',
				message: 'When code splitting, "input" must be an array or object of entry points.'
			});
		}
		return graph
			.buildChunks(inputOptions.input, inputOptions.experimentalPreserveModules)
			.then(bundle => {
				timeEnd('BUILD', 1);
				const chunks: {
					[name: string]: {
						name: string;
						imports: string[];
						exports: string[];
						modules: ModuleJSON[];
					};
				} = {};
				Object.keys(bundle).forEach(chunkName => {
					const chunk = bundle[chunkName];

					chunks[chunkName] = {
						name: chunkName,
						imports: chunk.getImportIds(),
						exports: chunk.getExportNames(),
						modules: chunk.getJsonModules()
					};
				});

				function generate(rawOutputOptions: GenericConfigObject) {
					const outputOptions = normalizeOutputOptions(inputOptions, rawOutputOptions);

					if (typeof outputOptions.file === 'string')
						error({
							code: 'INVALID_OPTION',
							message: 'When code splitting, the "dir" output option must be used, not "file".'
						});

					if (outputOptions.format === 'umd' || outputOptions.format === 'iife') {
						error({
							code: 'INVALID_OPTION',
							message:
								'UMD and IIFE output formats are not supported with the experimentalCodeSplitting option.'
						});
					}

					timeStart('GENERATE', 1);

					const generated: { [chunkName: string]: SourceDescription } = {};

					const promise = Promise.all(
						Object.keys(bundle).map(chunkName => {
							const chunk = bundle[chunkName];
							return chunk.render(outputOptions).then(rendered => {
								timeEnd('GENERATE', 1);

								graph.plugins.forEach(plugin => {
									if (plugin.ongenerate) {
										const bundle = chunks[chunkName];
										plugin.ongenerate(Object.assign({ bundle }, outputOptions), rendered);
									}
								});

								generated[chunkName] = rendered;
							});
						})
					).then(() => generated);

					Object.defineProperty(promise, 'code', throwAsyncGenerateError);
					Object.defineProperty(promise, 'map', throwAsyncGenerateError);

					return promise;
				}

				const result: OutputChunkSet = {
					chunks: chunks,
					generate,
					write(outputOptions: OutputOptions): Promise<void> {
						if (!outputOptions || !outputOptions.dir) {
							error({
								code: 'MISSING_OPTION',
								message: 'You must specify output.dir when code splitting'
							});
						}

						return generate(outputOptions).then(result => {
							const dir = outputOptions.dir;

							return Promise.all(
								Object.keys(result).map(chunkName => {
									let chunk = result[chunkName];
									let { code, map } = chunk;

									const promises = [];

									if (outputOptions.sourcemap) {
										let url;

										if (outputOptions.sourcemap === 'inline') {
											url = (<any>map).toUrl();
										} else {
											url = `${chunkName}.map`;
											promises.push(writeFile(dir + '/' + chunkName + '.map', map.toString()));
										}

										code += `//# ${SOURCEMAPPING_URL}=${url}\n`;
									}

									promises.push(writeFile(dir + '/' + chunkName, code));
									return Promise.all(promises).then(() => {
										return mapSequence(
											graph.plugins.filter(plugin => plugin.onwrite),
											(plugin: Plugin) =>
												Promise.resolve(
													plugin.onwrite(Object.assign({ bundle: chunk }, outputOptions), chunk)
												)
										);
									});
								})
							).then(() => {}); // ensures return void and not void[][]
						});
					}
				};

				if (inputOptions.perf === true) {
					result.getTimings = getTimings;
				}
				return result;
			});
	} catch (err) {
		return Promise.reject(err);
	}
}

function normalizeOutputOptions(
	inputOptions: GenericConfigObject,
	rawOutputOptions: GenericConfigObject
): OutputOptions {
	if (!rawOutputOptions) {
		throw new Error('You must supply an options object');
	}
	// since deprecateOptions, adds the output properties
	// to `inputOptions` so adding that lastly
	const consolidatedOutputOptions = Object.assign(
		{},
		{
			output: Object.assign({}, rawOutputOptions, rawOutputOptions.output, inputOptions.output)
		}
	);
	const mergedOptions = mergeOptions({
		// just for backward compatiblity to fallback on root
		// if the option isn't present in `output`
		config: consolidatedOutputOptions,
		deprecateConfig: { output: true }
	});

	if (mergedOptions.optionError) throw new Error(mergedOptions.optionError);

	// now outputOptions is an array, but rollup.rollup API doesn't support arrays
	const outputOptions = mergedOptions.outputOptions[0];
	const deprecations = mergedOptions.deprecations;

	if (deprecations.length) addDeprecations(deprecations, inputOptions.onwarn);
	checkOutputOptions(outputOptions);

	return outputOptions;
}
