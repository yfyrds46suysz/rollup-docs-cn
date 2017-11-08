import Variable from './Variable';
import StructuredAssignmentTracker from './StructuredAssignmentTracker';

// To avoid infinite recursions
const MAX_PATH_LENGTH = 8;

export default class LocalVariable extends Variable {
	constructor ( name, declarator, init ) {
		super( name );
		this.isReassigned = false;
		this.exportName = null;
		this.declarations = new Set( declarator ? [ declarator ] : null );
		this.assignedExpressions = new StructuredAssignmentTracker();
		init && this.assignedExpressions.addAtPath( [], init );
	}

	addDeclaration ( identifier ) {
		this.declarations.add( identifier );
	}

	assignExpressionAtPath ( path, expression ) {
		if ( path.length > MAX_PATH_LENGTH ) {
			return;
		}
		if ( this.assignedExpressions.hasAtPath( path, expression ) ) return;
		this.assignedExpressions.addAtPath( path, expression );
		if ( path.length > 0 ) {
			this.assignedExpressions.forEachAtPath( path.slice( 0, -1 ), ( relativePath, node ) =>
				node.bindAssignmentAtPath( [ ...relativePath, ...path.slice( -1 ) ], expression ) );
		}
		if ( path.length === 0 ) {
			this.isReassigned = true;
		}
	}

	getName ( es ) {
		if ( es ) return this.name;
		if ( !this.isReassigned || !this.exportName ) return this.name;

		return `exports.${this.exportName}`;
	}

	hasEffectsWhenAccessedAtPath ( path, options ) {
		if ( path.length > MAX_PATH_LENGTH ) {
			return true;
		}
		return this.assignedExpressions.someAtPath( path, ( relativePath, node ) =>
			relativePath.length > 0
			&& !options.hasNodeBeenAccessedAtPath( relativePath, node )
			&& node.hasEffectsWhenAccessedAtPath( relativePath, options.addAccessedNodeAtPath( relativePath, node ) ) );
	}

	hasEffectsWhenAssignedAtPath ( path, options ) {
		if ( path.length > MAX_PATH_LENGTH ) {
			return true;
		}
		return this.included
			|| this.assignedExpressions.someAtPath( path, ( relativePath, node ) =>
				relativePath.length > 0
				&& !options.hasNodeBeenAssignedAtPath( relativePath, node )
				&& node.hasEffectsWhenAssignedAtPath( relativePath, options.addAssignedNodeAtPath( relativePath, node ) ) );
	}

	hasEffectsWhenCalledAtPath ( path, options ) {
		if ( path.length > MAX_PATH_LENGTH ) {
			return true;
		}
		return this.assignedExpressions.someAtPath( path, ( relativePath, node ) => {
			if ( relativePath.length === 0 ) {
				return options.calledWithNew()
					? !options.hasNodeBeenCalledWithNew( node )
					&& node.hasEffectsWhenCalledAtPath( [], options.addNodeCalledWithNew( node ) )
					: !options.hasNodeBeenCalled( node )
					&& node.hasEffectsWhenCalledAtPath( [], options.addCalledNode( node ) );
			}
			return node.hasEffectsWhenCalledAtPath( relativePath, options );
		} );
	}

	hasEffectsWhenMutatedAtPath ( path, options ) {
		if ( path.length > MAX_PATH_LENGTH ) {
			return true;
		}
		return this.included
			|| this.assignedExpressions.someAtPath( path, ( relativePath, node ) => {
				if ( relativePath.length === 0 ) {
					return !options.hasNodeBeenMutated( node )
						&& node.hasEffectsWhenMutatedAtPath( [], options.addMutatedNode( node ) );
				}
				return node.hasEffectsWhenMutatedAtPath( relativePath, options );
			} );
	}

	includeVariable () {
		const hasBeenIncluded = super.includeVariable();
		if ( hasBeenIncluded ) {
			this.declarations.forEach( identifier => identifier.includeInBundle() );
		}
		return hasBeenIncluded;
	}

	toString () {
		return this.name;
	}
}
