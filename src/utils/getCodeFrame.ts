function spaces(index: number): string {
	let result = '';
	while (index--) result += ' ';
	return result;
}

function tabsToSpaces(value: string): string {
	return value.replace(/^\t+/, match => match.split('\t').join('  '));
}

export default function getCodeFrame(source: string, line: number, column: number): string {
	let lines = source.split('\n');

	const frameStart = Math.max(0, line - 3);
	let frameEnd = Math.min(line + 2, lines.length);

	lines = lines.slice(frameStart, frameEnd);
	while (!/\S/.test(lines[lines.length - 1])) {
		lines.pop();
		frameEnd -= 1;
	}

	const digits = String(frameEnd).length;

	return lines
		.map((sourceLine, index) => {
			const isErrorLine = frameStart + index + 1 === line;

			let lineNumber = String(index + frameStart + 1);
			while (lineNumber.length < digits) lineNumber = ` ${lineNumber}`;

			if (isErrorLine) {
				const indicator =
					spaces(digits + 2 + tabsToSpaces(sourceLine.slice(0, column)).length) + '^';
				return `${lineNumber}: ${tabsToSpaces(sourceLine)}\n${indicator}`;
			}

			return `${lineNumber}: ${tabsToSpaces(sourceLine)}`;
		})
		.join('\n');
}
