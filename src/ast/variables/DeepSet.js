const SET_KEY = { type: 'SET_KEY' };
export const UNKNOWN_KEY = { type: 'UNKNOWN_KEY' };

export default class DeepSet {
	constructor () {
		this._assignments = new Map( [ [ SET_KEY, new Set() ] ] );
	}

	addAtPath ( path, assignment ) {
		if ( path.length === 0 ) {
			this._assignments.get( SET_KEY ).add( assignment );
		} else {
			const [ nextPath, ...remainingPath ] = path;
			if ( !this._assignments.has( nextPath ) ) {
				this._assignments.set( nextPath, new DeepSet() );
			}
			this._assignments.get( nextPath ).addAtPath( remainingPath, assignment );
		}
	}

	forEachAtPath ( path, callback ) {
		const [ nextPath, ...remainingPath ] = path;
		this._assignments.get( SET_KEY ).forEach( assignment => callback( path, assignment ) );
		if ( path.length > 0 ) {
			if ( nextPath === UNKNOWN_KEY ) {
				this._assignments.forEach( ( assignment, subPath ) => {
					if ( subPath !== SET_KEY ) {
						assignment.forEachAtPath( remainingPath, callback );
					}
				} );
			} else {
				if ( this._assignments.has( nextPath ) ) {
					this._assignments.get( nextPath ).forEachAtPath( remainingPath, callback );
				}
				if ( this._assignments.has( UNKNOWN_KEY ) ) {
					this._assignments.get( UNKNOWN_KEY ).forEachAtPath( remainingPath, callback );
				}
			}
		}
	}

	hasAtPath ( path, assignment ) {
		if ( path.length === 0 ) {
			return this._assignments.get( SET_KEY ).has( assignment );
		} else {
			const [ nextPath, ...remainingPath ] = path;
			if ( !this._assignments.has( nextPath ) ) {
				return false;
			}
			return this._assignments.get( nextPath ).hasAtPath( remainingPath, assignment );
		}
	}

	someAtPath ( path, predicateFunction ) {
		const [ nextPath, ...remainingPath ] = path;
		return Array.from( this._assignments.get( SET_KEY ) ).some( assignment => predicateFunction( path, assignment ) )
			|| (
				path.length > 0
				&& (
					(nextPath === UNKNOWN_KEY
						&& Array.from( this._assignments ).some( ( [ subPath, assignment ] ) => {
							if ( subPath !== SET_KEY ) {
								return assignment.someAtPath( remainingPath, predicateFunction );
							}
						} ))
					|| (nextPath !== UNKNOWN_KEY
						&& (
							(this._assignments.has( nextPath )
								&& this._assignments.get( nextPath ).someAtPath( remainingPath, predicateFunction ))
							|| (this._assignments.has( UNKNOWN_KEY )
								&& this._assignments.get( UNKNOWN_KEY ).someAtPath( remainingPath, predicateFunction ))
						))
				)
			);
	}
}
