import { blank } from './utils/object';
import makeLegalIdentifier from './utils/makeLegalIdentifier';

// An external identifier.
class Id {
	constructor ( module, name ) {
		this.originalName = this.name = name;
		this.module = module;

		this.modifierStatements = [];
	}

	// Flags the identifier as imported by the bundle when marked.
	mark () {
		this.module.importedByBundle[ this.originalName ] = true;
		this.modifierStatements.forEach( stmt => stmt.mark() );
	}
}

export default class ExternalModule {
	constructor ( { id, bundle } ) {
		this.id = id;

		// Implement `Identifier` interface.
		this.originalName = this.name = makeLegalIdentifier( id );
		this.module = this;
		this.isModule = true;

		// Define the external module's name in the bundle scope.
		bundle.scope.define( id, this );

		this.isExternal = true;
		this.importedByBundle = blank();

		// Invariant: needsNamed and needsAll are never both true at once.
		// Because an import with both a namespace and named import is invalid:
		//
		// 		import * as ns, { a } from '...'
		//
		this.needsNamed = false;
		this.needsAll = false;

		this.exports = bundle.scope.virtual( false );

		const { reference } = this.exports;

		// Override reference.
		this.exports.reference = name => {
			if ( name !== 'default' ) {
				this.needsNamed = true;
			}

			if ( !this.exports.defines( name ) ) {
				this.exports.define( name, new Id( this, name ) );
			}

			return reference.call( this.exports, name );
		};
	}

	// External modules are always marked for inclusion in the bundle.
	// Marking an external module signals its use as a namespace.
	mark () {
		this.needsAll = true;
	}
}
