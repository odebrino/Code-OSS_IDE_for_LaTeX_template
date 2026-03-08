/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
		if (!relativePath) {
			return this.baseDir;
		}
		return path.join(this.baseDir, relativePath);
	}
}

export type CoRuntimeRelocationReason = 'hidden_path_under_snap' | 'tmp_path_under_snap';

export type CoRuntimeResolution = {
	baseDir: string;
	rootDir: string;
	requestedRootDir: string;
	relocated: boolean;
	reason?: CoRuntimeRelocationReason;
};

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

function normalizeRuntimeRoot(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) {
		return undefined;
	}
	return path.resolve(trimmed);
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
