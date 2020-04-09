class Example {
	firstPublicField = 1;
	secondPublicField = this.firstPublicField + 1;

	#privateField = () => {
		const foo = 'tree-shaken';
	};

	#uninitializedPrivateField;

	// Those are apparently unsupported at the moment
	// get #getter() {
	// 	return this.#uninitializedPrivateField;
	// }

	// set #setter(value) {
	// 	this.#uninitializedPrivateField = value;
	// }

	// #privateMethod() {
	// 	const foo = 'tree-shaken';
	// }

	static publicStaticField = () => {
		const foo = 'tree-shaken';
	};

	static #privateStaticField = () => {
		const foo = 'tree-shaken';
	};

	static #privateStaticMethod(){
		const foo = 'tree-shaken';
	}
}
