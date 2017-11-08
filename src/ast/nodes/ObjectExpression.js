import Node from '../Node.js';
import { UNKNOWN_KEY } from '../variables/DeepSet';

export default class ObjectExpression extends Node {
	bindAssignmentAtPath ( path, expression ) {
		if ( path.length === 0 ) {
			return;
		}
		this._getPossiblePropertiesWithName( path[ 0 ] ).properties.forEach( property =>
			property.bindAssignmentAtPath( path.slice( 1 ), expression ) );
	}

	bindCallAtPath ( path, callOptions ) {
		if ( path.length === 0 ) {
			return;
		}
		this._getPossiblePropertiesWithName( path[ 0 ] ).properties.forEach( property =>
			property.bindCallAtPath( path.slice( 1 ), callOptions ) );
	}

	_getPossiblePropertiesWithName ( name ) {
		if ( name === UNKNOWN_KEY ) {
			return { properties: this.properties, hasCertainHit: false };
		}
		const properties = [];
		let hasCertainHit = false;

		for ( let index = this.properties.length - 1; index >= 0; index-- ) {
			const property = this.properties[ index ];
			if ( property.computed ) {
				properties.push( property );
			} else if ( property.key.name === name ) {
				properties.push( property );
				hasCertainHit = true;
				break;
			}
		}
		return { properties, hasCertainHit };
	}

	hasEffectsWhenAccessedAtPath ( path, options ) {
		if ( path.length <= 1 ) {
			return false;
		}
		const { properties, hasCertainHit } = this._getPossiblePropertiesWithName( path[ 0 ] );

		return !hasCertainHit || properties.some( property =>
			property.hasEffectsWhenAccessedAtPath( path.slice( 1 ), options ) );
	}

	hasEffectsWhenAssignedAtPath ( path, options ) {
		if ( path.length <= 1 ) {
			return false;
		}
		const { properties, hasCertainHit } = this._getPossiblePropertiesWithName( path[ 0 ] );

		return !hasCertainHit || properties.some( property =>
			property.hasEffectsWhenAssignedAtPath( path.slice( 1 ), options ) );
	}

	hasEffectsWhenCalledAtPath ( path, options ) {
		if ( path.length === 0 ) {
			return true;
		}
		const { properties, hasCertainHit } = this._getPossiblePropertiesWithName( path[ 0 ] );

		return !hasCertainHit || properties.some( property =>
			property.hasEffectsWhenCalledAtPath( path.slice( 1 ), options ) );
	}

	hasEffectsWhenMutatedAtPath ( path, options ) {
		if ( path.length === 0 ) {
			return false;
		}
		const { properties, hasCertainHit } = this._getPossiblePropertiesWithName( path[ 0 ] );

		return !hasCertainHit || properties.some( property =>
			property.hasEffectsWhenMutatedAtPath( path.slice( 1 ), options ) );
	}
}
