import Chunk from './Chunk';
import ExternalModule from './ExternalModule';
import { OutputOptions } from './rollup';

/*
 * Given a chunk list, perform optimizations on that chunk list
 * to reduce the mumber of chunks. Mutates the chunks array.
 *
 * Manual chunks (with chunk.chunkAlias already set) are preserved
 * Entry points are carefully preserved as well
 *
 */
export function optimizeChunks(
	chunks: Chunk[],
	options: OutputOptions,
	CHUNK_GROUPING_SIZE = 5000
): Chunk[] {
	const chunkSize = new Map<Chunk, number>();
	function getChunkSize(chunk: Chunk) {
		let size = chunkSize.get(chunk);
		if (size) return size;
		size = chunk.getRenderedSourceLength();
		chunkSize.set(chunk, size);
		return size;
	}

	for (let i = 0; i < chunks.length; i++) {
		const mainChunk = chunks[i];
		const execGroup: Chunk[] = [];
		mainChunk.postVisit(dep => {
			if (dep instanceof Chunk) {
				execGroup.push(dep);
			}
		});

		if (execGroup.length < 2) {
			continue;
		}

		let j = 1;
		let seekingFirstChunkForMerge = true;
		let lastChunk: Chunk,
			chunk = execGroup[0],
			nextChunk = execGroup[1];

		do {
			if (seekingFirstChunkForMerge) {
				if (chunk.isEntryModuleFacade || chunk.isManualChunk) {
					continue;
				}
				if (!nextChunk || nextChunk.isEntryModuleFacade) {
					continue;
				}
				if (getChunkSize(chunk) > CHUNK_GROUPING_SIZE) {
					continue;
				}
				// if (!chunk.isPure()) continue;
				seekingFirstChunkForMerge = false;
				continue;
			}

			let remainingSize = CHUNK_GROUPING_SIZE - getChunkSize(lastChunk) - getChunkSize(chunk);
			if (remainingSize <= 0) {
				seekingFirstChunkForMerge = true;
				continue;
			}
			// if (!chunk.isPure()) continue;

			const chunkDependencies: (Chunk | External)[] = [];
			chunk.postVisit(dep => chunkDependencies.push(dep));

			const countedChunks: (Chunk | External)[] = [chunk, lastChunk];
			if (
				lastChunk.postVisit(dep => {
					if (dep === chunk || dep === lastChunk) {
						return false;
					}
					if (chunkDependencies.indexOf(dep) !== -1) {
						return false;
					}
					if (dep instanceof ExternalModule) {
						return true;
					}
					remainingSize -= getChunkSize(dep);
					if (remainingSize <= 0) {
						return true;
					}
					countedChunks.push(dep);
				})
			) {
				seekingFirstChunkForMerge = true;
				continue;
			}

			if (
				chunk.postVisit(dep => {
					if (countedChunks.indexOf(dep) !== -1) {
						return false;
					}
					if (dep instanceof ExternalModule) {
						return true;
					}
					remainingSize -= getChunkSize(dep);
					if (remainingSize <= 0) {
						return true;
					}
				})
			) {
				seekingFirstChunkForMerge = true;
				continue;
			}

			// within the size limit -> merge!
			const optimizedChunkIndex = chunks.indexOf(chunk);
			if (optimizedChunkIndex <= i) i--;
			chunks.splice(optimizedChunkIndex, 1);

			lastChunk.merge(chunk, chunks, options);

			execGroup.splice(--j, 1);

			chunk = lastChunk;
			chunkSize.set(chunk, CHUNK_GROUPING_SIZE - remainingSize);
			// keep going to see if we can merge this with the next again
			if (nextChunk && (nextChunk.isEntryModuleFacade || nextChunk.isManualChunk)) {
				seekingFirstChunkForMerge = true;
			}
		} while (((lastChunk = chunk), (chunk = nextChunk), (nextChunk = execGroup[++j]), chunk));
	}

	return chunks;
}
