import nodes from './nodes/index';
import UnknownNode from './nodes/UnknownNode';
import keys from './keys';
import Node from './Node';
import Program from './nodes/Program';

const newline = /\n/;

export default function enhance (ast: Program, module, comments) {
	enhanceNode(ast, module, module, module.magicString);

	let comment = comments.shift();

	for (const node of ast.body) {
		if (comment && comment.start < node.start) {
			node.leadingCommentStart = comment.start;
		}

		while (comment && comment.end < node.end) comment = comments.shift();

		// if the next comment is on the same line as the end of the node,
		// treat is as a trailing comment
		if (comment && !newline.test(module.code.slice(node.end, comment.start))) {
			node.trailingCommentEnd = comment.end; // TODO is node.trailingCommentEnd used anywhere?
			comment = comments.shift();
		}

		node.initialise(module.scope);
	}
}

function enhanceNode (raw: Node | Node[], parent: Node, module, code) {
	if (!raw) return;

	if ('length' in raw) {
		for (let i = 0; i < (<Node[]>raw).length; i += 1) {
			enhanceNode((<Node[]>raw)[i], parent, module, code);
		}

		return;
	}

	const rawNode = <Node>raw;

	// with e.g. shorthand properties, key and value are
	// the same node. We don't want to enhance an object twice
	if (rawNode.__enhanced) return;
	rawNode.__enhanced = true;

	if (!keys[rawNode.type]) {
		keys[rawNode.type] = Object.keys(rawNode).filter(
			key => typeof (<any>rawNode)[key] === 'object'
		);
	}

	rawNode.parent = parent;
	rawNode.module = module;
	rawNode.keys = keys[rawNode.type];

	code.addSourcemapLocation(rawNode.start);
	code.addSourcemapLocation(rawNode.end);

	for (const key of keys[rawNode.type]) {
		enhanceNode((<any>rawNode)[key], rawNode, module, code);
	}

	const type = nodes[rawNode.type] || UnknownNode;
	rawNode.__proto__ = type.prototype;
}
