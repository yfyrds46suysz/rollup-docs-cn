const path = require('path');
const sander = require('sander');
const rollup = require('../../dist/rollup');
const { compareWarnings, extend, loadConfig } = require('../utils.js');

const samples = path.resolve(__dirname, 'samples');

const FORMATS = ['amd', 'cjs', 'es', 'iife', 'umd'];

describe('sourcemaps', () => {
	sander.readdirSync(samples).sort().forEach(dir => {
		if (dir[0] === '.') return; // .DS_Store...

		describe(dir, () => {
			const config = loadConfig(samples + '/' + dir + '/_config.js');

			const input = path.resolve(samples, dir, 'main.js');
			const output = path.resolve(samples, dir, '_actual/bundle');

			let warnings;

			const options = extend({}, config.options, {
				input,
				onwarn: warning => warnings.push(warning)
			});

			FORMATS.forEach(format => {
				(config.skip ? it.skip : config.solo ? it.only : it)(
					'generates ' + format,
					() => {
						warnings = [];

						const testBundle = bundle => {
							const options = extend(
								{},
								{
									format,
									sourcemap: true,
									file: `${output}.${format}.js`
								},
								config.options
							);

							return bundle.write(options).then(() => {
								if (config.warnings) {
									compareWarnings(warnings, config.warnings);
								} else if (warnings.length) {
									throw new Error(`Unexpected warnings`);
								}

								return bundle.generate(options)
									.then(({ code, map }) => {
										if (config.test) {
											config.test(code, map, { format });
										}
									});
							});
						};

						return rollup.rollup(options).then(bundle => {
							return testBundle(bundle).then(() => {
								// cache rebuild does not reemit warnings.
								if (config.warnings) {
									return;
								}
								// test cache noop rebuild
								return rollup
									.rollup(extend({ cache: bundle }, options))
									.then(bundle => {
										testBundle(bundle);
									});
							});
						});
					}
				);
			});
		});
	});
});
