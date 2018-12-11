import MagicString from 'magic-string';
import { RenderOptions, renderStatementList } from '../../utils/renderHelpers';
import { ExecutionPathOptions } from '../ExecutionPathOptions';
import * as NodeType from './NodeType';
import { NodeBase, StatementNode } from './shared/Node';

export default class Program extends NodeBase {
	type: NodeType.tProgram;
	body: StatementNode[];
	sourceType: 'module';

	hasEffects(options: ExecutionPathOptions) {
		for (const node of this.body) {
			if (node.hasEffects(options)) return true;
		}
	}

	include(includeAllChildrenRecursively: boolean) {
		this.included = true;
		for (const node of this.body) {
			if (includeAllChildrenRecursively || node.shouldBeIncluded()) {
				node.include(includeAllChildrenRecursively);
			}
		}
	}

	render(code: MagicString, options: RenderOptions) {
		if (this.body.length) {
			renderStatementList(this.body, code, this.start, this.end, options);
		} else {
			super.render(code, options);
		}
	}
}
