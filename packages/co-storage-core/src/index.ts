/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs/promises';
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
