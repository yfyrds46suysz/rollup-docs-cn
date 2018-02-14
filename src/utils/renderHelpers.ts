import { Node } from '../ast/nodes/shared/Node';
import MagicString from 'magic-string';
import { RenderOptions } from '../Module';

export function findFirstOccurrenceOutsideComment (code: string, searchString: string, start: number = 0) {
	let commentStart, searchPos;
	while (true) {
		commentStart = code.indexOf('/', start);
		searchPos = code.indexOf(searchString, start);
		if (commentStart === -1) break;
		if (searchPos >= commentStart) {
			searchPos = -1;
		} else if (searchPos !== -1) break;
		start = commentStart + 1;
		if (code[start] === '*') {
			start = code.indexOf('*/', start) + 2;
		} else if (code[start] === '/') {
			start = code.indexOf('\n', start) + 1;
		}
	}
	return searchPos;
}

function findFirstLineBreakOutsideComment (code: string, start: number = 0) {
	let commentStart, lineBreakPos;
	while (true) {
		commentStart = code.indexOf('/*', start);
		lineBreakPos = code.indexOf('\n', start);
		if (commentStart === -1) break;
		if (lineBreakPos >= commentStart) {
			lineBreakPos = -1;
		} else if (lineBreakPos !== -1) break;
		start = code.indexOf('*/', commentStart) + 2;
	}
	return lineBreakPos;
}

export function renderStatementList (statements: Node[], code: MagicString, start: number, end: number, options: RenderOptions) {
	if (statements.length === 0) return;
	let currentNode, currentNodeStart, currentNodeNeedsBoundaries, nextNodeStart;
	let nextNode = statements[0];
	let nextNodeNeedsBoundaries = !nextNode.included || nextNode.needsBoundaries;
	if (nextNodeNeedsBoundaries) {
		nextNodeStart = start + findFirstLineBreakOutsideComment(code.original.slice(start, nextNode.start)) + 1;
	}

	for (let nextIndex = 1; nextIndex <= statements.length; nextIndex++) {
		currentNode = nextNode;
		currentNodeStart = nextNodeStart;
		currentNodeNeedsBoundaries = nextNodeNeedsBoundaries;
		nextNode = statements[nextIndex];
		nextNodeNeedsBoundaries = nextNode === undefined ? false : !nextNode.included || nextNode.needsBoundaries;
		if (currentNodeNeedsBoundaries || nextNodeNeedsBoundaries) {
			nextNodeStart = currentNode.end + findFirstLineBreakOutsideComment(
				code.original.slice(currentNode.end, nextNode === undefined ? end : nextNode.start)
			) + 1;
			if (currentNode.included) {
				currentNodeNeedsBoundaries
					? currentNode.render(code, options, { start: currentNodeStart, end: nextNodeStart })
					: currentNode.render(code, options);
			} else {
				code.remove(currentNodeStart, nextNodeStart);
			}
		} else {
			currentNode.render(code, options);
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
	separator: number | null;
	contentEnd: number,
	end: number;
})[] {
	const splitUpNodes = [];
	let node, nextNode, nextNodeStart, contentEnd, char;
	let separator = start - 1;

	for (let nextIndex = 0; nextIndex < nodes.length; nextIndex++) {
		nextNode = nodes[nextIndex];
		if (node !== undefined) {
			separator = node.end + findFirstOccurrenceOutsideComment(
				code.original.slice(node.end, nextNode.start), ','
			);
		}
		nextNodeStart = contentEnd = separator + 2 + findFirstLineBreakOutsideComment(
			code.original.slice(separator + 1, nextNode.start)
		);
		while (char = code.original.charCodeAt(nextNodeStart),
		char === 32 /*" "*/ || char === 9 /*"\t"*/ || char === 10 /*"\n"*/ || char === 13/*"\r"*/) nextNodeStart++;
		if (node !== undefined) {
			splitUpNodes.push({
				node, start, contentEnd, separator, end: nextNodeStart
			});
		}
		node = nextNode;
		start = nextNodeStart;
	}
	splitUpNodes.push({
		node, start, separator: null, contentEnd: end, end
	});
	return splitUpNodes;
}
