/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
	describeTemplateBuildFailure,
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

	test('renderTemplate substitui placeholders sem alterar newcommand', () => {
		const source = String.raw`\newcommand{\Title}{OLD}\section*{ {{Title}} }`;
		const output = renderTemplate(source, { Title: 'Novo' });
		assert.ok(output.includes('\\newcommand{\\Title}{OLD}'));
		assert.ok(output.includes('\\section*{ Novo }'));
	});

	test('renderTemplate formata arrays com quebras', () => {
		const source = String.raw`Integrantes: {{members}}`;
		const output = renderTemplate(source, { members: ['A', 'B'] });
		assert.ok(output.includes('A\\\\B'));
	});

	test('buildPreview preserva campos latex sem escape', async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-core-'));
		const outDir = path.join(tempRoot, 'out');
		const assetsDir = path.join(tempRoot, 'assets');
		await fs.mkdir(assetsDir, { recursive: true });
		const manifest: TemplateManifest = {
			id: 'demo-latex',
			name: 'Demo Latex',
			version: '1.0.0',
			description: 'Demo template',
			entry: 'main.tex',
			schema: [{ key: 'Body', type: 'latex', label: 'Body' }]
		};
		const template: TemplatePackage = {
			manifest,
			dir: tempRoot,
			entryPath: path.join(tempRoot, 'main.tex'),
			assetsDir,
			mainTex: String.raw`\\documentclass{article}\\begin{document}\\input{co_data.tex}\\Body\\end{document}`,
			previewData: {},
			readOnly: false
		};
		const prev = process.env.TECTONIC_PATH;
		process.env.TECTONIC_PATH = '__missing_tectonic__';
		try {
			await buildPreview(template, { Body: '\\textbf{A} & B' }, outDir);
			const dataTex = await fs.readFile(path.join(outDir, 'co_data.tex'), 'utf8');
			assert.ok(dataTex.includes('\\def\\Body{\\textbf{A} & B}'));
		} finally {
			if (prev === undefined) {
				delete process.env.TECTONIC_PATH;
			} else {
				process.env.TECTONIC_PATH = prev;
			}
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	test('buildPreview grava main.tex e co_data.tex mesmo com falha no tectonic', async () => {
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
			schema: [{ key: 'Title', type: 'string', label: 'Title' }]
		};
		const template: TemplatePackage = {
			manifest,
			dir: tempRoot,
			entryPath: path.join(tempRoot, 'main.tex'),
			assetsDir,
			mainTex: String.raw`\\documentclass{article}\\begin{document}\\input{co_data.tex}{{Title}}\\end{document}`,
			previewData: {},
			readOnly: false
		};
		const prev = process.env.TECTONIC_PATH;
		process.env.TECTONIC_PATH = '__missing_tectonic__';
		try {
			const result = await buildPreview(template, { Title: 'Teste' }, outDir);
			assert.strictEqual(result.texPath, path.join(outDir, 'main.tex'));
			const tex = await fs.readFile(result.texPath, 'utf8');
			assert.ok(tex.includes('Teste'));
			const dataTex = await fs.readFile(path.join(outDir, 'co_data.tex'), 'utf8');
			assert.ok(dataTex.includes('\\def\\Title{Teste}'));
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

	test('buildPreview classifica Tectonic ausente com failureCode estruturado', async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-core-'));
		const outDir = path.join(tempRoot, 'out');
		const assetsDir = path.join(tempRoot, 'assets');
		await fs.mkdir(assetsDir, { recursive: true });
		const manifest: TemplateManifest = {
			id: 'demo-not-found',
			name: 'Demo',
			version: '1.0.0',
			description: 'Demo template',
			entry: 'main.tex',
			schema: [{ key: 'Title', type: 'string', label: 'Title' }]
		};
		const template: TemplatePackage = {
			manifest,
			dir: tempRoot,
			entryPath: path.join(tempRoot, 'main.tex'),
			assetsDir,
			mainTex: String.raw`\\documentclass{article}\\begin{document}{{Title}}\\end{document}`,
			previewData: {},
			readOnly: false
		};
		const prev = process.env.TECTONIC_PATH;
		process.env.TECTONIC_PATH = '__missing_tectonic__';
		try {
			const result = await buildPreview(template, { Title: 'Teste' }, outDir);
			assert.strictEqual(result.ok, false);
			assert.strictEqual(result.failureCode, 'tectonic_not_found');
			assert.match(result.friendly, /Tectonic/);
			assert.ok(result.diagnostics?.command);
			assert.ok(result.logPath.endsWith('build.log'));
		} finally {
			if (prev === undefined) {
				delete process.env.TECTONIC_PATH;
			} else {
				process.env.TECTONIC_PATH = prev;
			}
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	test('buildPreview classifica bundle ilegivel antes do spawn', async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-core-'));
		const outDir = path.join(tempRoot, 'out');
		const assetsDir = path.join(tempRoot, 'assets');
		await fs.mkdir(assetsDir, { recursive: true });
		const manifest: TemplateManifest = {
			id: 'demo-bundle',
			name: 'Demo',
			version: '1.0.0',
			description: 'Demo template',
			entry: 'main.tex',
			schema: []
		};
		const template: TemplatePackage = {
			manifest,
			dir: tempRoot,
			entryPath: path.join(tempRoot, 'main.tex'),
			assetsDir,
			mainTex: String.raw`\\documentclass{article}\\begin{document}Teste\\end{document}`,
			previewData: {},
			readOnly: false
		};
		const prevTectonic = process.env.TECTONIC_PATH;
		const prevBundle = process.env.CO_TECTONIC_BUNDLE;
		process.env.TECTONIC_PATH = '__missing_tectonic__';
		process.env.CO_TECTONIC_BUNDLE = path.join(tempRoot, 'missing.bundle');
		try {
			const result = await buildPreview(template, {}, outDir);
			assert.strictEqual(result.ok, false);
			assert.strictEqual(result.failureCode, 'bundle_unreadable');
			assert.match(result.friendly, /bundle/i);
		} finally {
			if (prevTectonic === undefined) {
				delete process.env.TECTONIC_PATH;
			} else {
				process.env.TECTONIC_PATH = prevTectonic;
			}
			if (prevBundle === undefined) {
				delete process.env.CO_TECTONIC_BUNDLE;
			} else {
				process.env.CO_TECTONIC_BUNDLE = prevBundle;
			}
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	test('buildPreview classifica main.tex ilegivel com input_unreadable', async () => {
		if (process.platform === 'win32') {
			return;
		}
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-core-'));
		const outDir = path.join(tempRoot, 'out');
		const assetsDir = path.join(tempRoot, 'assets');
		await fs.mkdir(outDir, { recursive: true });
		await fs.mkdir(assetsDir, { recursive: true });
		const manifest: TemplateManifest = {
			id: 'demo-input',
			name: 'Demo',
			version: '1.0.0',
			description: 'Demo template',
			entry: 'main.tex',
			schema: []
		};
		const template: TemplatePackage = {
			manifest,
			dir: tempRoot,
			entryPath: path.join(tempRoot, 'main.tex'),
			assetsDir,
			mainTex: String.raw`\\documentclass{article}\\begin{document}Teste\\end{document}`,
			previewData: {},
			readOnly: false
		};
		const previousUmask = process.umask(0o444);
		const prevTectonic = process.env.TECTONIC_PATH;
		process.env.TECTONIC_PATH = '__missing_tectonic__';
		try {
			const result = await buildPreview(template, {}, outDir);
			assert.strictEqual(result.ok, false);
			assert.strictEqual(result.failureCode, 'input_unreadable');
			assert.match(result.friendly, /arquivo principal/i);
			const description = describeTemplateBuildFailure(result);
			assert.match(description.summary, /arquivo principal/i);
		} finally {
			process.umask(previousUmask);
			if (prevTectonic === undefined) {
				delete process.env.TECTONIC_PATH;
			} else {
				process.env.TECTONIC_PATH = prevTectonic;
			}
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});
});
