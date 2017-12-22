import { realpathSync } from 'fs';
import relative from 'require-relative';
import { handleError } from '../logging.js';
import mergeOptions from '../../../src/utils/mergeOptions.js';
import batchWarnings from './batchWarnings.js';
import loadConfigFile from './loadConfigFile.js';
import sequence from '../utils/sequence.js';
import build from './build.js';
import watch from './watch.js';
import { InputOptions } from '../../../src/rollup/index';

export default function runRollup (command: any) {
	if (command._.length > 1) {
		handleError({
			code: 'ONE_AT_A_TIME',
			message: 'rollup can only bundle one file at a time'
		});
	}

	if (command._.length === 1) {
		if (command.input) {
			handleError({
				code: 'DUPLICATE_IMPORT_OPTIONS',
				message: 'use --input, or pass input path as argument'
			});
		}

		command.input = command._[0];
	}

	if (command.environment) {
		const environment = Array.isArray(command.environment)
			? command.environment
			: [command.environment];

		environment.forEach((arg: string) => {
			arg.split(',').forEach((pair: string) => {
				const [key, value] = pair.split(':');
				if (value) {
					process.env[key] = value;
				} else {
					process.env[key] = String(true);
				}
			});
		});
	}

	let configFile =
		command.config === true ? 'rollup.config.js' : command.config;

	if (configFile) {
		if (configFile.slice(0, 5) === 'node:') {
			const pkgName = configFile.slice(5);
			try {
				configFile = relative.resolve(
					`rollup-config-${pkgName}`,
					process.cwd()
				);
			} catch (err) {
				try {
					configFile = relative.resolve(pkgName, process.cwd());
				} catch (err) {
					if (err.code === 'MODULE_NOT_FOUND') {
						handleError({
							code: 'MISSING_EXTERNAL_CONFIG',
							message: `Could not resolve config file ${configFile}`
						});
					}

					throw err;
				}
			}
		} else {
			// find real path of config so it matches what Node provides to callbacks in require.extensions
			configFile = realpathSync(configFile);
		}

		if (command.watch) process.env.ROLLUP_WATCH = 'true';

		loadConfigFile(configFile, command.silent)
			.then(normalized => execute(configFile, normalized, command))
			.catch(handleError);
	} else {
		return execute(configFile, [{input: null}], command);
	}
}

function execute (configFile: string, configs: InputOptions[], command: any) {
	if (command.watch) {
		watch(configFile, configs, command, command.silent);
	} else {
		return sequence( configs, config => {
			const warnings = batchWarnings();
			const { inputOptions, outputOptions, deprecations } = mergeOptions({ config, command, defaultOnWarn: warnings.add });

			if (deprecations.length) {
				inputOptions.onwarn({
					code: 'DEPRECATED_OPTIONS',
					message: `The following options have been renamed — please update your config: ${deprecations
						.map(option => `${option.old} -> ${option.new}`)
						.join(', ')}`,
					deprecations
				});
			}

			return build(inputOptions, outputOptions, warnings, command.silent);
		});
	}
}
