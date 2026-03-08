/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { resolveCoPersistentPaths } from 'co-storage-core';

export type CorrecaoStoragePaths = {
	diagramadorBaseDir: string;
	correctionsBaseDir: string;
};

export function resolveCorrecaoStoragePaths(options: {
	globalStoragePath: string;
	workspaceDir?: string;
	saveDirOverride?: string;
}): CorrecaoStoragePaths {
	return {
		diagramadorBaseDir: resolveCoPersistentPaths({
			feature: 'diagramador',
			globalStoragePath: options.globalStoragePath,
			workspaceDir: options.workspaceDir,
			saveDirOverride: options.saveDirOverride
		}).baseDir,
		correctionsBaseDir: resolveCoPersistentPaths({
			feature: 'correcao',
			globalStoragePath: options.globalStoragePath,
			workspaceDir: options.workspaceDir
		}).baseDir
	};
}
