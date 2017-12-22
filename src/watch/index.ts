/// <reference path="./index.d.ts" />

import path from 'path';
import EventEmitter from 'events';
import createFilter from 'rollup-pluginutils/src/createFilter.js';
import rollup, { InputOptions, OutputOptions } from '../rollup/index';
import ensureArray from '../utils/ensureArray';
import { mapSequence } from '../utils/promise';
import { addTask, deleteTask } from './fileWatchers';
import chokidar from './chokidar';
import mergeOptions from '../utils/mergeOptions.js';
import { WatchOptions } from 'chokidar';
import Module from '../Module';
import Bundle from '../Bundle';

const DELAY = 100;

class Watcher extends (<{ new(): any }>EventEmitter) {
	dirty: boolean;
	running: boolean;
	tasks: Task[];
	succeeded: boolean;

	constructor (configs: WatchOptions[]) {
		super();

		this.dirty = true;
		this.running = false;
		this.tasks = ensureArray(configs).map(config => new Task(this, config));
		this.succeeded = false;

		process.nextTick(() => {
			this._run();
		});
	}

	close () {
		this.tasks.forEach(task => {
			task.close();
		});

		this.removeAllListeners();
	}

	_makeDirty () {
		if (this.dirty) return;
		this.dirty = true;

		if (!this.running) {
			setTimeout(() => {
				this._run();
			}, DELAY);
		}
	}

	_run () {
		this.running = true;
		this.dirty = false;

		this.emit('event', {
			code: 'START'
		});

		mapSequence(this.tasks, (task: Task) => task.run())
			.then(() => {
				this.succeeded = true;

				this.emit('event', {
					code: 'END'
				});
			})
			.catch(error => {
				this.emit('event', {
					code: this.succeeded ? 'ERROR' : 'FATAL',
					error
				});
			})
			.then(() => {
				this.running = false;

				if (this.dirty) {
					this._run();
				}
			});
	}
}

export class Task {
	watcher: Watcher;
	dirty: boolean;
	closed: boolean;
	watched: Set<string>;
	inputOptions: InputOptions;
	cache: {
		modules: Module[]
	};

	chokidarOptions: WatchOptions;
	chokidarOptionsHash: string;
	outputFiles: string[];
	outputs: OutputOptions[];

	deprecations: string[];

	filter: (id: string) => boolean;

	constructor (watcher: Watcher, config: InputOptions & OutputOptions) {
		this.cache = null;
		this.watcher = watcher;

		this.dirty = true;
		this.closed = false;
		this.watched = new Set();

		const { inputOptions, outputOptions, deprecations } = mergeOptions({ config });
		this.inputOptions = inputOptions;

		this.outputs = outputOptions;
		this.outputFiles = this.outputs.map(output => path.resolve(output.file));

		const watchOptions = inputOptions.watch || {};
		if ('useChokidar' in watchOptions) watchOptions.chokidar = watchOptions.useChokidar;
		let chokidarOptions = 'chokidar' in watchOptions ? watchOptions.chokidar : !!chokidar;
		if (chokidarOptions) {
			chokidarOptions = Object.assign(
				chokidarOptions === true ? {} : chokidarOptions,
				{
					ignoreInitial: true
				}
			);
		}

		if (chokidarOptions && !chokidar) {
			throw new Error(
				`options.watch.chokidar was provided, but chokidar could not be found. Have you installed it?`
			);
		}

		this.chokidarOptions = chokidarOptions;
		this.chokidarOptionsHash = JSON.stringify(chokidarOptions);

		this.filter = createFilter(watchOptions.include, watchOptions.exclude);
		this.deprecations = [...deprecations, ...(watchOptions._deprecations || [])];
	}

	close () {
		this.closed = true;
		this.watched.forEach(id => {
			deleteTask(id, this, this.chokidarOptionsHash);
		});
	}

	makeDirty () {
		if (!this.dirty) {
			this.dirty = true;
			this.watcher._makeDirty();
		}
	}

	run () {
		if (!this.dirty) return;
		this.dirty = false;

		const options = Object.assign(this.inputOptions, {
			cache: this.cache
		});

		const start = Date.now();

		this.watcher.emit('event', {
			code: 'BUNDLE_START',
			input: this.inputOptions.input,
			output: this.outputFiles
		});

		if (this.deprecations.length) {
			this.inputOptions.onwarn({
				code: 'DEPRECATED_OPTIONS',
				deprecations: this.deprecations,
				message: `The following options have been renamed — please update your config: ${this.deprecations.map(option => `${option.old} -> ${option.new}`).join(', ')}`,
			});
		}

		return rollup(options)
			.then((bundle: Bundle) => {
				if (this.closed) return;

				this.cache = bundle;

				const watched = new Set();

				bundle.modules.forEach((module: Module) => {
					watched.add(module.id);
					this.watchFile(module.id);
				});

				this.watched.forEach(id => {
					if (!watched.has(id)) deleteTask(id, this, this.chokidarOptionsHash);
				});

				this.watched = watched;

				return Promise.all(this.outputs.map(output => bundle.write(output)));
			})
			.then(() => {
				this.watcher.emit('event', {
					code: 'BUNDLE_END',
					input: this.inputOptions.input,
					output: this.outputFiles,
					duration: Date.now() - start
				});
			})
			.catch((error: Error) => {
				if (this.closed) return;

				if (this.cache) {
					this.cache.modules.forEach(module => {
						// this is necessary to ensure that any 'renamed' files
						// continue to be watched following an error
						this.watchFile(module.id);
					});
				}
				throw error;
			});
	}

	watchFile (id: string) {
		if (!this.filter(id)) return;

		if (this.outputFiles.some(file => file === id)) {
			throw new Error('Cannot import the generated bundle');
		}

		// this is necessary to ensure that any 'renamed' files
		// continue to be watched following an error
		addTask(id, this, this.chokidarOptions, this.chokidarOptionsHash);
	}
}

export default function watch (configs: WatchOptions[]) {
	return new Watcher(configs);
}
