import Node from '../Node.js';

export default class UnknownNode extends Node {
	hasEffects () {
		return true;
	}
}
