import { timeStart, timeEnd, flushTime } from '../utils/flushTime.js';
import { basename } from '../utils/path.js';
import { writeFile } from '../utils/fs.js';
import { assign, keys } from '../utils/object.js';
import { mapSequence } from '../utils/promise.js';
import error from '../utils/error.js';
import { SOURCEMAPPING_URL } from '../utils/sourceMappingURL.js';
import mergeOptions from '../utils/mergeOptions';
import batchWarnings from '../utils/batchWarnings';
import Bundle from '../Bundle.js';

export const VERSION = '<@VERSION@>';

function addDeprecations (deprecations, warn) {
	const message = `The following options have been renamed — please update your config: ${deprecations.map(
		option => `${option.old} -> ${option.new}` ).join( ', ' )}`;
	warn( {
		code: 'DEPRECATED_OPTIONS',
		message,
		deprecations
	} );
}

function checkInputOptions ( options ) {
	if ( options.transform || options.load || options.resolveId || options.resolveExternal ) {
		throw new Error(
			'The `transform`, `load`, `resolveId` and `resolveExternal` options are deprecated in favour of a unified plugin API. See https://github.com/rollup/rollup/wiki/Plugins for details' );
	}
}

function checkOutputOptions ( options ) {
	if ( options.format === 'es6' ) {
		error( {
			message: 'The `es6` output format is deprecated – use `es` instead',
			url: `https://rollupjs.org/#format-f-output-format-`
		} );
	}

	if ( !options.format ) {
		error( {
			message: `You must specify options.format, which can be one of 'amd', 'cjs', 'es', 'iife' or 'umd'`,
			url: `https://rollupjs.org/#format-f-output-format-`
		} );
	}

	if ( options.moduleId ) {
		if ( options.amd ) throw new Error( 'Cannot have both options.amd and options.moduleId' );
	}
}

const throwAsyncGenerateError = {
	get () {
		throw new Error( `bundle.generate(...) now returns a Promise instead of a { code, map } object` );
	}
};

export default function rollup ( _inputOptions ) {
	try {
		if ( !_inputOptions ) {
			throw new Error( 'You must supply an options object to rollup' );
		}
		const { inputOptions, deprecations } = mergeOptions(_inputOptions, {}, { input: true });
		const warnings = batchWarnings();
		const onwarn = inputOptions.onwarn;
		let warn;

		if (onwarn) {
			warn = warning => {
				onwarn(warning, warnings.add);
			};
		} else {
			warn = warning => console.warn(warning.message); // eslint-disable-line no-console
		}
		if ( deprecations.length ) addDeprecations(deprecations, warn);
		checkInputOptions( inputOptions );
		const bundle = new Bundle( inputOptions );

		timeStart( '--BUILD--' );

		return bundle.build().then( () => {
			timeEnd( '--BUILD--' );

			function generate ( _outputOptions ) {
				if ( !_outputOptions ) {
					throw new Error( 'You must supply an options object' );
				}
				const mergedOptions = mergeOptions({ output: _outputOptions }, {}, { output: true });

				// now outputOptions is an array, but rollup.rollup API doesn't support arrays
				const outputOptions = mergedOptions.outputOptions[0];
				const deprecations = mergedOptions.deprecations;
				
				if ( deprecations.length ) addDeprecations(deprecations, warn);
				checkOutputOptions( outputOptions );

				timeStart( '--GENERATE--' );

				const promise = Promise.resolve()
					.then( () => bundle.render( outputOptions ) )
					.then( rendered => {
						timeEnd( '--GENERATE--' );

						bundle.plugins.forEach( plugin => {
							if ( plugin.ongenerate ) {
								plugin.ongenerate( assign( {
									bundle: result
								}, outputOptions ), rendered );
							}
						} );

						flushTime();

						return rendered;
					} );

				Object.defineProperty( promise, 'code', throwAsyncGenerateError );
				Object.defineProperty( promise, 'map', throwAsyncGenerateError );

				return promise;
			}

			const result = {
				imports: bundle.externalModules.map( module => module.id ),
				exports: keys( bundle.entryModule.exports ),
				modules: bundle.orderedModules.map( module => module.toJSON() ),

				generate,
				write: outputOptions => {
					if ( !outputOptions || (!outputOptions.file && !outputOptions.dest) ) {
						error( {
							code: 'MISSING_OPTION',
							message: 'You must specify output.file'
						} );
					}

					return generate( outputOptions ).then( result => {
						const file = outputOptions.file;
						let { code, map } = result;

						const promises = [];

						if ( outputOptions.sourcemap ) {
							let url;

							if ( outputOptions.sourcemap === 'inline' ) {
								url = map.toUrl();
							} else {
								url = `${basename( file )}.map`;
								promises.push( writeFile( file + '.map', map.toString() ) );
							}

							code += `//# ${SOURCEMAPPING_URL}=${url}\n`;
						}

						promises.push( writeFile( file, code ) );
						return Promise.all( promises ).then( () => {
							return mapSequence( bundle.plugins.filter( plugin => plugin.onwrite ), plugin => {
								return Promise.resolve( plugin.onwrite( assign( {
									bundle: result
								}, outputOptions ), result ) );
							} );
						} );
					} );
				}
			};

			return result;
		} );
	} catch ( err ) {
		return Promise.reject( err );
	}
}
