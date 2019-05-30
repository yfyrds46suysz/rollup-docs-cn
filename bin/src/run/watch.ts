import dateTime from 'date-time';
import fs from 'fs';
import ms from 'pretty-ms';
import * as rollup from 'rollup';
import onExit from 'signal-exit';
import tc from 'turbocolor';
import {
	InputOption,
	RollupBuild,
	RollupError,
	RollupWatchOptions,
	WarningHandler,
	WatcherOptions
} from '../../../src/rollup/types';
import mergeOptions, { GenericConfigObject } from '../../../src/utils/mergeOptions';
import relativeId from '../../../src/utils/relativeId';
import { handleError, stderr } from '../logging';
import alternateScreen from './alternateScreen';
import batchWarnings from './batchWarnings';
import loadConfigFile from './loadConfigFile';
import { printTimings } from './timings';

interface WatchEvent {
	code?: string;
	duration?: number;
	error?: RollupError | Error;
	input?: InputOption;
	output?: string[];
	result?: RollupBuild;
}

interface Watcher {
	close: () => void;
	on: (event: string, fn: (event: WatchEvent) => void) => void;
}

export default function watch(
	configFile: string,
	configs: GenericConfigObject[],
	command: any,
	silent = false
) {
	const isTTY = Boolean(process.stderr.isTTY);

	const warnings = batchWarnings();

	let processConfigsErr: any;
	const initialConfigs = processConfigs(configs);

	const clearScreen = initialConfigs.every(
		config => (config.watch as WatcherOptions).clearScreen !== false
	);

	const screen = alternateScreen(isTTY && clearScreen);
	screen.open();

	let watcher: Watcher;
	let configWatcher: Watcher;

	function processConfigs(configs: GenericConfigObject[]): RollupWatchOptions[] {
		return configs.map(options => {
			const merged = mergeOptions({
				command,
				config: options,
				defaultOnWarnHandler: warnings.add
			});

			const result: RollupWatchOptions = {
				...merged.inputOptions,
				output: merged.outputOptions
			};

			if (!result.watch) result.watch = {};

			if (merged.optionError)
				(merged.inputOptions.onwarn as WarningHandler)({
					code: 'UNKNOWN_OPTION',
					message: merged.optionError
				});

			if (
				(merged.inputOptions as RollupWatchOptions).watch &&
				((merged.inputOptions as RollupWatchOptions).watch as WatcherOptions).clearScreen === false
			) {
				processConfigsErr = stderr;
			}

			return result;
		});
	}

	function start(configs: RollupWatchOptions[]) {
		const screenWriter = processConfigsErr || screen.reset;

		watcher = rollup.watch(configs);

		watcher.on('event', (event: WatchEvent) => {
			switch (event.code) {
				case 'FATAL':
					screen.close();
					handleError(event.error as RollupError, true);
					process.exit(1);
					break;

				case 'ERROR':
					warnings.flush();
					handleError(event.error as RollupError, true);
					break;

				case 'START':
					if (!silent) {
						screenWriter(tc.underline(`rollup v${rollup.VERSION}`));
					}
					break;

				case 'BUNDLE_START':
					if (!silent) {
						let input = event.input;
						if (typeof input !== 'string') {
							input = Array.isArray(input)
								? input.join(', ')
								: Object.keys(input as Record<string, string>)
										.map(key => (input as Record<string, string>)[key])
										.join(', ');
						}
						stderr(
							tc.cyan(
								`bundles ${tc.bold(input)} → ${tc.bold(
									(event.output as string[]).map(relativeId).join(', ')
								)}...`
							)
						);
					}
					break;

				case 'BUNDLE_END':
					warnings.flush();
					if (!silent)
						stderr(
							tc.green(
								`created ${tc.bold(
									(event.output as string[]).map(relativeId).join(', ')
								)} in ${tc.bold(ms(event.duration as number))}`
							)
						);
					if (event.result && event.result.getTimings) {
						printTimings(event.result.getTimings());
					}
					break;

				case 'END':
					if (!silent && isTTY) {
						stderr(`\n[${dateTime()}] waiting for changes...`);
					}
			}
		});
	}

	// catch ctrl+c, kill, and uncaught errors
	const removeOnExit = onExit(close);
	process.on('uncaughtException', close);

	// only listen to stdin if it is a pipe
	if (!process.stdin.isTTY) {
		process.stdin.on('end', close); // in case we ever support stdin!
	}

	function close(err: Error) {
		removeOnExit();
		process.removeListener('uncaughtException', close);
		// removing a non-existent listener is a no-op
		process.stdin.removeListener('end', close);

		screen.close();
		if (watcher) watcher.close();

		if (configWatcher) configWatcher.close();

		if (err) {
			console.error(err);
			process.exit(1);
		}
	}

	try {
		start(initialConfigs);
	} catch (err) {
		close(err);
		return;
	}

	if (configFile && !configFile.startsWith('node:')) {
		let restarting = false;
		let aborted = false;
		let configFileData = fs.readFileSync(configFile, 'utf-8');

		const restart = () => {
			const newConfigFileData = fs.readFileSync(configFile, 'utf-8');
			if (newConfigFileData === configFileData) return;
			configFileData = newConfigFileData;

			if (restarting) {
				aborted = true;
				return;
			}

			restarting = true;

			loadConfigFile(configFile, command)
				.then((_configs: RollupWatchOptions[]) => {
					restarting = false;

					if (aborted) {
						aborted = false;
						restart();
					} else {
						watcher.close();
						start(initialConfigs);
					}
				})
				.catch((err: Error) => {
					handleError(err, true);
				});
		};

		configWatcher = fs.watch(configFile, (event: string) => {
			if (event === 'change') restart();
		});
	}
}
