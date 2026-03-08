/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { resolvePdfJsRoot } from '../pdfjs';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('CO Preview PDF.js Resolution', () => {
	test('encontra pdfjs-dist em extensions/latex-workshop a partir da extensao CO', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'co-preview-pdfjs-'));
		try {
			const extensionRoot = path.join(root, 'extensions', 'co-diagramador');
			const pdfJsRoot = path.join(root, 'extensions', 'latex-workshop', 'node_modules', 'pdfjs-dist');
			await fs.mkdir(extensionRoot, { recursive: true });
			await fs.mkdir(pdfJsRoot, { recursive: true });
			await fs.writeFile(path.join(pdfJsRoot, 'package.json'), '{"name":"pdfjs-dist"}', 'utf8');

			const resolved = await resolvePdfJsRoot([extensionRoot]);
			assert.strictEqual(resolved, pdfJsRoot);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('prioriza node_modules/pdfjs-dist direto acima da raiz de busca', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'co-preview-direct-'));
		try {
			const extensionRoot = path.join(root, 'extensions', 'co-diagramador');
			const directRoot = path.join(root, 'node_modules', 'pdfjs-dist');
			await fs.mkdir(extensionRoot, { recursive: true });
			await fs.mkdir(directRoot, { recursive: true });
			await fs.writeFile(path.join(directRoot, 'package.json'), '{"name":"pdfjs-dist"}', 'utf8');

			const resolved = await resolvePdfJsRoot([extensionRoot]);
			assert.strictEqual(resolved, directRoot);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
