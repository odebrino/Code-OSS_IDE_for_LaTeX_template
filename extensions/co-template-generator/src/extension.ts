/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as yazl from 'yazl';
import {
	TemplateBuildResult,
	TemplateBuildService,
	TemplateManifest,
	TemplatePackage,
	TemplateStoragePaths,
	TemplateSummary,
	loadTemplate,
	listTemplates,
	resolveTemplateStoragePaths,
	saveTemplate,
	validateTemplate
} from 'co-template-core';
import { TemplateGeneratorViewProvider, registerTemplateGeneratorView } from './webview';

const DEFAULT_TEMPLATE_SOURCE = String.raw`\documentclass[12pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{parskip}
\usepackage{geometry}
\geometry{a4paper, margin=2.5cm}

\begin{document}
\section*{{title}}

\textbf{Integrantes}\\
{{members}}

\end{document}`;

const DEFAULT_SCHEMA = [
	{ key: 'title', type: 'string', label: 'Titulo' },
	{ key: 'members', type: 'string[]', label: 'Integrantes' }
] satisfies Array<{ key: string; type: 'string' | 'string[]'; label: string }>;

const DEFAULT_PREVIEW = {
	title: 'Modelo de Template',
	members: ['Integrante 1', 'Integrante 2']
};

export async function activate(context: vscode.ExtensionContext) {
	if (isCozitosEnabled()) {
		const output = vscode.window.createOutputChannel('Gerador de Template');
		output.appendLine('Gerador de Template desabilitado no modo Cozitos.');
		context.subscriptions.push(
			output,
			vscode.commands.registerCommand('co.templateGenerator.open', () => {
				output.appendLine('Gerador de Template desabilitado no modo Cozitos.');
			})
		);
		return;
	}

	const controller = new TemplateGeneratorController(context);
	await controller.initialize();

	const provider = registerTemplateGeneratorView(
		context,
		(message) => controller.handleMessage(message),
		() => controller.getState(),
		() => controller.onViewVisible()
	);
	controller.setViewProvider(provider);
	context.subscriptions.push(controller);

	context.subscriptions.push(
		vscode.commands.registerCommand('co.templateGenerator.open', async () => {
			await controller.open();
		})
	);
}

function isCozitosEnabled(): boolean {
	try {
		return typeof process !== 'undefined' && process.env?.COZITOS === '1';
	} catch {
		return false;
	}
}

