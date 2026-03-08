/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { resolveTemplateStoragePaths } from 'co-template-core';
import { resolveCoPaths } from 'co-storage-core';

export type DataSetLocation = 'workspace' | 'global';

export type ScanRoot = {
	id: string;
	label: string;
	location: DataSetLocation;
	baseDir: string;
	diagramadorDir?: string;
	runtimeDirs: string[];
	templateDirs: string[];
};

export async function resolveDataSetScanRoots(options: {
	workspaceFolders: Array<{ name: string; fsPath: string }>;
	globalStoragePath: string;
	appName: string;
	configuredRuntimeBaseDir?: string;
	envRuntimeBaseDir?: string;
	saveDirOverride?: string;
	platform?: NodeJS.Platform;
	homeDir?: string;
	isSnapTectonic?: boolean;
}): Promise<ScanRoot[]> {
	const runtimeOptions = {
		appName: options.appName,
		globalStoragePath: options.globalStoragePath,
		configuredRuntimeBaseDir: options.configuredRuntimeBaseDir,
		envRuntimeBaseDir: options.envRuntimeBaseDir,
		platform: options.platform,
		homeDir: options.homeDir,
		isSnapTectonic: options.isSnapTectonic
	};
	const templateStorage = resolveTemplateStoragePaths(options.globalStoragePath);
	const templateDirs = [templateStorage.primaryDir, templateStorage.fallbackDir].filter((value): value is string => Boolean(value));
	const roots: ScanRoot[] = [];

	if (options.saveDirOverride?.trim()) {
		const diagramadorPaths = await resolveCoPaths({
			feature: 'diagramador',
			workspaceDir: undefined,
			saveDirOverride: options.saveDirOverride,
			...runtimeOptions
		});
		roots.push(createScanRoot({
			id: `custom:${diagramadorPaths.persistent.baseDir}`,
			label: `CO_SAVE_DIR: ${diagramadorPaths.persistent.baseDir}`,
			location: 'global',
			baseDir: diagramadorPaths.persistent.baseDir,
			diagramadorDir: diagramadorPaths.persistent.baseDir,
			runtimeBaseDir: diagramadorPaths.runtime.baseDir,
			templateDirs
		}));
	}

	for (const folder of options.workspaceFolders) {
		const diagramadorPaths = await resolveCoPaths({
			feature: 'diagramador',
			workspaceDir: folder.fsPath,
			saveDirOverride: options.saveDirOverride,
			...runtimeOptions
		});
		roots.push(createScanRoot({
			id: `workspace:${folder.fsPath}`,
			label: `Workspace: ${folder.name}`,
			location: 'workspace',
			baseDir: folder.fsPath,
			diagramadorDir: diagramadorPaths.persistent.baseDir,
			runtimeBaseDir: diagramadorPaths.runtime.baseDir,
			templateDirs
		}));
	}

	const globalDiagramadorPaths = await resolveCoPaths({
		feature: 'diagramador',
		workspaceDir: undefined,
		saveDirOverride: options.saveDirOverride,
		...runtimeOptions
	});
	roots.push(createScanRoot({
		id: 'global',
		label: 'Global',
		location: 'global',
		baseDir: path.dirname(options.globalStoragePath),
		diagramadorDir: globalDiagramadorPaths.persistent.baseDir,
		runtimeBaseDir: globalDiagramadorPaths.runtime.baseDir,
		templateDirs
	}));

	return dedupeRoots(roots);
}

export function collectWatchDirs(roots: ScanRoot[]): string[] {
	const dirs = new Set<string>();
	for (const root of roots) {
		if (root.diagramadorDir) {
			dirs.add(root.diagramadorDir);
		}
		for (const runtimeDir of root.runtimeDirs) {
			dirs.add(runtimeDir);
		}
		for (const templateDir of root.templateDirs) {
			dirs.add(templateDir);
		}
	}
	return Array.from(dirs.values()).sort();
}

function createScanRoot(input: {
	id: string;
	label: string;
	location: DataSetLocation;
	baseDir: string;
	diagramadorDir?: string;
	runtimeBaseDir: string;
	templateDirs: string[];
}): ScanRoot {
	return {
		id: input.id,
		label: input.label,
		location: input.location,
		baseDir: input.baseDir,
		diagramadorDir: input.diagramadorDir,
		runtimeDirs: [
			path.join(input.runtimeBaseDir, 'out'),
			path.join(input.runtimeBaseDir, 'template-preview')
		],
		templateDirs: input.templateDirs
	};
}

function dedupeRoots(roots: ScanRoot[]): ScanRoot[] {
	const seen = new Set<string>();
	const deduped: ScanRoot[] = [];
	for (const root of roots) {
		const key = [
			root.id,
			root.diagramadorDir ?? '',
			root.runtimeDirs.join('|'),
			root.templateDirs.join('|')
		].join('::');
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(root);
	}
	return deduped;
}
