const getter = {
	get foo () {
		console.log( 'effect' );
	}
};
getter.foo;

const empty = {};
empty.foo.tooDeep;

function accessArg(arg) {
	arg.tooDeep;
}
accessArg(null);

globalThis.unknown.unknownProperty;
