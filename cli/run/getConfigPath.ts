import { readdirSync } from 'fs';
import { resolve } from 'path';
import relative from 'require-relative';
import { handleError } from '../logging';

const DEFAULT_CONFIG_BASE = 'rollup.config';

export function getConfigPath(commandConfig: string | true): string {
	const cwd = process.cwd();
	if (commandConfig === true) {
		return resolve(findConfigFileNameInCwd());
	}
	if (commandConfig.slice(0, 5) === 'node:') {
		const pkgName = commandConfig.slice(5);
		try {
			return relative.resolve(`rollup-config-${pkgName}`, cwd);
		} catch {
			try {
				return relative.resolve(pkgName, cwd);
			} catch (err: any) {
				if (err.code === 'MODULE_NOT_FOUND') {
					handleError({
						code: 'MISSING_EXTERNAL_CONFIG',
						message: `Could not resolve config file "${commandConfig}"`
					});
				}
				throw err;
			}
		}
	}
	return resolve(commandConfig);
}

function findConfigFileNameInCwd(): string {
	const filesInWorkingDir = new Set(readdirSync(process.cwd()));
	for (const extension of ['mjs', 'cjs', 'ts']) {
		const fileName = `${DEFAULT_CONFIG_BASE}.${extension}`;
		if (filesInWorkingDir.has(fileName)) return fileName;
	}
	return `${DEFAULT_CONFIG_BASE}.js`;
}
