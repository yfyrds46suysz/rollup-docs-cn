require( 'source-map-support' ).install();

var path = require( 'path' );
var relative = require( 'require-relative' );
var handleError = require( './handleError' );
var chalk = require( 'chalk' );
var rollup = require( '../' );

// log to stderr to keep `rollup main.js > bundle.js` from breaking
var log = console.error.bind(console);

module.exports = function ( command ) {
	if ( command._.length > 1 ) {
		handleError({ code: 'ONE_AT_A_TIME' });
	}

	if ( command._.length === 1 ) {
		if ( command.input ) {
			handleError({ code: 'DUPLICATE_IMPORT_OPTIONS' });
		}

		command.input = command._[0];
	}

	if ( command.environment ) {
		command.environment.split( ',' ).forEach( function ( pair ) {
			var index = pair.indexOf( ':' );
			if ( ~index ) {
				process.env[ pair.slice( 0, index ) ] = pair.slice( index + 1 );
			} else {
				process.env[ pair ] = true;
			}
		});
	}

	var config = command.config === true ? 'rollup.config.js' : command.config;

	if ( config ) {
		config = path.resolve( config );

		rollup.rollup({
			entry: config,
			onwarn: function ( message ) {
				if ( /Treating .+ as external dependency/.test( message ) ) return;
				log( message );
			}
		}).then( function ( bundle ) {
			var code = bundle.generate({
				format: 'cjs'
			}).code;

			// temporarily override require
			var defaultLoader = require.extensions[ '.js' ];
			require.extensions[ '.js' ] = function ( m, filename ) {
				if ( filename === config ) {
					m._compile( code, filename );
				} else {
					defaultLoader( m, filename );
				}
			};

			try {
				var options = require( path.resolve( config ) );
				if ( Object.keys( options ).length === 0 ) {
					handleError({ code: 'MISSING_CONFIG' });
				}
			} catch ( err ) {
				handleError( err );
			}

			execute( options, command );

			require.extensions[ '.js' ] = defaultLoader;
		})
		.catch(log);
	} else {
		execute( {}, command );
	}
};

var equivalents = {
	banner: 'banner',
	footer: 'footer',
	format: 'format',
	globals: 'globals',
	id: 'moduleId',
	indent: 'indent',
	input: 'entry',
	intro: 'intro',
	name: 'moduleName',
	output: 'dest',
	outro: 'outro',
	sourcemap: 'sourceMap',
	treeshake: 'treeshake'
};

function execute ( options, command ) {
	var external = ( options.external || [] )
		.concat( command.external ? command.external.split( ',' ) : []  );

	if ( command.globals ) {
		var globals = Object.create( null );

		command.globals.split( ',' ).forEach(function ( str ) {
			var names = str.split( ':' );
			globals[ names[0] ] = names[1];

			// Add missing Module IDs to external.
			if ( external.indexOf( names[0] ) === -1 ) {
				external.push( names[0] );
			}
		});

		command.globals = globals;
	}

	options.onwarn = options.onwarn || log;

	options.external = external;

	options.noConflict = command.conflict === false;
	delete command.conflict;

	// Use any options passed through the CLI as overrides.
	Object.keys( equivalents ).forEach( function ( cliOption ) {
		if ( command.hasOwnProperty( cliOption ) ) {
			options[ equivalents[ cliOption ] ] = command[ cliOption ];
		}
	});

	try {
		if ( command.watch ) {
			if ( !options.entry || !options.dest ) {
				handleError({ code: 'WATCHER_MISSING_INPUT_OR_OUTPUT' });
			}

			try {
				var watch = relative( 'rollup-watch', process.cwd() );
				var watcher = watch( rollup, options );

				watcher.on( 'event', function ( event ) {
					switch ( event.code ) {
						case 'STARTING':
							console.error( 'checking rollup-watch version...' );
							break;

						case 'BUILD_START':
							console.error( 'bundling...' );
							break;

						case 'BUILD_END':
							console.error( 'bundled in ' + event.duration + 'ms. Watching for changes...' );
							break;

						default:
							console.error( 'unknown event', event );
					}
				});
			} catch ( err ) {
				if ( err.code === 'MODULE_NOT_FOUND' ) {
					err.code = 'ROLLUP_WATCH_NOT_INSTALLED';
				}

				handleError( err );
			}
		} else {
			bundle( options ).catch( handleError );
		}
	} catch ( err ) {
		handleError( err );
	}
}

function clone ( object ) {
	return assign( {}, object );
}

function assign ( target, source ) {
	Object.keys( source ).forEach( function ( key ) {
		target[ key ] = source[ key ];
	});
	return target;
}

function bundle ( options ) {
	if ( !options.entry ) {
		handleError({ code: 'MISSING_INPUT_OPTION' });
	}

	return rollup.rollup( options ).then( function ( bundle ) {
		if ( options.dest ) {
			return bundle.write( options );
		}

		if ( options.targets ) {
			var result = null;

			options.targets.forEach( function ( target ) {
				result = bundle.write( assign( clone( options ), target ) );
			});

			return result;
		}

		if ( options.sourceMap && options.sourceMap !== 'inline' ) {
			handleError({ code: 'MISSING_OUTPUT_OPTION' });
		}

		var result = bundle.generate( options );

		var code = result.code,
			map = result.map;

		if ( options.sourceMap === 'inline' ) {
			code += '\n//# sourceMappingURL=' + map.toUrl();
		}

		process.stdout.write( code );
	});
}
