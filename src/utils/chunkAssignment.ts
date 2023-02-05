import ExternalModule from '../ExternalModule';
import Module from '../Module';
import { getNewSet, getOrCreate } from './getOrCreate';
import { concatLazy } from './iterators';
import { timeEnd, timeStart } from './timers';

type DependentModuleMap = Map<Module, Set<Module>>;
type ReadonlyDependentModuleMap = ReadonlyMap<Module, ReadonlySet<Module>>;
type ChunkDefinitions = { alias: string | null; modules: Module[] }[];

export function getChunkAssignments(
	entries: readonly Module[],
	manualChunkAliasByEntry: ReadonlyMap<Module, string>,
	minChunkSize: number,
	deepChunkOptimization: boolean
): ChunkDefinitions {
	const chunkDefinitions: ChunkDefinitions = [];
	const modulesInManualChunks = new Set(manualChunkAliasByEntry.keys());
	const manualChunkModulesByAlias: Record<string, Module[]> = Object.create(null);
	for (const [entry, alias] of manualChunkAliasByEntry) {
		addStaticDependenciesToManualChunk(
			entry,
			(manualChunkModulesByAlias[alias] ||= []),
			modulesInManualChunks
		);
	}
	for (const [alias, modules] of Object.entries(manualChunkModulesByAlias)) {
		chunkDefinitions.push({ alias, modules });
	}

	const { allEntries, dependentEntriesByModule, dynamicallyDependentEntriesByDynamicEntry } =
		analyzeModuleGraph(entries);

	const staticEntries = new Set(entries);
	const assignedEntriesByModule: DependentModuleMap = new Map();

	for (const entry of allEntries) {
		if (!modulesInManualChunks.has(entry)) {
			assignEntryToStaticDependencies(
				entry,
				dependentEntriesByModule,
				assignedEntriesByModule,
				modulesInManualChunks,
				staticEntries,
				dynamicallyDependentEntriesByDynamicEntry,
				deepChunkOptimization
			);
		}
	}

	chunkDefinitions.push(...createChunks(allEntries, assignedEntriesByModule, minChunkSize));
	return chunkDefinitions;
}

function addStaticDependenciesToManualChunk(
	entry: Module,
	manualChunkModules: Module[],
	modulesInManualChunks: Set<Module>
): void {
	const modulesToHandle = new Set([entry]);
	for (const module of modulesToHandle) {
		modulesInManualChunks.add(module);
		manualChunkModules.push(module);
		for (const dependency of module.dependencies) {
			if (!(dependency instanceof ExternalModule || modulesInManualChunks.has(dependency))) {
				modulesToHandle.add(dependency);
			}
		}
	}
}

function analyzeModuleGraph(entries: Iterable<Module>): {
	allEntries: Iterable<Module>;
	dependentEntriesByModule: DependentModuleMap;
	dynamicallyDependentEntriesByDynamicEntry: DependentModuleMap;
} {
	const dynamicEntries = new Set<Module>();
	const dependentEntriesByModule: DependentModuleMap = new Map();
	const allEntries = new Set(entries);
	for (const currentEntry of allEntries) {
		const modulesToHandle = new Set([currentEntry]);
		for (const module of modulesToHandle) {
			getOrCreate(dependentEntriesByModule, module, getNewSet).add(currentEntry);
			for (const dependency of module.getDependenciesToBeIncluded()) {
				if (!(dependency instanceof ExternalModule)) {
					modulesToHandle.add(dependency);
				}
			}
			for (const { resolution } of module.dynamicImports) {
				if (
					resolution instanceof Module &&
					resolution.includedDynamicImporters.length > 0 &&
					!allEntries.has(resolution)
				) {
					dynamicEntries.add(resolution);
					allEntries.add(resolution);
				}
			}
			for (const dependency of module.implicitlyLoadedBefore) {
				if (!allEntries.has(dependency)) {
					dynamicEntries.add(dependency);
					allEntries.add(dependency);
				}
			}
		}
	}
	return {
		allEntries,
		dependentEntriesByModule,
		dynamicallyDependentEntriesByDynamicEntry: getDynamicallyDependentEntriesByDynamicEntry(
			dependentEntriesByModule,
			dynamicEntries
		)
	};
}

