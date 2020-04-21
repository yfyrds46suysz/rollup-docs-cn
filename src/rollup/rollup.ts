import { version as rollupVersion } from 'package.json';
import Chunk from '../Chunk';
import Graph from '../Graph';
import { createAddons } from '../utils/addons';
import { assignChunkIds } from '../utils/assignChunkIds';
import commondir from '../utils/commondir';
import { errCannotEmitFromOptionsHook, error } from '../utils/error';
import { writeFile } from '../utils/fs';
import getExportMode from '../utils/getExportMode';
import {
	ensureArray,
	GenericConfigObject,
	parseInputOptions,
	parseOutputOptions
} from '../utils/parseOptions';
import { basename, dirname, isAbsolute, resolve } from '../utils/path';
import { PluginDriver } from '../utils/PluginDriver';
import { ANONYMOUS_OUTPUT_PLUGIN_PREFIX, ANONYMOUS_PLUGIN_PREFIX } from '../utils/pluginUtils';
import { SOURCEMAPPING_URL } from '../utils/sourceMappingURL';
import { getTimings, initialiseTimers, timeEnd, timeStart } from '../utils/timers';
import {
	InputOptions,
	OutputAsset,
	OutputBundle,
	OutputBundleWithPlaceholders,
	OutputChunk,
	OutputOptions,
	Plugin,
	RollupBuild,
	RollupOutput,
	RollupWatcher,
	WarningHandler
} from './types';

function getAbsoluteEntryModulePaths(chunks: Chunk[]): string[] {
	const absoluteEntryModulePaths: string[] = [];
	for (const chunk of chunks) {
		for (const entryModule of chunk.entryModules) {
			if (isAbsolute(entryModule.id)) {
				absoluteEntryModulePaths.push(entryModule.id);
			}
		}
	}
	return absoluteEntryModulePaths;
}

function applyOptionHook(inputOptions: InputOptions, plugin: Plugin) {
	if (plugin.options)
		return plugin.options.call({ meta: { rollupVersion } }, inputOptions) || inputOptions;

	return inputOptions;
}

function normalizePlugins(rawPlugins: any, anonymousPrefix: string): Plugin[] {
	const plugins = ensureArray(rawPlugins);
	for (let pluginIndex = 0; pluginIndex < plugins.length; pluginIndex++) {
		const plugin = plugins[pluginIndex];
		if (!plugin.name) {
			plugin.name = `${anonymousPrefix}${pluginIndex + 1}`;
		}
	}
	return plugins;
}

function getInputOptions(rawInputOptions: GenericConfigObject): InputOptions {
	if (!rawInputOptions) {
		throw new Error('You must supply an options object to rollup');
	}
	let inputOptions = parseInputOptions(rawInputOptions);
	inputOptions = inputOptions.plugins!.reduce(applyOptionHook, inputOptions);
	inputOptions.plugins = normalizePlugins(inputOptions.plugins!, ANONYMOUS_PLUGIN_PREFIX);

	if (inputOptions.inlineDynamicImports) {
		if (inputOptions.preserveModules)
			return error({
				code: 'INVALID_OPTION',
				message: `"preserveModules" does not support the "inlineDynamicImports" option.`
			});
		if (inputOptions.manualChunks)
			return error({
				code: 'INVALID_OPTION',
				message: '"manualChunks" option is not supported for "inlineDynamicImports".'
			});
		if (
			(inputOptions.input instanceof Array && inputOptions.input.length > 1) ||
			(typeof inputOptions.input === 'object' && Object.keys(inputOptions.input).length > 1)
		)
			return error({
				code: 'INVALID_OPTION',
				message: 'Multiple inputs are not supported for "inlineDynamicImports".'
			});
	} else if (inputOptions.preserveModules) {
		if (inputOptions.manualChunks)
			return error({
				code: 'INVALID_OPTION',
				message: '"preserveModules" does not support the "manualChunks" option.'
			});
		if (inputOptions.preserveEntrySignatures === false)
			return error({
				code: 'INVALID_OPTION',
				message: '"preserveModules" does not support setting "preserveEntrySignatures" to "false".'
			});
	}

	return inputOptions;
}

