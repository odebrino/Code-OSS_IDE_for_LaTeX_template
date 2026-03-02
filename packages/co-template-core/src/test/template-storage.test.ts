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
});
