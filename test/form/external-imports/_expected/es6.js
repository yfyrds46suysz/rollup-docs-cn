import factory from 'factory';
import { bar, foo } from 'baz';
import * as containers from 'shipping-port';
import alphabet, { a } from 'alphabet';

factory( null );
foo( bar );
containers.forEach( console.log, console );
console.log( a );
console.log( alphabet.length );