function assignChunksToBundle(
	chunks: Chunk[],
	outputBundle: OutputBundleWithPlaceholders
): OutputBundle {
	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const facadeModule = chunk.facadeModule;

		outputBundle[chunk.id!] = {
			code: undefined as any,
			dynamicImports: chunk.getDynamicImportIds(),
			exports: chunk.getExportNames(),
			facadeModuleId: facadeModule && facadeModule.id,
			fileName: chunk.id,
			imports: chunk.getImportIds(),
			isDynamicEntry: facadeModule !== null && facadeModule.dynamicallyImportedBy.length > 0,
			isEntry: facadeModule !== null && facadeModule.isEntryPoint,
			map: undefined,
			modules: chunk.renderedModules,
			get name() {
				return chunk.getChunkName();
			},
			type: 'chunk'
		} as OutputChunk;
	}
	return outputBundle as OutputBundle;
}

export default function rollup(rawInputOptions: GenericConfigObject): Promise<RollupBuild> {
	return rollupInternal(rawInputOptions, null);
}

export async function rollupInternal(
	rawInputOptions: GenericConfigObject,
	watcher: RollupWatcher | null
): Promise<RollupBuild> {
	const inputOptions = getInputOptions(rawInputOptions);
	initialiseTimers(inputOptions);

	const graph = new Graph(inputOptions, watcher);

	// remove the cache option from the memory after graph creation (cache is not used anymore)
	const useCache = rawInputOptions.cache !== false;
	delete inputOptions.cache;
	delete rawInputOptions.cache;

	timeStart('BUILD', 1);

	let chunks: Chunk[];
	try {
		await graph.pluginDriver.hookParallel('buildStart', [inputOptions]);
		chunks = await graph.build(
			inputOptions.input as string | string[] | Record<string, string>,
			inputOptions.manualChunks,
			inputOptions.inlineDynamicImports!
		);
	} catch (err) {
		const watchFiles = Object.keys(graph.watchFiles);
		if (watchFiles.length > 0) {
			err.watchFiles = watchFiles;
		}
		await graph.pluginDriver.hookParallel('buildEnd', [err]);
		throw err;
	}

	await graph.pluginDriver.hookParallel('buildEnd', []);

	timeEnd('BUILD', 1);

	function getOutputOptionsAndPluginDriver(
		rawOutputOptions: GenericConfigObject
	): { outputOptions: OutputOptions; outputPluginDriver: PluginDriver } {
		if (!rawOutputOptions) {
			throw new Error('You must supply an options object');
		}
		const outputPluginDriver = graph.pluginDriver.createOutputPluginDriver(
			normalizePlugins(rawOutputOptions.plugins, ANONYMOUS_OUTPUT_PLUGIN_PREFIX)
		);

		return {
			outputOptions: normalizeOutputOptions(
				inputOptions as GenericConfigObject,
				rawOutputOptions,
				chunks.length > 1,
				outputPluginDriver
			),
			outputPluginDriver
		};
	}

	async function generate(
		outputOptions: OutputOptions,
		isWrite: boolean,
		outputPluginDriver: PluginDriver
	): Promise<OutputBundle> {
		timeStart('GENERATE', 1);

		if (outputOptions.dynamicImportFunction) {
			graph.warnDeprecation(
				`The "output.dynamicImportFunction" option is deprecated. Use the "renderDynamicImport" plugin hook instead.`,
				false
			);
		}
		const assetFileNames = outputOptions.assetFileNames || 'assets/[name]-[hash][extname]';
		const inputBase = commondir(getAbsoluteEntryModulePaths(chunks));
		const outputBundleWithPlaceholders: OutputBundleWithPlaceholders = Object.create(null);
		outputPluginDriver.setOutputBundle(outputBundleWithPlaceholders, assetFileNames);
		let outputBundle;

		try {
			await outputPluginDriver.hookParallel('renderStart', [outputOptions, inputOptions]);
			const addons = await createAddons(outputOptions, outputPluginDriver);
			for (const chunk of chunks) {
				chunk.generateExports(outputOptions);
				if (inputOptions.preserveModules || (chunk.facadeModule && chunk.facadeModule.isEntryPoint))
					chunk.exportMode = getExportMode(chunk, outputOptions, chunk.facadeModule!.id);
			}
			for (const chunk of chunks) {
				chunk.preRender(outputOptions, inputBase, outputPluginDriver);
			}
			assignChunkIds(
				chunks,
				inputOptions,
				outputOptions,
				inputBase,
				addons,
				outputBundleWithPlaceholders,
				outputPluginDriver
			);
			outputBundle = assignChunksToBundle(chunks, outputBundleWithPlaceholders);

			await Promise.all(
				chunks.map(chunk => {
					const outputChunk = outputBundleWithPlaceholders[chunk.id!] as OutputChunk;
					return chunk
						.render(outputOptions, addons, outputChunk, outputPluginDriver)
						.then(rendered => {
							outputChunk.code = rendered.code;
							outputChunk.map = rendered.map;
						});
				})
			);
		} catch (error) {
			await outputPluginDriver.hookParallel('renderError', [error]);
			throw error;
		}
		await outputPluginDriver.hookSeq('generateBundle', [outputOptions, outputBundle, isWrite]);
		for (const key of Object.keys(outputBundle)) {
			const file = outputBundle[key] as any;
			if (!file.type) {
				graph.warnDeprecation(
					'A plugin is directly adding properties to the bundle object in the "generateBundle" hook. This is deprecated and will be removed in a future Rollup version, please use "this.emitFile" instead.',
					true
				);
				file.type = 'asset';
			}
		}
		outputPluginDriver.finaliseAssets();

		timeEnd('GENERATE', 1);
		return outputBundle;
	}

	const cache = useCache ? graph.getCache() : undefined;
	const result: RollupBuild = {
		cache: cache!,
		generate: (rawOutputOptions: OutputOptions) => {
			const { outputOptions, outputPluginDriver } = getOutputOptionsAndPluginDriver(
				rawOutputOptions as GenericConfigObject
			);
			return generate(outputOptions, false, outputPluginDriver).then(result =>
				createOutput(result)
			);
		},
		watchFiles: Object.keys(graph.watchFiles),
		write: (rawOutputOptions: OutputOptions) => {
			const { outputOptions, outputPluginDriver } = getOutputOptionsAndPluginDriver(
				rawOutputOptions as GenericConfigObject
			);
			if (!outputOptions.dir && !outputOptions.file) {
				return error({
					code: 'MISSING_OPTION',
					message: 'You must specify "output.file" or "output.dir" for the build.'
				});
			}
			return generate(outputOptions, true, outputPluginDriver).then(async bundle => {
				await Promise.all(
					Object.keys(bundle).map(chunkId => writeOutputFile(bundle[chunkId], outputOptions))
				);
				await outputPluginDriver.hookParallel('writeBundle', [outputOptions, bundle]);
				return createOutput(bundle);
			});
		}
	};
	if (inputOptions.perf === true) result.getTimings = getTimings;
	return result;
}

