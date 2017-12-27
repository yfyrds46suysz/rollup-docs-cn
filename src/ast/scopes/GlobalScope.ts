import GlobalVariable from '../variables/GlobalVariable';
import Scope from './Scope';

export default class GlobalScope extends Scope {
	parent: void;

	findVariable (name: string) {
		if (!this.variables[name]) {
			this.variables[name] = new GlobalVariable(name);
		}

		return this.variables[name];
	}
}
