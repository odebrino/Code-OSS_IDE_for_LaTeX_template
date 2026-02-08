/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
	TemplateManifest,
	TemplatePackage,
	buildPreview,
	renderTemplate,
	validateTemplate
} from '../index';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('Template Core', () => {
	test('validateTemplate rejeita id invalido', () => {
		const manifest: TemplateManifest = {
			id: 'demo',
			name: 'Demo',
			version: '1.0.0',
			description: 'Demo template',
			entry: 'main.tex',
			schema: [{ key: 'title', type: 'string', label: 'Title' }]
		};
		const badId = validateTemplate({ ...manifest, id: '' } as TemplateManifest);
		assert.strictEqual(badId.ok, false);
		const badSlash = validateTemplate({ ...manifest, id: 'bad/id' } as TemplateManifest);
		assert.strictEqual(badSlash.ok, false);
	});

	test('renderTemplate substitui placeholders e newcommand', () => {
		const source = String.raw`\newcommand{\Title}{OLD}\section*{ {{Title}} }`;
		const output = renderTemplate(source, { Title: 'Novo' });
		assert.ok(output.includes('\\newcommand{\\Title}{Novo}'));
		assert.ok(output.includes('\\section*{ Novo }'));
	});

	test('renderTemplate formata arrays com quebras', () => {
		const source = String.raw`Integrantes: {{members}}`;
		const output = renderTemplate(source, { members: ['A', 'B'] });
		assert.ok(output.includes('A\\\\B'));
	});

	test('buildPreview grava preview.tex mesmo com falha no tectonic', async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-core-'));
		const outDir = path.join(tempRoot, 'out');
		const assetsDir = path.join(tempRoot, 'assets');
		await fs.mkdir(assetsDir, { recursive: true });
		const manifest: TemplateManifest = {
			id: 'demo',
			name: 'Demo',
			version: '1.0.0',
			description: 'Demo template',
			entry: 'main.tex',
			schema: [{ key: 'title', type: 'string', label: 'Title' }]
		};
		const template: TemplatePackage = {
			manifest,
			dir: tempRoot,
			entryPath: path.join(tempRoot, 'main.tex'),
			assetsDir,
			mainTex: String.raw`\\documentclass{article}\\begin{document}{{title}}\\end{document}`,
			previewData: {},
			readOnly: false
		};
		const prev = process.env.TECTONIC_PATH;
		process.env.TECTONIC_PATH = '__missing_tectonic__';
		try {
			const result = await buildPreview(template, { title: 'Teste' }, outDir);
			const tex = await fs.readFile(result.texPath, 'utf8');
			assert.ok(tex.includes('Teste'));
			assert.strictEqual(result.ok, false);
		} finally {
			if (prev === undefined) {
				delete process.env.TECTONIC_PATH;
			} else {
				process.env.TECTONIC_PATH = prev;
			}
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});
});