enum SortingFileType {
	ENTRY_CHUNK = 0,
	SECONDARY_CHUNK = 1,
	ASSET = 2
}

function getSortingFileType(file: OutputAsset | OutputChunk): SortingFileType {
	if (file.type === 'asset') {
		return SortingFileType.ASSET;
	}
	if (file.isEntry) {
		return SortingFileType.ENTRY_CHUNK;
	}
	return SortingFileType.SECONDARY_CHUNK;
}

function createOutput(outputBundle: Record<string, OutputChunk | OutputAsset | {}>): RollupOutput {
	return {
		output: (Object.keys(outputBundle)
			.map(fileName => outputBundle[fileName])
			.filter(outputFile => Object.keys(outputFile).length > 0) as (
			| OutputChunk
			| OutputAsset
		)[]).sort((outputFileA, outputFileB) => {
			const fileTypeA = getSortingFileType(outputFileA);
			const fileTypeB = getSortingFileType(outputFileB);
			if (fileTypeA === fileTypeB) return 0;
			return fileTypeA < fileTypeB ? -1 : 1;
		}) as [OutputChunk, ...(OutputChunk | OutputAsset)[]]
	};
}

function writeOutputFile(
	outputFile: OutputAsset | OutputChunk,
	outputOptions: OutputOptions
): Promise<unknown> {
	const fileName = resolve(outputOptions.dir || dirname(outputOptions.file!), outputFile.fileName);
	let writeSourceMapPromise: Promise<void> | undefined;
	let source: string | Uint8Array;
	if (outputFile.type === 'asset') {
		source = outputFile.source;
	} else {
		source = outputFile.code;
		if (outputOptions.sourcemap && outputFile.map) {
			let url: string;
			if (outputOptions.sourcemap === 'inline') {
				url = outputFile.map.toUrl();
			} else {
				url = `${basename(outputFile.fileName)}.map`;
				writeSourceMapPromise = writeFile(`${fileName}.map`, outputFile.map.toString());
			}
			if (outputOptions.sourcemap !== 'hidden') {
				source += `//# ${SOURCEMAPPING_URL}=${url}\n`;
			}
		}
	}

	return Promise.all([writeFile(fileName, source), writeSourceMapPromise]);
}

