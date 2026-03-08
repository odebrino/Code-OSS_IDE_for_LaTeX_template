/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
	listTemplates,
	loadTemplate,
	scanTemplateStorage,
	saveTemplate,
	TemplateManifest
} from '../index';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('Template Core Storage', () => {
	test('saveTemplate + listTemplates + loadTemplate funcionam em temp dir', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-storage-'));
		try {
			const manifest: TemplateManifest = {
				id: 'template-test',
				name: 'Template Test',
				version: '1.0.0',
				description: 'Template para teste',
				entry: 'main.tex',
				schema: [{ key: 'Title', type: 'string', label: 'Titulo' }]
			};
			await saveTemplate(root, {
				manifest,
				mainTex: '\\documentclass{article}\\begin{document}{{Title}}\\end{document}',
				previewData: { Title: 'OK' }
			});

			const list = await listTemplates(root);
			assert.strictEqual(list.length, 1);
			assert.strictEqual(list[0].id, 'template-test');

			const loaded = await loadTemplate(root, 'template-test');
			assert.ok(loaded);
			assert.strictEqual(loaded?.manifest.id, 'template-test');
			assert.ok(loaded?.mainTex.includes('{{Title}}'));
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('scanTemplateStorage reporta manifestos invalidos sem sumir silenciosamente', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-scan-'));
		try {
			const brokenDir = path.join(root, 'template-quebrado');
			await fs.mkdir(brokenDir, { recursive: true });
			await fs.writeFile(path.join(brokenDir, 'template.json'), '{"id":"template-quebrado","name":"Quebrado"}', 'utf8');
			await fs.writeFile(path.join(brokenDir, 'main.tex'), '\\documentclass{article}', 'utf8');

			const scan = await scanTemplateStorage(root);
			assert.strictEqual(scan.templates.length, 0);
			assert.ok(scan.issues.some(issue => issue.id === 'template-quebrado' && issue.code === 'manifest_invalid'));
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
