var replace = require( 'rollup-plugin-replace' );

let warnings = [];

module.exports = {
	entry: 'main.js',
	input: 'main.js',
	format: 'es',
	dest: '_actual/bundle1.js',
	output: {
		file: '_actual/bundle1.js',
		format: 'es'
	},
	plugins: [
		replace( { 'ANSWER': 42 } )
	]
};
