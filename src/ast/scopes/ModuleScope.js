import { forOwn } from '../../utils/object.js';
import Scope from './Scope.js';

export default class ModuleScope extends Scope {
	constructor ( module ) {
		super({
			isBlockScope: false,
			isLexicalBoundary: true,
			isModuleScope: true,
			parent: module.bundle.scope
		});

		this.module = module;
	}

	deshadow ( names ) {
		names = new Set( names );

		forOwn( this.module.imports, specifier => {
			if ( specifier.module.isExternal ) return;

			specifier.module.getExports().forEach( name => {
				names.add( name );
			});

			if ( specifier.name !== '*' ) {
				const declaration = specifier.module.traceExport( specifier.name );
				if ( !declaration ) {
					this.module.bundle.onwarn( `Non-existent export '${specifier.name}' is imported from ${specifier.module.id} by ${this.module.id}` );
					return;
				}

				const name = declaration.getName( true );
				if ( name !== specifier.name ) {
					names.add( declaration.getName( true ) );
				}
			}
		});

		super.deshadow( names );
	}

	findDeclaration ( name ) {
		if ( this.declarations[ name ] ) {
			return this.declarations[ name ];
		}

		return this.module.trace( name ) || this.parent.findDeclaration( name );
	}

	findLexicalBoundary () {
		return this;
	}
}
