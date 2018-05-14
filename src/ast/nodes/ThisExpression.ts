import ThisVariable from '../variables/ThisVariable';
import ExecutionPathOptions from '../ExecutionPathOptions';
import MagicString from 'magic-string';
import { NodeBase } from './shared/Node';
import * as NodeType from './NodeType';
import { RenderOptions } from '../../utils/renderHelpers';
import { ObjectPath } from '../values';

export default class ThisExpression extends NodeBase {
	type: NodeType.tThisExpression;

	variable: ThisVariable;
	private alias: string | null;

	bind() {
		super.bind();
		this.variable = <ThisVariable>this.scope.findVariable('this');
	}

	hasEffectsWhenAccessedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		return path.length > 0 && this.variable.hasEffectsWhenAccessedAtPath(path, options);
	}

	hasEffectsWhenAssignedAtPath(path: ObjectPath, options: ExecutionPathOptions): boolean {
		return this.variable.hasEffectsWhenAssignedAtPath(path, options);
	}

	initialise() {
		this.included = false;
		this.variable = null;
		this.alias = this.scope.findLexicalBoundary().isModuleScope ? this.context.moduleContext : null;
		if (this.alias === 'undefined') {
			this.context.warn(
				{
					code: 'THIS_IS_UNDEFINED',
					message: `The 'this' keyword is equivalent to 'undefined' at the top level of an ES module, and has been rewritten`,
					url: `https://github.com/rollup/rollup/wiki/Troubleshooting#this-is-undefined`
				},
				this.start
			);
		}
	}

	render(code: MagicString, _options: RenderOptions) {
		if (this.alias !== null) {
			code.overwrite(this.start, this.end, this.alias, {
				storeName: true,
				contentOnly: false
			});
		}
	}
}
