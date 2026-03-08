/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs/promises';
import path from 'path';

export async function resolvePdfJsRoot(searchRoots: string[]): Promise<string | undefined> {
	const roots = searchRoots.length ? searchRoots : [process.cwd()];
	for (const root of roots) {
		const found = await findPdfJsRoot(root);
		if (found) {
			return found;
		}
	}
	return undefined;
}

export function dedupePaths(values: string[]): string[] {
	return Array.from(new Set(values.map(value => path.resolve(value))));
}

async function findPdfJsRoot(startDir: string): Promise<string | undefined> {
	let current = startDir;
	for (let depth = 0; depth < 7; depth += 1) {
		const candidate = path.join(current, 'node_modules', 'pdfjs-dist');
		if (await fileExists(path.join(candidate, 'package.json'))) {
			return candidate;
		}
		const bundled = await findPdfJsInExtensionsDir(path.join(current, 'extensions'));
		if (bundled) {
			return bundled;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
	return undefined;
}

async function findPdfJsInExtensionsDir(extensionsDir: string): Promise<string | undefined> {
	let entries: Array<import('fs').Dirent>;
	try {
		entries = await fs.readdir(extensionsDir, { withFileTypes: true });
	} catch {
		return undefined;
	}
	const preferred = ['latex-workshop'];
	for (const name of preferred) {
		const candidate = path.join(extensionsDir, name, 'node_modules', 'pdfjs-dist');
		if (await fileExists(path.join(candidate, 'package.json'))) {
			return candidate;
		}
	}
	for (const entry of entries) {
		if (!entry.isDirectory() || preferred.includes(entry.name)) {
			continue;
		}
		const candidate = path.join(extensionsDir, entry.name, 'node_modules', 'pdfjs-dist');
		if (await fileExists(path.join(candidate, 'package.json'))) {
			return candidate;
		}
	}
	return undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}