function getDynamicallyDependentEntriesByDynamicEntry(
	dependentEntriesByModule: ReadonlyDependentModuleMap,
	dynamicEntries: ReadonlySet<Module>
): DependentModuleMap {
	const dynamicallyDependentEntriesByDynamicEntry: DependentModuleMap = new Map();
	for (const dynamicEntry of dynamicEntries) {
		const dynamicallyDependentEntries = getOrCreate(
			dynamicallyDependentEntriesByDynamicEntry,
			dynamicEntry,
			getNewSet
		);
		for (const importer of [
			...dynamicEntry.includedDynamicImporters,
			...dynamicEntry.implicitlyLoadedAfter
		]) {
			for (const entry of dependentEntriesByModule.get(importer)!) {
				dynamicallyDependentEntries.add(entry);
			}
		}
	}
	return dynamicallyDependentEntriesByDynamicEntry;
}

function assignEntryToStaticDependencies(
	entry: Module,
	dependentEntriesByModule: ReadonlyDependentModuleMap,
	assignedEntriesByModule: DependentModuleMap,
	modulesInManualChunks: ReadonlySet<Module>,
	staticEntries: ReadonlySet<Module>,
	dynamicallyDependentEntriesByDynamicEntry: ReadonlyDependentModuleMap,
	deepChunkOptimization: boolean
) {
	const dynamicallyDependentEntries = dynamicallyDependentEntriesByDynamicEntry.get(entry);
	const modulesToHandle = new Set([entry]);
	for (const module of modulesToHandle) {
		const assignedEntries = getOrCreate(assignedEntriesByModule, module, getNewSet);
		if (
			dynamicallyDependentEntries &&
			isModuleAlreadyLoaded(
				dynamicallyDependentEntries,
				dependentEntriesByModule.get(module)!,
				staticEntries,
				dynamicallyDependentEntriesByDynamicEntry,
				deepChunkOptimization
			)
		) {
			continue;
		} else {
			assignedEntries.add(entry);
		}
		for (const dependency of module.getDependenciesToBeIncluded()) {
			if (!(dependency instanceof ExternalModule || modulesInManualChunks.has(dependency))) {
				modulesToHandle.add(dependency);
			}
		}
	}
}

const MAX_ENTRIES_TO_CHECK_FOR_SHARED_DEPENDENCIES = 3;

// An approach to further speed this up might be
// - first, create chunks without looking for modules already in memory
// - all modules that are in the same chunk after this will behave the same
//   -> Do not iterate by module but by equivalence group and merge chunks
function isModuleAlreadyLoaded(
	dynamicallyDependentEntries: ReadonlySet<Module>,
	containedIn: ReadonlySet<Module>,
	staticEntries: ReadonlySet<Module>,
	dynamicallyDependentEntriesByDynamicEntry: ReadonlyDependentModuleMap,
	deepChunkOptimization: boolean
): boolean {
	if (
		!deepChunkOptimization &&
		dynamicallyDependentEntries.size > MAX_ENTRIES_TO_CHECK_FOR_SHARED_DEPENDENCIES
	) {
		return false;
	}
	const entriesToCheck = new Set(dynamicallyDependentEntries);
	for (const entry of entriesToCheck) {
		if (!containedIn.has(entry)) {
			if (staticEntries.has(entry)) {
				return false;
			}
			const dynamicallyDependentEntries = dynamicallyDependentEntriesByDynamicEntry.get(entry)!;
			if (
				!deepChunkOptimization &&
				dynamicallyDependentEntries.size > MAX_ENTRIES_TO_CHECK_FOR_SHARED_DEPENDENCIES
			) {
				return false;
			}
			for (const dependentEntry of dynamicallyDependentEntries) {
				entriesToCheck.add(dependentEntry);
			}
		}
	}
	return true;
}

interface ChunkDescription {
	dependencies: Set<ChunkDescription>;
	dependentChunks: Set<ChunkDescription>;
	modules: Module[];
	pure: boolean;
	signature: string;
	size: number;
}

type ChunkPartition = {
	[key in 'small' | 'big']: {
		[subKey in 'pure' | 'sideEffect']: Set<ChunkDescription>;
	};
};

function createChunks(
	allEntries: Iterable<Module>,
	assignedEntriesByModule: DependentModuleMap,
	minChunkSize: number
): ChunkDefinitions {
	const chunkModulesBySignature = getChunkModulesBySignature(assignedEntriesByModule, allEntries);
	return minChunkSize === 0
		? Object.values(chunkModulesBySignature).map(modules => ({
				alias: null,
				modules
		  }))
		: getOptimizedChunks(chunkModulesBySignature, minChunkSize).map(({ modules }) => ({
				alias: null,
				modules
		  }));
}