class TemplateGeneratorController implements vscode.Disposable {
	private viewProvider?: TemplateGeneratorViewProvider;
	private templates: TemplateSummary[] = [];
	private currentTemplate?: TemplatePackage;
	private readonly templateStorage: TemplateStoragePaths;
	private readonly previewRoot: string;
	private readonly buildService: TemplateBuildService;
	private readonly output: vscode.OutputChannel;
	private previewPanel?: vscode.WebviewPanel;
	private initialized = false;
	private bundlePath?: string;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.output = vscode.window.createOutputChannel('Gerador de Template');
		this.templateStorage = resolveTemplateStoragePaths(
			context.globalStorageUri.fsPath,
			path.resolve(context.extensionPath, '..', '..')
		);
		this.previewRoot = path.join(path.dirname(this.templateStorage.primaryDir), 'preview');
		this.buildService = new TemplateBuildService({
			debounceMs: 1500,
			onStatus: status => this.viewProvider?.sendStatus(status),
			onComplete: result => this.handleBuildResult(result)
		});
	}

	async initialize() {
		await this.resolveBundlePath();
		await this.refreshTemplates();
		if (!this.currentTemplate && this.templates.length) {
			await this.selectTemplate(this.templates[0].id, { silent: true, skipBuild: true });
		}
		this.initialized = true;
		this.viewProvider?.sendState(this.getState());
		await this.scheduleBuild();
	}

	setViewProvider(provider: TemplateGeneratorViewProvider) {
		this.viewProvider = provider;
		if (this.initialized) {
			this.viewProvider.sendState(this.getState());
		}
	}

	getState() {
		return {
			templates: this.templates,
			template: this.currentTemplate
				? {
					manifest: this.currentTemplate.manifest,
					mainTex: this.currentTemplate.mainTex,
					previewData: this.currentTemplate.previewData,
					readOnly: this.currentTemplate.readOnly
				}
				: undefined
		};
	}

	async open() {
		try {
			await vscode.commands.executeCommand('workbench.view.extension.co-template-generator');
		} catch {
			// best effort
		}
		try {
			await vscode.commands.executeCommand('workbench.action.focusView', 'co.templateGenerator.mainView');
		} catch {
			// best effort
		}
		this.viewProvider?.show(true);
	}

	onViewVisible() {
		void this.refreshTemplates();
		void this.scheduleBuild();
	}

	async handleMessage(message: any) {
		switch (message?.type) {
			case 'ready':
				this.viewProvider?.sendState(this.getState());
				return;
			case 'selectTemplate':
				await this.selectTemplate(message?.id);
				return;
			case 'createTemplate':
				await this.createTemplate();
				return;
			case 'duplicateTemplate':
				await this.duplicateTemplate();
				return;
			case 'deleteTemplate':
				await this.deleteTemplate();
				return;
			case 'exportTemplate':
				await this.exportTemplate();
				return;
			case 'saveTemplate':
				await this.saveTemplateDraft(message?.draft, message?.previousId);
				return;
			default:
				return;
		}
	}

	dispose() {
		this.buildService.dispose();
		this.output.dispose();
	}

	private async refreshTemplates() {
		this.templates = await listTemplates(this.templateStorage);
		if (this.currentTemplate && !this.templates.some(entry => entry.id === this.currentTemplate?.manifest.id)) {
			this.currentTemplate = undefined;
		}
		if (!this.currentTemplate && this.templates.length) {
			this.currentTemplate = await loadTemplate(this.templateStorage, this.templates[0].id);
		}
		this.viewProvider?.sendState(this.getState());
	}

	private async selectTemplate(id: string, options?: { silent?: boolean; skipBuild?: boolean }) {
		if (!id || typeof id !== 'string') {
			return;
		}
		const template = await loadTemplate(this.templateStorage, id);
		if (!template) {
			return;
		}
		this.currentTemplate = template;
		if (!options?.silent) {
			this.viewProvider?.sendState(this.getState());
		}
		if (!options?.skipBuild) {
			await this.scheduleBuild();
		}
	}

	private async createTemplate() {
		const id = await this.getUniqueTemplateId('novo-template');
		const manifest: TemplateManifest = {
			id,
			name: 'Novo Template',
			version: '0.1.0',
			description: 'Template em branco',
			entry: 'main.tex',
			schema: DEFAULT_SCHEMA.map(field => ({ ...field })),
			defaults: { ...DEFAULT_PREVIEW }
		};
		const saved = await saveTemplate(this.templateStorage, {
			manifest,
			mainTex: DEFAULT_TEMPLATE_SOURCE,
			previewData: { ...DEFAULT_PREVIEW }
		});
		this.currentTemplate = saved;
		await this.refreshTemplates();
		await this.scheduleBuild();
	}

	private async duplicateTemplate() {
		if (!this.currentTemplate) {
			return;
		}
		const base = this.currentTemplate;
		const id = await this.getUniqueTemplateId(`${base.manifest.id}-copia`);
		const manifest: TemplateManifest = {
			...base.manifest,
			id,
			name: `${base.manifest.name} (copia)`
		};
		const saved = await saveTemplate(this.templateStorage, {
			manifest,
			mainTex: base.mainTex,
			previewData: cloneData(base.previewData)
		});
		await copyAssets(base.assetsDir, saved.assetsDir);
		this.currentTemplate = saved;
		await this.refreshTemplates();
		await this.scheduleBuild();
	}

	private async deleteTemplate() {
		const current = this.currentTemplate;
		if (!current || current.readOnly) {
			return;
		}
		await fs.rm(current.dir, { recursive: true, force: true });
		this.currentTemplate = undefined;
		await this.refreshTemplates();
		await this.scheduleBuild();
	}

	private async exportTemplate() {
		if (!this.currentTemplate) {
			return;
		}
		const target = await vscode.window.showSaveDialog({
			filters: { 'Template Package': ['zip'] },
			saveLabel: 'Exportar',
			defaultUri: vscode.Uri.file(path.join(this.context.globalStorageUri.fsPath, `${this.currentTemplate.manifest.id}.zip`))
		});
		if (!target) {
			return;
		}
		try {
			await createTemplateZip(this.currentTemplate, target.fsPath);
			this.output.appendLine(`[${new Date().toISOString()}] Exportado: ${target.fsPath}`);
		} catch (err: any) {
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao exportar: ${err?.message ?? err}`);
		}
	}

	private async saveTemplateDraft(draft: any, previousId: string | undefined) {
		if (!draft || typeof draft !== 'object') {
			return;
		}
		const manifest = draft.manifest as TemplateManifest | undefined;
		if (!manifest) {
			return;
		}
		const validation = validateTemplate(manifest, { dirName: manifest.id });
		if (!validation.ok) {
			this.viewProvider?.sendError(validation.errors.join(' '));
			return;
		}
		const targetId = manifest.id.trim();
		if (!targetId) {
			this.viewProvider?.sendError('ID do template invalido.');
			return;
		}
		if (previousId && previousId !== targetId) {
			const exists = await this.templateExists(targetId);
			if (exists) {
				this.viewProvider?.sendError('Ja existe um template com esse ID.');
				return;
			}
		}

		const current = this.currentTemplate;
		if (current?.readOnly && (!previousId || previousId === current.manifest.id)) {
			this.viewProvider?.sendError('Template somente leitura. Duplique para editar.');
			return;
		}
		if (previousId && previousId !== targetId && current && !current.readOnly) {
			const oldDir = path.join(this.templateStorage.primaryDir, previousId);
			const newDir = path.join(this.templateStorage.primaryDir, targetId);
			if (await fileExists(oldDir) && !await fileExists(newDir)) {
				await fs.rename(oldDir, newDir);
			}
		}

		try {
			const saved = await saveTemplate(this.templateStorage, {
				manifest,
				mainTex: String(draft.mainTex ?? ''),
				previewData: isPlainObject(draft.previewData) ? draft.previewData : {}
			});

			if (current && (current.readOnly || (previousId && previousId !== targetId))) {
				await copyAssets(current.assetsDir, saved.assetsDir);
			}

			this.currentTemplate = saved;
			await this.refreshTemplates();
			await this.scheduleBuild();
		} catch (err: any) {
			this.viewProvider?.sendError(`Falha ao salvar: ${err?.message ?? err}`);
		}
	}

	private async scheduleBuild() {
		if (!this.currentTemplate) {
			return;
		}
		const outDir = path.join(this.previewRoot, this.currentTemplate.manifest.id);
		this.buildService.schedule({
			template: this.currentTemplate,
			previewData: this.currentTemplate.previewData ?? {},
			outDir,
			fast: true
		});
	}

	private async resolveBundlePath() {
		if (this.bundlePath) {
			return;
		}
		const configured = vscode.workspace.getConfiguration('co').get<string>('tectonic.bundlePath');
		const envBundle = process.env.CO_TECTONIC_BUNDLE || process.env.TECTONIC_BUNDLE;
		const storageBundle = path.join(this.context.globalStorageUri.fsPath, 'tectonic.bundle');
		const fromEnv = await pickExistingPath(envBundle);
		if (fromEnv) {
			process.env.CO_TECTONIC_BUNDLE = fromEnv;
			this.bundlePath = fromEnv;
			return;
		}
		const fromConfig = await pickExistingPath(configured);
		if (fromConfig) {
			process.env.CO_TECTONIC_BUNDLE = fromConfig;
			this.bundlePath = fromConfig;
			return;
		}
		if (await fileExists(storageBundle)) {
			process.env.CO_TECTONIC_BUNDLE = storageBundle;
			this.bundlePath = storageBundle;
			return;
		}
		const cached = await findBundleInCache();
		if (cached) {
			await fs.mkdir(this.context.globalStorageUri.fsPath, { recursive: true });
			try {
				await fs.copyFile(cached, storageBundle);
				process.env.CO_TECTONIC_BUNDLE = storageBundle;
				this.bundlePath = storageBundle;
			} catch {
				process.env.CO_TECTONIC_BUNDLE = cached;
				this.bundlePath = cached;
			}
		}
	}

	private async handleBuildResult(result: TemplateBuildResult) {
		if (!result.ok) {
			this.output.appendLine(`[${new Date().toISOString()}] ${result.friendly}`);
			if (result.stdout) {
				this.output.appendLine(result.stdout);
			}
			if (result.stderr) {
				this.output.appendLine(result.stderr);
			}
			return;
		}
		await this.showPreview(result.pdfPath);
	}

	private async showPreview(pdfPath: string) {
		if (!await fileExists(pdfPath)) {
			return;
		}
		const uri = vscode.Uri.file(pdfPath);
		const viewColumn = vscode.ViewColumn.Beside;
		const panel = this.ensurePreviewPanel(viewColumn, vscode.Uri.file(path.dirname(pdfPath)));
		panel.webview.html = getPdfPreviewHtml(panel.webview, uri);
	}

	private ensurePreviewPanel(viewColumn: vscode.ViewColumn, root: vscode.Uri) {
		if (this.previewPanel) {
			this.previewPanel.reveal(viewColumn, true);
			this.previewPanel.webview.options = { enableScripts: false, localResourceRoots: [root] };
			return this.previewPanel;
		}
		const panel = vscode.window.createWebviewPanel(
			'co.templateGenerator.preview',
			'Template Preview',
			{ viewColumn, preserveFocus: true },
			{ enableScripts: false, localResourceRoots: [root] }
		);
		panel.onDidDispose(() => {
			this.previewPanel = undefined;
		});
		this.previewPanel = panel;
		return panel;
	}

	private async templateExists(id: string): Promise<boolean> {
		if (!id) {
			return false;
		}
		const primary = path.join(this.templateStorage.primaryDir, id, 'template.json');
		if (await fileExists(primary)) {
			return true;
		}
		if (this.templateStorage.fallbackDir) {
			const fallback = path.join(this.templateStorage.fallbackDir, id, 'template.json');
			return fileExists(fallback);
		}
		return false;
	}

	private async getUniqueTemplateId(base: string): Promise<string> {
		const cleanBase = slugify(base) || 'template';
		let candidate = cleanBase;
		let counter = 1;
		while (await this.templateExists(candidate)) {
			candidate = `${cleanBase}-${counter}`;
			counter += 1;
		}
		return candidate;
	}
}

function slugify(value: string): string {
	return String(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9\s-_]/g, '')
		.trim()
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function cloneData<T>(data: T): T {
	return JSON.parse(JSON.stringify(data)) as T;
}

function isPlainObject(value: any): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function pickExistingPath(value: string | undefined) {
	if (!value || typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}
	if (await fileExists(trimmed)) {
		return trimmed;
	}
	return undefined;
}

async function findBundleInCache(): Promise<string | undefined> {
	const cacheRoot = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
	const candidates = [
		path.join(cacheRoot, 'Tectonic'),
		path.join(cacheRoot, 'tectonic')
	];
	for (const dir of candidates) {
		const found = await findBundleInDir(dir, 2);
		if (found) {
			return found;
		}
	}
	return undefined;
}

async function findBundleInDir(dir: string, depth: number): Promise<string | undefined> {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const direct = entries.find(entry => entry.isFile() && entry.name.endsWith('.bundle'));
		if (direct) {
			return path.join(dir, direct.name);
		}
		if (depth <= 0) {
			return undefined;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const nested = await findBundleInDir(path.join(dir, entry.name), depth - 1);
			if (nested) {
				return nested;
			}
		}
		return undefined;
	} catch {
		return undefined;
	}
}

async function fileExists(filePath: string) {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

async function copyAssets(sourceDir: string, targetDir: string) {
	if (!await fileExists(sourceDir)) {
		return;
	}
	await fs.rm(targetDir, { recursive: true, force: true });
	await copyDirectory(sourceDir, targetDir);
}

async function copyDirectory(sourceDir: string, targetDir: string) {
	await fs.mkdir(targetDir, { recursive: true });
	const entries = await fs.readdir(sourceDir, { withFileTypes: true });
	for (const entry of entries) {
		const sourcePath = path.join(sourceDir, entry.name);
		const targetPath = path.join(targetDir, entry.name);
		if (entry.isDirectory()) {
			await copyDirectory(sourcePath, targetPath);
		} else if (entry.isFile()) {
			await fs.copyFile(sourcePath, targetPath);
		}
	}
}

async function createTemplateZip(template: TemplatePackage, targetPath: string): Promise<void> {
	const zip = new yazl.ZipFile();
	const output = await fs.open(targetPath, 'w');
	const stream = output.createWriteStream();
	zip.outputStream.pipe(stream);
	zip.addFile(path.join(template.dir, 'template.json'), 'template.json');
	zip.addFile(path.join(template.dir, template.manifest.entry), template.manifest.entry);
	const previewPath = path.join(template.dir, 'preview_data.json');
	if (await fileExists(previewPath)) {
		zip.addFile(previewPath, 'preview_data.json');
	}
	if (await fileExists(template.assetsDir)) {
		await addDirectoryToZip(zip, template.assetsDir, 'assets');
	}
	zip.end();
	await new Promise<void>((resolve, reject) => {
		stream.on('close', resolve);
		stream.on('error', reject);
	});
	await output.close();
}

async function addDirectoryToZip(zip: yazl.ZipFile, sourceDir: string, prefix: string) {
	const entries = await fs.readdir(sourceDir, { withFileTypes: true });
	if (!entries.length) {
		zip.addEmptyDirectory(prefix);
		return;
	}
	for (const entry of entries) {
		const sourcePath = path.join(sourceDir, entry.name);
		const targetPath = path.posix.join(prefix, entry.name);
		if (entry.isDirectory()) {
			await addDirectoryToZip(zip, sourcePath, targetPath);
		} else if (entry.isFile()) {
			zip.addFile(sourcePath, targetPath);
		}
	}
}

/* eslint-disable local/code-no-unexternalized-strings */
function getPdfPreviewHtml(webview: vscode.Webview, pdfUri: vscode.Uri): string {
	const csp = [
		"default-src 'none'",
		`frame-src ${webview.cspSource} blob:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`
	].join('; ');
	const safeUri = webview.asWebviewUri(pdfUri);
	const cacheBust = Date.now();
	return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Preview</title>
<style>
	body, html { margin: 0; padding: 0; height: 100%; background: #1f1f1f; }
	iframe { width: 100%; height: 100%; border: 0; background: #1f1f1f; }
</style>
</head>
<body>
<iframe src="${safeUri}?v=${cacheBust}#toolbar=0&navpanes=0"></iframe>
	</body>
	</html>`;
}
/* eslint-enable local/code-no-unexternalized-strings */

export function deactivate() { }
