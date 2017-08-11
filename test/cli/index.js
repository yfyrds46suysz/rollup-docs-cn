const path = require('path');
const assert = require('assert');
const sander = require('sander');
const buble = require('buble');
const { exec } = require('child_process');
const { deindent, loadConfig, normaliseOutput } = require('../utils.js');

const samples = path.resolve(__dirname, 'samples');

const cwd = process.cwd();

sander.rimrafSync(__dirname, 'node_modules');
sander.copydirSync(__dirname, 'node_modules_rename_me').to(__dirname, 'node_modules');

describe('cli', () => {
	afterEach(() => {
		process.chdir(cwd);
	});

	sander.readdirSync(samples).sort().forEach(dir => {
		if (dir[0] === '.') return; // .DS_Store...

		describe(dir, () => {
			const config = loadConfig(samples + '/' + dir + '/_config.js');

			(config.skip ? it.skip : config.solo ? it.only : it)(dir, done => {
				process.chdir(config.cwd || path.resolve(samples, dir));

				const command =
					'node ' +
					path.resolve(__dirname, '../../bin') +
					path.sep +
					config.command;

				exec(command, {}, (err, code, stderr) => {
					if (err) {
						if (config.error) {
							const shouldContinue = config.error(err);
							if (!shouldContinue) return done();
						} else {
							throw err;
						}
					}

					if ('stderr' in config) {
						assert.equal(deindent(config.stderr), stderr.trim());
					} else if (stderr) {
						console.error(stderr);
					}

					let unintendedError;

					if (config.execute) {
						try {
							if (config.buble) {
								code = buble.transform(code, {
									transforms: { modules: false }
								}).code;
							}

							const fn = new Function(
								'require',
								'module',
								'exports',
								'assert',
								code
							);
							const module = {
								exports: {}
							};
							fn(require, module, module.exports, assert);

							if (config.error) {
								unintendedError = new Error(
									'Expected an error while executing output'
								);
							}

							if (config.exports) {
								config.exports(module.exports);
							}
						} catch (err) {
							if (config.error) {
								config.error(err);
							} else {
								unintendedError = err;
							}
						}

						if (config.show || unintendedError) {
							console.log(code + '\n\n\n');
						}

						if (config.solo) console.groupEnd();

						unintendedError ? done(unintendedError) : done();
					} else if (config.result) {
						try {
							config.result(code);
							done();
						} catch (err) {
							done(err);
						}
					} else if (
						sander.existsSync('_expected') &&
						sander.statSync('_expected').isDirectory()
					) {
						let error = null;
						sander.readdirSync('_expected').forEach(child => {
							const expected = sander
								.readFileSync(path.join('_expected', child))
								.toString();
							const actual = sander
								.readFileSync(path.join('_actual', child))
								.toString();
							try {
								assert.equal(
									normaliseOutput(actual),
									normaliseOutput(expected)
								);
							} catch (err) {
								error = err;
							}
						});
						done(error);
					} else {
						const expected = sander.readFileSync('_expected.js').toString();
						try {
							assert.equal(normaliseOutput(code), normaliseOutput(expected));
							done();
						} catch (err) {
							done(err);
						}
					}
				});
			});
		});
	});
});