function getChunkModulesBySignature(
	assignedEntriesByModule: ReadonlyDependentModuleMap,
	allEntries: Iterable<Module>
) {
	const chunkModules: { [chunkSignature: string]: Module[] } = Object.create(null);
	for (const [module, assignedEntries] of assignedEntriesByModule) {
		let chunkSignature = '';
		for (const entry of allEntries) {
			chunkSignature += assignedEntries.has(entry) ? CHAR_DEPENDENT : CHAR_INDEPENDENT;
		}
		const chunk = chunkModules[chunkSignature];
		if (chunk) {
			chunk.push(module);
		} else {
			chunkModules[chunkSignature] = [module];
		}
	}
	return chunkModules;
}

/**
 * This function tries to get rid of small chunks by merging them with other
 * chunks. In order to merge chunks, one must obey the following rule:
 * - When merging several chunks, at most one of the chunks can have side
 *   effects
 * - When one of the chunks has side effects, the entry points depending on that
 *   chunk need to be a super set of the entry points depending on the other
 *   chunks
 * - Pure chunks can always be merged
 * - We use the entry point dependence signature to calculate "chunk distance",
 *   i.e. how likely it is that two chunks are loaded together
 */
function getOptimizedChunks(
	chunkModulesBySignature: { [chunkSignature: string]: Module[] },
	minChunkSize: number
) {
	timeStart('optimize chunks', 3);
	const chunkPartition = getPartitionedChunks(chunkModulesBySignature, minChunkSize);
	if (chunkPartition.small.sideEffect.size > 0) {
		mergeChunks(
			chunkPartition.small.sideEffect,
			[chunkPartition.small.pure, chunkPartition.big.pure],
			minChunkSize,
			chunkPartition
		);
	}

	if (chunkPartition.small.pure.size > 0) {
		mergeChunks(
			chunkPartition.small.pure,
			[chunkPartition.small.pure, chunkPartition.big.sideEffect, chunkPartition.big.pure],
			minChunkSize,
			chunkPartition
		);
	}
	timeEnd('optimize chunks', 3);
	return [
		...chunkPartition.small.sideEffect,
		...chunkPartition.small.pure,
		...chunkPartition.big.sideEffect,
		...chunkPartition.big.pure
	];
}

const CHAR_DEPENDENT = 'X';
const CHAR_INDEPENDENT = '_';
const CHAR_CODE_DEPENDENT = CHAR_DEPENDENT.charCodeAt(0);

function getPartitionedChunks(
	chunkModulesBySignature: { [chunkSignature: string]: Module[] },
	minChunkSize: number
): ChunkPartition {
	const smallPureChunks: ChunkDescription[] = [];
	const bigPureChunks: ChunkDescription[] = [];
	const smallSideEffectChunks: ChunkDescription[] = [];
	const bigSideEffectChunks: ChunkDescription[] = [];
	const chunkByModule = new Map<Module, ChunkDescription>();
	for (const [signature, modules] of Object.entries(chunkModulesBySignature)) {
		const chunkDescription: ChunkDescription = {
			dependencies: new Set<ChunkDescription>(),
			dependentChunks: new Set<ChunkDescription>(),
			modules,
			pure: true,
			signature,
			size: 0
		};
		let size = 0;
		let pure = true;
		for (const module of modules) {
			chunkByModule.set(module, chunkDescription);
			pure &&= !module.hasEffects();
			// Unfortunately, we cannot take tree-shaking into account here because
			// rendering did not happen yet
			size += module.originalCode.length;
		}
		chunkDescription.pure = pure;
		chunkDescription.size = size;
		(size < minChunkSize
			? pure
				? smallPureChunks
				: smallSideEffectChunks
			: pure
			? bigPureChunks
			: bigSideEffectChunks
		).push(chunkDescription);
	}
	sortChunksAndAddDependencies(
		[bigPureChunks, bigSideEffectChunks, smallPureChunks, smallSideEffectChunks],
		chunkByModule
	);
	return {
		big: { pure: new Set(bigPureChunks), sideEffect: new Set(bigSideEffectChunks) },
		small: { pure: new Set(smallPureChunks), sideEffect: new Set(smallSideEffectChunks) }
	};
}

function sortChunksAndAddDependencies(
	chunkLists: ChunkDescription[][],
	chunkByModule: Map<Module, ChunkDescription>
) {
	for (const chunks of chunkLists) {
		chunks.sort(compareChunks);
		for (const chunk of chunks) {
			const { dependencies, modules } = chunk;
			for (const module of modules) {
				for (const dependency of module.getDependenciesToBeIncluded()) {
					const dependencyChunk = chunkByModule.get(dependency as Module);
					if (dependencyChunk && dependencyChunk !== chunk) {
						dependencies.add(dependencyChunk);
						dependencyChunk.dependentChunks.add(chunk);
					}
				}
			}
		}
	}
}

