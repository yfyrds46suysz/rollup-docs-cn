import { Bundle as MagicStringBundle } from 'magic-string';
import { OutputOptions } from '../rollup/types';
import { error } from '../utils/error';
import { FinaliserOptions } from './index';
import { compactEsModuleExport, esModuleExport } from './shared/esModuleExport';
import getExportBlock from './shared/getExportBlock';
import getInteropBlock from './shared/getInteropBlock';
import { keypath, property } from './shared/sanitize';
import setupNamespace from './shared/setupNamespace';
import trimEmptyImports from './shared/trimEmptyImports';
import warnOnBuiltins from './shared/warnOnBuiltins';

function globalProp(name: string) {
	if (!name) return 'null';
	return `global${keypath(name)}`;
}

function safeAccess(name: string, compact: boolean) {
	const parts = name.split('.');

	let acc = 'global';
	return parts.map(part => ((acc += property(part)), acc)).join(compact ? '&&' : ` && `);
}

export default function umd(
	magicString: MagicStringBundle,
	{
		graph,
		namedExportsMode,
		hasExports,
		indentString: t,
		intro,
		outro,
		dependencies,
		exports
	}: FinaliserOptions,
	options: OutputOptions
) {
	const _ = options.compact ? '' : ' ';
	const n = options.compact ? '' : '\n';

	if (hasExports && !options.name) {
		error({
			code: 'INVALID_OPTION',
			message: 'You must supply output.name for UMD bundles'
		});
	}

	warnOnBuiltins(graph, dependencies);

	const amdDeps = dependencies.map(m => `'${m.id}'`);
	const cjsDeps = dependencies.map(m => `require('${m.id}')`);

	const trimmedImports = trimEmptyImports(dependencies);
	const globalDeps = trimmedImports.map(module => globalProp(module.globalName));
	const factoryArgs = trimmedImports.map(m => m.name);

	if (namedExportsMode && (hasExports || options.noConflict === true)) {
		amdDeps.unshift(`'exports'`);
		cjsDeps.unshift(`exports`);
		globalDeps.unshift(
			`${setupNamespace(options.name, 'global', true, options.globals, options.compact)}${_}=${_}${
				options.extend ? `${globalProp(options.name)}${_}||${_}` : ''
			}{}`
		);

		factoryArgs.unshift('exports');
	}

	const amdOptions = options.amd || {};

	const amdParams =
		(amdOptions.id ? `'${amdOptions.id}',${_}` : ``) +
		(amdDeps.length ? `[${amdDeps.join(`,${_}`)}],${_}` : ``);

	const define = amdOptions.define || 'define';

	const cjsExport = !namedExportsMode && hasExports ? `module.exports${_}=${_}` : ``;
	const defaultExport =
		!namedExportsMode && hasExports
			? `${setupNamespace(options.name, 'global', true, options.globals, options.compact)}${_}=${_}`
			: '';

	const useStrict = options.strict !== false ? `${_}'use strict';${n}` : ``;

	let globalExport;

	if (options.noConflict === true) {
		let factory;

		if (!namedExportsMode && hasExports) {
			factory = `var exports${_}=${_}factory(${globalDeps});`;
		} else if (namedExportsMode) {
			const module = globalDeps.shift();
			factory =
				`var exports${_}=${_}${module};${n}` +
				`${t}${t}factory(${['exports'].concat(globalDeps)});`;
		}
		globalExport =
			`(function()${_}{${n}` +
			`${t}${t}var current${_}=${_}${safeAccess(options.name, options.compact)};${n}` +
			`${t}${t}${factory}${n}` +
			`${t}${t}${globalProp(options.name)}${_}=${_}exports;${n}` +
			`${t}${t}exports.noConflict${_}=${_}function()${_}{${_}` +
			`${globalProp(options.name)}${_}=${_}current;${_}return exports${
				options.compact ? '' : '; '
			}};${n}` +
			`${t}})()`;
	} else {
		globalExport = `${defaultExport}factory(${globalDeps})`;
	}

	const iifeNeedsGlobal = hasExports || (options.noConflict === true && namedExportsMode);
	const globalParam = iifeNeedsGlobal ? `global,${_}` : '';
	const globalArg = iifeNeedsGlobal
		? `typeof self${_}!==${_}'undefined'${_}?${_}self${_}:${_}this,${_}`
		: '';
	const cjsIntro = iifeNeedsGlobal
		? `${t}typeof exports${_}===${_}'object'${_}&&${_}typeof module${_}!==${_}'undefined'${_}?` +
		  `${_}${cjsExport}factory(${cjsDeps.join(`,${_}`)})${_}:${n}`
		: '';

	const wrapperIntro =
		`(function${_}(${globalParam}factory)${_}{${n}` +
		cjsIntro +
		`${t}typeof ${define}${_}===${_}'function'${_}&&${_}${define}.amd${_}?${_}${define}(${amdParams}factory)${_}:${n}` +
		`${t}${globalExport};${n}` +
		`}(${globalArg}function${_}(${factoryArgs})${_}{${useStrict}${n}`;

	const wrapperOutro = n + n + '}));';

	// var foo__default = 'default' in foo ? foo['default'] : foo;
	const interopBlock = getInteropBlock(dependencies, options, graph.varOrConst);
	if (interopBlock) magicString.prepend(interopBlock + n + n);

	if (intro) magicString.prepend(intro);

	const exportBlock = getExportBlock(
		exports,
		dependencies,
		namedExportsMode,
		options.interop,
		options.compact
	);
	if (exportBlock) magicString.append(n + n + exportBlock);
	if (namedExportsMode && hasExports && options.esModule)
		magicString.append(n + n + (options.compact ? compactEsModuleExport : esModuleExport));
	if (outro) magicString.append(outro);

	return magicString
		.trim()
		.indent(t)
		.append(wrapperOutro)
		.prepend(wrapperIntro);
}
