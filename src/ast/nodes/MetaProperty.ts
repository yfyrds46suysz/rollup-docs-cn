import MagicString from 'magic-string';
import { dirname, normalize, relative } from '../../utils/path';
import { PluginDriver } from '../../utils/pluginDriver';
import { ObjectPathKey } from '../values';
import Identifier from './Identifier';
import MemberExpression from './MemberExpression';
import * as NodeType from './NodeType';
import { NodeBase } from './shared/Node';

const ASSET_PREFIX = 'ROLLUP_ASSET_URL_';
const CHUNK_PREFIX = 'ROLLUP_CHUNK_URL_';

export default class MetaProperty extends NodeBase {
	meta: Identifier;
	property: Identifier;
	type: NodeType.tMetaProperty;

	hasEffectsWhenAccessedAtPath(path: ObjectPathKey[]): boolean {
		return path.length > 1;
	}

	initialise() {
		if (this.meta.name === 'import') {
			this.context.addImportMeta(this);
		}
		this.included = false;
	}

	renderFinalMechanism(
		code: MagicString,
		chunkId: string,
		format: string,
		pluginDriver: PluginDriver
	): boolean {
		if (!this.included) return false;
		const parent = this.parent;
		const importMetaProperty =
			parent instanceof MemberExpression && typeof parent.propertyKey === 'string'
				? parent.propertyKey
				: null;

		if (
			importMetaProperty &&
			(importMetaProperty.startsWith(ASSET_PREFIX) || importMetaProperty.startsWith(CHUNK_PREFIX))
		) {
			let assetReferenceId: string | null = null;
			let chunkReferenceId: string | null = null;
			let fileName: string;
			if (importMetaProperty.startsWith(ASSET_PREFIX)) {
				assetReferenceId = importMetaProperty.substr(ASSET_PREFIX.length);
				fileName = this.context.getAssetFileName(assetReferenceId);
			} else {
				chunkReferenceId = importMetaProperty.substr(CHUNK_PREFIX.length);
				fileName = this.context.getChunkFileName(chunkReferenceId);
			}
			const relativePath = normalize(relative(dirname(chunkId), fileName));
			let replacement;
			if (assetReferenceId !== null) {
				// deprecated hook for assets
				replacement = pluginDriver.hookFirstSync('resolveAssetUrl', [
					{
						assetFileName: fileName,
						chunkId,
						format,
						moduleId: this.context.module.id,
						relativeAssetPath: relativePath
					}
				]);
			}
			if (!replacement) {
				replacement = pluginDriver.hookFirstSync<'resolveFileUrl', string>('resolveFileUrl', [
					{
						assetReferenceId,
						chunkId,
						chunkReferenceId,
						fileName,
						format,
						moduleId: this.context.module.id,
						relativePath
					}
				]);
			}

			code.overwrite(
				(parent as MemberExpression).start,
				(parent as MemberExpression).end,
				replacement
			);
			return true;
		}

		const replacement = pluginDriver.hookFirstSync('resolveImportMeta', [
			importMetaProperty,
			{
				chunkId,
				format,
				moduleId: this.context.module.id
			}
		]);
		if (typeof replacement === 'string') {
			if (parent instanceof MemberExpression) {
				code.overwrite(parent.start, parent.end, replacement);
			} else {
				code.overwrite(this.start, this.end, replacement);
			}
			return true;
		}
		return false;
	}
}
