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
	TemplateBuildService,
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
			assert.strictEqual(result.diagnostics?.context?.templateId, 'demo-not-found');
		} finally {
			if (prev === undefined) {
				delete process.env.TECTONIC_PATH;
			} else {
				process.env.TECTONIC_PATH = prev;
			}
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	test('buildPreview registra contexto operacional no build.log', async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-core-'));
		const outDir = path.join(tempRoot, 'out');
		const assetsDir = path.join(tempRoot, 'assets');
		await fs.mkdir(assetsDir, { recursive: true });
		const manifest: TemplateManifest = {
			id: 'demo-observability',
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
			const result = await buildPreview(template, { Title: 'Teste' }, outDir, {
				buildId: 'build-test-42',
				context: {
					component: 'co-test',
					scope: 'document',
					templateId: manifest.id,
					documentId: 'task-123',
					trigger: 'unit-test'
				},
				queuedAt: Date.now() - 10,
				startedAt: Date.now()
			});
			assert.strictEqual(result.diagnostics?.buildId, 'build-test-42');
			assert.strictEqual(result.diagnostics?.context?.component, 'co-test');
			assert.strictEqual(result.diagnostics?.context?.documentId, 'task-123');
			assert.strictEqual(typeof result.diagnostics?.durationMs, 'number');
			const logContent = await fs.readFile(result.logPath, 'utf8');
			assert.match(logContent, /buildId: build-test-42/);
			assert.match(logContent, /component: co-test/);
			assert.match(logContent, /documentId: task-123/);
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

	test('TemplateBuildService propaga contexto e duracao nos eventos', async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-core-'));
		const outDir = path.join(tempRoot, 'out');
		const assetsDir = path.join(tempRoot, 'assets');
		await fs.mkdir(assetsDir, { recursive: true });
		const manifest: TemplateManifest = {
			id: 'demo-service',
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
		const statuses: Array<{ state: string; buildId?: string; durationMs?: number; component?: string }> = [];
		let service: TemplateBuildService | undefined;
		try {
			const result = await new Promise<Awaited<ReturnType<typeof buildPreview>>>(resolve => {
				service = new TemplateBuildService({
					debounceMs: 0,
					onStatus: status => {
						statuses.push({
							state: status.state,
							buildId: status.buildId,
							durationMs: status.durationMs,
							component: status.context?.component
						});
					},
					onComplete: resolve
				});
				service.schedule({
					template,
					previewData: { Title: 'Teste' },
					outDir,
					context: {
						component: 'co-test',
						scope: 'document',
						templateId: manifest.id,
						documentId: 'task-1',
						trigger: 'unit-test'
					}
				});
			});
			assert.strictEqual(result.ok, false);
			assert.ok(statuses.length >= 2);
			assert.strictEqual(statuses[0].state, 'building');
			assert.strictEqual(statuses[0].component, 'co-test');
			assert.ok(statuses[0].buildId);
			assert.strictEqual(statuses[1].buildId, statuses[0].buildId);
			assert.strictEqual(statuses[1].state, 'error');
			assert.strictEqual(typeof statuses[1].durationMs, 'number');
		} finally {
			service?.dispose();
			if (prev === undefined) {
				delete process.env.TECTONIC_PATH;
			} else {
				process.env.TECTONIC_PATH = prev;
			}
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});
});
