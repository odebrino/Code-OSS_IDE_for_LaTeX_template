/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { TemplateGeneratorHooks } from '../../testing/hooks';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('CO Template Generator Hooks Integration (Headless)', () => {
	test('lista templates, seleciona e retorna snapshot', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-generator-hooks-'));
		const templateDir = path.join(root, '.co', 'templates', 'tarefa');
		await fs.mkdir(templateDir, { recursive: true });
		await fs.writeFile(path.join(templateDir, 'template.json'), JSON.stringify({
			id: 'tarefa',
			name: 'Tarefa',
			version: '1.0.0',
			description: 'Template para testes',
			entry: 'main.tex',
			schema: [{ key: 'Title', type: 'string', label: 'Titulo' }]
		}), 'utf8');
		try {
			const hooks = new TemplateGeneratorHooks(root);
			await hooks.initialize();
			const templates = await hooks.listTemplatesNow();
			assert.ok(templates.length >= 1);
			hooks.selectTemplate('tarefa');
			const snapshot = hooks.getStateSnapshot();
			assert.strictEqual(snapshot.selectedTemplateId, 'tarefa');
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('buildPreviewNow trata TECTONIC_PATH ausente sem throw', async () => {
		const hooks = new TemplateGeneratorHooks('');
		const previous = process.env.TECTONIC_PATH;
		process.env.TECTONIC_PATH = '__missing__';
		try {
			const result = await hooks.buildPreviewNow();
			assert.strictEqual(result.ok, false);
			assert.strictEqual(result.notFound, true);
		} finally {
			if (previous === undefined) {
				delete process.env.TECTONIC_PATH;
			} else {
				process.env.TECTONIC_PATH = previous;
			}
		}
	});
});