function compareChunks(
	{ size: sizeA }: ChunkDescription,
	{ size: sizeB }: ChunkDescription
): number {
	return sizeA - sizeB;
}

function mergeChunks(
	chunksToBeMerged: Set<ChunkDescription>,
	targetChunks: Set<ChunkDescription>[],
	minChunkSize: number,
	chunkPartition: ChunkPartition
) {
	for (const mergedChunk of chunksToBeMerged) {
		let closestChunk: ChunkDescription | null = null;
		let closestChunkDistance = Infinity;
		const { signature, modules, pure, size } = mergedChunk;

		for (const targetChunk of concatLazy(targetChunks)) {
			if (mergedChunk === targetChunk) continue;
			// Possible improvement:
			// For dynamic entries depending on a pure chunk, it is safe to merge that
			// chunk into the chunk doing the dynamic import (i.e. into an "already
			// loaded chunk") even if it is not pure.
			// One way of handling this could be to add all "already loaded entries"
			// of the dynamic importers into the signature as well. That could also
			// change the way we do code-splitting for already loaded entries.
			const distance = pure
				? getSignatureDistance(signature, targetChunk.signature, !targetChunk.pure)
				: getSignatureDistance(targetChunk.signature, signature, true);
			if (distance < closestChunkDistance && isValidMerge(mergedChunk, targetChunk)) {
				if (distance === 1) {
					closestChunk = targetChunk;
					break;
				}
				closestChunk = targetChunk;
				closestChunkDistance = distance;
			}
		}
		if (closestChunk) {
			chunksToBeMerged.delete(mergedChunk);
			getChunksInPartition(closestChunk, minChunkSize, chunkPartition).delete(closestChunk);
			closestChunk.modules.push(...modules);
			closestChunk.size += size;
			closestChunk.pure &&= pure;
			closestChunk.signature = mergeSignatures(signature, closestChunk.signature);
			const { dependencies, dependentChunks } = closestChunk;
			for (const dependency of mergedChunk.dependencies) {
				dependencies.add(dependency);
			}
			for (const dependentChunk of mergedChunk.dependentChunks) {
				dependentChunks.add(dependentChunk);
				dependentChunk.dependencies.delete(mergedChunk);
				dependentChunk.dependencies.add(closestChunk);
			}
			dependencies.delete(closestChunk);
			getChunksInPartition(closestChunk, minChunkSize, chunkPartition).add(closestChunk);
		}
	}
}

// Merging will not produce cycles if none of the direct non-merged dependencies
// of a chunk have the other chunk as a transitive dependency
function isValidMerge(mergedChunk: ChunkDescription, targetChunk: ChunkDescription) {
	return !(
		hasTransitiveDependency(mergedChunk, targetChunk) ||
		hasTransitiveDependency(targetChunk, mergedChunk)
	);
}

function hasTransitiveDependency(
	dependentChunk: ChunkDescription,
	dependencyChunk: ChunkDescription
) {
	const chunksToCheck = new Set(dependentChunk.dependencies);
	for (const { dependencies } of chunksToCheck) {
		for (const dependency of dependencies) {
			if (dependency === dependencyChunk) {
				return true;
			}
			chunksToCheck.add(dependency);
		}
	}
	return false;
}

function getChunksInPartition(
	chunk: ChunkDescription,
	minChunkSize: number,
	chunkPartition: ChunkPartition
): Set<ChunkDescription> {
	const subPartition = chunk.size < minChunkSize ? chunkPartition.small : chunkPartition.big;
	return chunk.pure ? subPartition.pure : subPartition.sideEffect;
}

function getSignatureDistance(
	sourceSignature: string,
	targetSignature: string,
	enforceSubset: boolean
): number {
	let distance = 0;
	const { length } = sourceSignature;
	for (let index = 0; index < length; index++) {
		const sourceValue = sourceSignature.charCodeAt(index);
		if (sourceValue !== targetSignature.charCodeAt(index)) {
			if (enforceSubset && sourceValue === CHAR_CODE_DEPENDENT) {
				return Infinity;
			}
			distance++;
		}
	}
	return distance;
}

function mergeSignatures(sourceSignature: string, targetSignature: string): string {
	let signature = '';
	const { length } = sourceSignature;
	for (let index = 0; index < length; index++) {
		signature +=
			sourceSignature.charCodeAt(index) === CHAR_CODE_DEPENDENT ||
			targetSignature.charCodeAt(index) === CHAR_CODE_DEPENDENT
				? CHAR_DEPENDENT
				: CHAR_INDEPENDENT;
	}
	return signature;
}
