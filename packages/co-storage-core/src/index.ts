/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constants as fsConstants } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * Contract for storage providers that operate on relative paths.
 */
export interface StorageProvider {
	/**
	 * Ensure a relative directory exists.
	 */
	ensureDir(relativeDir: string): Promise<void>;
	/**
	 * Read a UTF-8 file by relative path.
	 */
	readFile(relativePath: string): Promise<string | null>;
	/**
	 * Write a UTF-8 file atomically by relative path.
	 */
	writeFileAtomic(relativePath: string, contents: string): Promise<void>;
	/**
	 * Check if a path exists.
	 */
	fileExists(relativePath: string): Promise<boolean>;
	/**
	 * List files in a relative directory.
	 */
	listFiles?(relativeDir: string): Promise<string[]>;
}

/**
 * Local filesystem storage provider rooted at a base directory.
 */
export class LocalStorageProvider implements StorageProvider {
	constructor(public readonly baseDir: string) { }

	/**
	 * @inheritdoc
	 */
	async ensureDir(relativeDir: string): Promise<void> {
		const target = this.resolvePath(relativeDir);
		await fs.mkdir(target, { recursive: true });
	}

	/**
	 * @inheritdoc
	 */
	async readFile(relativePath: string): Promise<string | null> {
		const target = this.resolvePath(relativePath);
		try {
			return await fs.readFile(target, 'utf8');
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err?.code === 'ENOENT') {
				return null;
			}
			throw error;
		}
	}

	/**
	 * @inheritdoc
	 */
	async writeFileAtomic(relativePath: string, contents: string): Promise<void> {
		const target = this.resolvePath(relativePath);
		await fs.mkdir(path.dirname(target), { recursive: true });
		const tmpPath = `${target}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
		await fs.writeFile(tmpPath, contents, 'utf8');
		try {
			await fs.rename(tmpPath, target);
		} catch {
			await fs.unlink(target).catch(() => undefined);
			await fs.rename(tmpPath, target);
		}
	}

	/**
	 * @inheritdoc
	 */
	async fileExists(relativePath: string): Promise<boolean> {
		const target = this.resolvePath(relativePath);
		try {
			await fs.stat(target);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * @inheritdoc
	 */
	async listFiles(relativeDir: string): Promise<string[]> {
		const target = this.resolvePath(relativeDir);
		try {
			const entries = await fs.readdir(target, { withFileTypes: true });
			return entries.filter(entry => entry.isFile()).map(entry => entry.name);
		} catch {
			return [];
		}
	}

	private resolvePath(relativePath: string): string {
		const rootDir = path.resolve(this.baseDir);
		if (!relativePath) {
			return rootDir;
		}
		const target = path.resolve(rootDir, relativePath);
		const relative = path.relative(rootDir, target);
		if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
			return target;
		}
		throw new Error('Storage path escapes base directory.');
	}
}

export type CoRuntimeRelocationReason = 'hidden_path_under_snap' | 'tmp_path_under_snap';

export type CoFeature = 'diagramador' | 'correcao' | 'data-set';

export type CoPersistentSource = 'override' | 'workspace' | 'global';

export type CoPersistentPaths = {
	feature: CoFeature;
	baseDir: string;
	requestedBaseDir: string;
	source: CoPersistentSource;
	workspaceDir?: string;
	globalStorageDir: string;
};

export type CoRuntimePaths = CoRuntimeResolution & {
	feature: CoFeature;
	requestedBaseDir: string;
};

export type ResolveCoPathsOptions = {
	feature: CoFeature;
	appName: string;
	globalStoragePath: string;
	workspaceDir?: string;
	saveDirOverride?: string;
	configuredRuntimeBaseDir?: string;
	envRuntimeBaseDir?: string;
	homeDir?: string;
	platform?: NodeJS.Platform;
	isSnapTectonic?: boolean;
};

export type CoPathResolution = {
	feature: CoFeature;
	persistent: CoPersistentPaths;
	runtime: CoRuntimePaths;
};

export type CoRuntimeResolution = {
	baseDir: string;
	rootDir: string;
	requestedRootDir: string;
	relocated: boolean;
	reason?: CoRuntimeRelocationReason;
};

export function resolveCoPersistentPaths(options: {
	feature: CoFeature;
	globalStoragePath: string;
	workspaceDir?: string;
	saveDirOverride?: string;
}): CoPersistentPaths {
	const config = getFeatureStorageConfig(options.feature);
	const globalStorageRoot = path.dirname(path.resolve(options.globalStoragePath));
	const globalStorageDir = path.join(globalStorageRoot, config.globalStorageSegment);
	const override = options.feature === 'diagramador'
		? normalizeRuntimeRoot(options.saveDirOverride)
		: undefined;
	if (override) {
		return {
			feature: options.feature,
			baseDir: override,
			requestedBaseDir: override,
			source: 'override',
			globalStorageDir
		};
	}
	const workspaceDir = normalizeRuntimeRoot(options.workspaceDir);
	if (workspaceDir) {
		return {
			feature: options.feature,
			baseDir: path.join(workspaceDir, ...config.workspaceSegments),
			requestedBaseDir: path.join(workspaceDir, ...config.workspaceSegments),
			source: 'workspace',
			workspaceDir,
			globalStorageDir
		};
	}
	const baseDir = path.join(globalStorageDir, config.persistentDirName);
	return {
		feature: options.feature,
		baseDir,
		requestedBaseDir: baseDir,
		source: 'global',
		globalStorageDir
	};
}

export async function resolveCoPaths(options: ResolveCoPathsOptions): Promise<CoPathResolution> {
	const persistent = resolveCoPersistentPaths({
		feature: options.feature,
		globalStoragePath: options.globalStoragePath,
		workspaceDir: options.workspaceDir,
		saveDirOverride: options.saveDirOverride
	});
	const runtimeResolution = await resolveCoRuntimeDir({
		featureName: options.feature,
		appName: options.appName,
		configuredBaseDir: options.configuredRuntimeBaseDir,
		envBaseDir: options.envRuntimeBaseDir,
		homeDir: options.homeDir,
		platform: options.platform,
		isSnapTectonic: options.isSnapTectonic
	});
	return {
		feature: options.feature,
		persistent,
		runtime: {
			feature: options.feature,
			baseDir: runtimeResolution.baseDir,
			rootDir: runtimeResolution.rootDir,
			requestedRootDir: runtimeResolution.requestedRootDir,
			requestedBaseDir: runtimeResolution.requestedRootDir,
			relocated: runtimeResolution.relocated,
			reason: runtimeResolution.reason
		}
	};
}

export async function resolveCoRuntimeDir(options: {
	featureName: string;
	appName: string;
	configuredBaseDir?: string;
	envBaseDir?: string;
	homeDir?: string;
	platform?: NodeJS.Platform;
	isSnapTectonic?: boolean;
}): Promise<CoRuntimeResolution> {
	const homeDir = path.resolve(options.homeDir ?? os.homedir());
	const requestedRootDir = path.resolve(
		normalizeRuntimeRoot(options.configuredBaseDir)
		?? normalizeRuntimeRoot(options.envBaseDir)
		?? path.join(homeDir, 'CO-runtime', sanitizeRuntimeProfile(options.appName))
	);
	const requestedFeatureDir = path.join(requestedRootDir, sanitizeRuntimeSegment(options.featureName));
	if (!options.isSnapTectonic || options.platform !== 'linux') {
		return {
			baseDir: requestedFeatureDir,
			rootDir: requestedRootDir,
			requestedRootDir,
			relocated: false
		};
	}
	const compatibility = await getRuntimeCompatibility(requestedFeatureDir, homeDir);
	if (compatibility.ok) {
		return {
			baseDir: requestedFeatureDir,
			rootDir: requestedRootDir,
			requestedRootDir,
			relocated: false
		};
	}
	const fallbackRootDir = path.join(homeDir, 'CO-runtime', sanitizeRuntimeProfile(options.appName));
	return {
		baseDir: path.join(fallbackRootDir, sanitizeRuntimeSegment(options.featureName)),
		rootDir: fallbackRootDir,
		requestedRootDir,
		relocated: true,
		reason: compatibility.reason
	};
}

export async function pruneRuntimeChildren(baseDir: string, options?: {
	maxAgeDays?: number;
	maxEntries?: number;
}): Promise<void> {
	const maxAgeDays = options?.maxAgeDays ?? 14;
	const maxEntries = options?.maxEntries ?? 50;
	const maxAgeMs = Math.max(1, maxAgeDays) * 24 * 60 * 60 * 1000;
	let entries: Array<{ name: string; path: string; mtimeMs: number }> = [];
	try {
		const dirents = await fs.readdir(baseDir, { withFileTypes: true });
		entries = await Promise.all(dirents
			.filter(entry => entry.isDirectory())
			.map(async entry => {
				const targetPath = path.join(baseDir, entry.name);
				const stats = await fs.stat(targetPath);
				return {
					name: entry.name,
					path: targetPath,
					mtimeMs: stats.mtimeMs
				};
			}));
	} catch {
		return;
	}
	const now = Date.now();
	const sorted = entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
	for (let index = 0; index < sorted.length; index++) {
		const entry = sorted[index];
		const tooOld = now - entry.mtimeMs > maxAgeMs;
		const overLimit = index >= maxEntries;
		if (!tooOld && !overLimit) {
			continue;
		}
		await fs.rm(entry.path, { recursive: true, force: true }).catch(() => undefined);
	}
}

export async function resolveExecutableOnPath(binaryName: string, envPath = process.env.PATH ?? ''): Promise<string | undefined> {
	const candidates = envPath.split(path.delimiter).filter(Boolean);
	const suffixes = process.platform === 'win32'
		? ['', '.exe', '.cmd', '.bat']
		: [''];
	for (const dir of candidates) {
		for (const suffix of suffixes) {
			const target = path.join(dir, `${binaryName}${suffix}`);
			try {
				await fs.access(target, fsConstants.X_OK);
				return target;
			} catch {
				// keep looking
			}
		}
	}
	return undefined;
}

export async function isExecutableCommandSnap(binaryName: string, envPath = process.env.PATH ?? ''): Promise<boolean> {
	const resolved = await resolveExecutableOnPath(binaryName, envPath);
	if (!resolved) {
		return false;
	}
	const normalized = resolved.replace(/\\/g, '/');
	return normalized.startsWith('/snap/') || normalized.startsWith('/var/lib/snapd/snap/bin/') || normalized.includes('/snap/bin/');
}

function normalizeRuntimeRoot(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) {
		return undefined;
	}
	return path.resolve(trimmed);
}

function getFeatureStorageConfig(feature: CoFeature): {
	globalStorageSegment: string;
	persistentDirName: string;
	workspaceSegments: string[];
} {
	switch (feature) {
		case 'diagramador':
			return {
				globalStorageSegment: 'odebrino.co-diagramador',
				persistentDirName: 'diagramador',
				workspaceSegments: ['.co', 'diagramador']
			};
		case 'correcao':
			return {
				globalStorageSegment: 'odebrino.co-correcao',
				persistentDirName: 'corrections',
				workspaceSegments: ['.co', 'corrections']
			};
		case 'data-set':
			return {
				globalStorageSegment: 'odebrino.co-data-set',
				persistentDirName: 'data-set',
				workspaceSegments: ['.co', 'data-set']
			};
	}
}

function sanitizeRuntimeProfile(appName: string): string {
	const normalized = String(appName || 'co').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
	return normalized.replace(/^-+|-+$/g, '') || 'co';
}

function sanitizeRuntimeSegment(value: string): string {
	const normalized = String(value || 'feature').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
	return normalized.replace(/^-+|-+$/g, '') || 'feature';
}

async function getRuntimeCompatibility(targetPath: string, homeDir: string): Promise<
	| { ok: true }
	| { ok: false; reason: CoRuntimeRelocationReason }
> {
	const inspectedPath = await resolveWithExistingAncestors(targetPath);
	if (isPathInside(inspectedPath, path.resolve(os.tmpdir())) || inspectedPath === path.resolve(os.tmpdir())) {
		return { ok: false, reason: 'tmp_path_under_snap' };
	}
	if (containsHiddenHomeSegment(inspectedPath, homeDir)) {
		return { ok: false, reason: 'hidden_path_under_snap' };
	}
	return { ok: true };
}

async function resolveWithExistingAncestors(targetPath: string): Promise<string> {
	const absoluteTarget = path.resolve(targetPath);
	const suffix: string[] = [];
	let current = absoluteTarget;
	while (true) {
		try {
			const stats = await fs.stat(current);
			if (stats) {
				const resolved = await fs.realpath(current).catch(() => current);
				return suffix.reduce((acc, part) => path.join(acc, part), resolved);
			}
		} catch {
			// keep walking up
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return absoluteTarget;
		}
		suffix.unshift(path.basename(current));
		current = parent;
	}
}

function containsHiddenHomeSegment(targetPath: string, homeDir: string): boolean {
	const resolvedTarget = path.resolve(targetPath);
	const resolvedHome = path.resolve(homeDir);
	if (!isPathInside(resolvedTarget, resolvedHome) && resolvedTarget !== resolvedHome) {
		return false;
	}
	const relative = path.relative(resolvedHome, resolvedTarget);
	if (!relative || relative === '.') {
		return false;
	}
	return relative
		.split(path.sep)
		.filter(Boolean)
		.some(segment => segment.startsWith('.'));
}

function isPathInside(targetPath: string, parentPath: string): boolean {
	const relative = path.relative(parentPath, targetPath);
	return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}
