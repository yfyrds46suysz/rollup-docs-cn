import { decode } from 'sourcemap-codec';
import Chunk from '../Chunk';
import Graph from '../Graph';
import { OutputOptions, RawSourceMap } from '../rollup/types';
import error from './error';

export default function transformChunk(
	graph: Graph,
	chunk: Chunk,
	code: string,
	sourcemapChain: RawSourceMap[],
	options: OutputOptions
) {
	return graph.plugins.reduce((promise, plugin) => {
		if (!plugin.transformBundle && !plugin.transformChunk) return promise;

		return promise.then(code => {
			return Promise.resolve()
				.then(() =>
					(plugin.transformChunk || plugin.transformBundle).call(
						graph.pluginContext,
						code,
						options,
						chunk
					)
				)
				.then(result => {
					if (result == null) return code;

					if (plugin.transformBundle) {
						if (typeof result === 'string') {
							result = {
								code: result,
								map: undefined
							};
						}
					} else if (typeof result === 'string') {
						throw new Error('transformChunk must return a { code, map } object, not a string.');
					} else if (!result.map && options.sourcemap) {
						throw new Error(
							'transformChunk must return a "map" sourcemap property when sourcemaps are enabled.'
						);
					}

					const map = typeof result.map === 'string' ? JSON.parse(result.map) : result.map;
					if (map && typeof map.mappings === 'string') {
						map.mappings = decode(map.mappings);
					}

					// strict null check allows 'null' maps to not be pushed to the chain, while 'undefined' gets the missing map warning
					if (map !== null) {
						sourcemapChain.push(map || { missing: true, plugin: plugin.name });
					}

					return result.code;
				})
				.catch(err => {
					error({
						code: plugin.transformChunk ? 'BAD_CHUNK_TRANSFORMER' : 'BAD_BUNDLE_TRANSFORMER',
						message: `Error transforming ${(plugin.transformChunk ? 'chunk' : 'bundle') +
							(plugin.name ? ` with '${plugin.name}' plugin` : '')}: ${err.message}`,
						plugin: plugin.name
					});
				});
		});
	}, Promise.resolve(code));
}
