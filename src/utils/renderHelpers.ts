import { Node } from '../ast/nodes/shared/Node';
import MagicString from 'magic-string';
import { RenderOptions } from '../Module';

export function findFirstOccurrenceOutsideComment (code: string, searchString: string) {
	let codeStart = 0;
	let commentStart, commentLength, lineBreakPos;
	while (true) {
		commentStart = code.indexOf('/');
		lineBreakPos = (~commentStart ? code.slice(0, commentStart) : code).indexOf(searchString);
		if (~lineBreakPos || !~commentStart) {
			break;
		}
		code = code.slice(commentStart + 1);
		codeStart += commentStart + 1;
		if (code[0] === '*') {
			commentLength = code.indexOf('*/') + 2;
		} else if (code[0] === '/') {
			commentLength = code.indexOf('\n') + 1;
		} else {
			continue;
		}
		code = code.slice(commentLength);
		codeStart += commentLength;
	}
	return ~lineBreakPos ? codeStart + lineBreakPos : -1;
}

export function findFirstLineBreakOutsideComment (code: string) {
	let codeStart = 0;
	let commentStart, commentLength, lineBreakPos;
	while (true) {
		commentStart = code.indexOf('/*');
		lineBreakPos = (~commentStart ? code.slice(0, commentStart) : code).indexOf('\n');
		if (~lineBreakPos || !~commentStart) {
			break;
		}
		code = code.slice(commentStart);
		commentLength = code.indexOf('*/') + 2;
		code = code.slice(commentLength);
		codeStart += commentStart + commentLength;
	}
	return ~lineBreakPos ? codeStart + lineBreakPos : -1;
}

export function renderStatementList (statements: Node[], code: MagicString, start: number, end: number, options: RenderOptions) {
	if (statements.length === 0) return;
	let currentNode, currentNodeStart;
	let nextNode = statements[0];
	let nextNodeStart = start + findFirstLineBreakOutsideComment(code.original.slice(start, nextNode.start)) + 1;

	for (let nextIndex = 1; nextIndex <= statements.length; nextIndex++) {
		currentNode = nextNode;
		currentNodeStart = nextNodeStart;
		nextNode = statements[nextIndex];
		nextNodeStart = currentNode.end + findFirstLineBreakOutsideComment(
			code.original.slice(currentNode.end, nextNode === undefined ? end : nextNode.start)
		) + 1;
		if (currentNode.included) {
			currentNode.render(code, options, { start: currentNodeStart, end: nextNodeStart });
		} else {
			code.remove(currentNodeStart, nextNodeStart);
		}
	}
}

// This assumes that the first character is not part of the first node
export function getCommaSeparatedNodesWithBoundaries<N extends Node> (
	nodes: N[],
	code: MagicString,
	start: number,
	end: number
): ({
	node: N;
	start: number;
	contentStart: number;
	end: number;
})[] {
	const splitUpNodes = [];
	let currentNode, currentNodeStart, currentNodeContentStart;
	let nextNode = nodes[0];
	let nextNodeStart = start;

	for (let nextIndex = 1; nextIndex <= nodes.length; nextIndex++) {
		currentNode = nextNode;
		currentNodeStart = nextNodeStart;
		nextNode = nodes[nextIndex];
		nextNodeStart = nextNode === undefined ? end : currentNode.end + findFirstOccurrenceOutsideComment(
			code.original.slice(currentNode.end, nextNode.start), ','
		);
		// Each node starts with a non-content character e.g. ","; that way we can always safely code.overwrite(start, contentStart, ..)
		currentNodeContentStart = currentNodeStart + 1;
		// We remove leading spaces (but not other white-space) to avoid double spaces when rendering
		currentNodeContentStart += code.original.slice(currentNodeContentStart, nextNodeStart).search(/[^ ]/);
		splitUpNodes.push({
			node: currentNode, start: currentNodeStart, end: nextNodeStart, contentStart: currentNodeContentStart
		});
	}
	return splitUpNodes;
}