function normalizeOutputOptions(
	inputOptions: GenericConfigObject,
	rawOutputOptions: GenericConfigObject,
	hasMultipleChunks: boolean,
	outputPluginDriver: PluginDriver
): OutputOptions {
	const outputOptions = parseOutputOptions(
		outputPluginDriver.hookReduceArg0Sync(
			'outputOptions',
			[rawOutputOptions.output || inputOptions.output || rawOutputOptions] as [OutputOptions],
			(outputOptions, result) => result || outputOptions,
			pluginContext => {
				const emitError = () => pluginContext.error(errCannotEmitFromOptionsHook());
				return {
					...pluginContext,
					emitFile: emitError,
					setAssetSource: emitError
				};
			}
		) as GenericConfigObject,
		inputOptions.onwarn as WarningHandler
	);

	if (typeof outputOptions.file === 'string') {
		if (typeof outputOptions.dir === 'string')
			return error({
				code: 'INVALID_OPTION',
				message:
					'You must set either "output.file" for a single-file build or "output.dir" when generating multiple chunks.'
			});
		if (inputOptions.preserveModules) {
			return error({
				code: 'INVALID_OPTION',
				message:
					'You must set "output.dir" instead of "output.file" when using the "preserveModules" option.'
			});
		}
		if (typeof inputOptions.input === 'object' && !Array.isArray(inputOptions.input))
			return error({
				code: 'INVALID_OPTION',
				message: 'You must set "output.dir" instead of "output.file" when providing named inputs.'
			});
	}

	if (hasMultipleChunks) {
		if (outputOptions.format === 'umd' || outputOptions.format === 'iife')
			return error({
				code: 'INVALID_OPTION',
				message: 'UMD and IIFE output formats are not supported for code-splitting builds.'
			});
		if (typeof outputOptions.file === 'string')
			return error({
				code: 'INVALID_OPTION',
				message:
					'When building multiple chunks, the "output.dir" option must be used, not "output.file". ' +
					'To inline dynamic imports, set the "inlineDynamicImports" option.'
			});
		if (outputOptions.sourcemapFile)
			return error({
				code: 'INVALID_OPTION',
				message: '"output.sourcemapFile" is only supported for single-file builds.'
			});
	}

	return outputOptions;
}
