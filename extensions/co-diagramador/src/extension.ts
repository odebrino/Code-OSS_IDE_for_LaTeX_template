/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { spawn } from 'child_process';
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
	saveTemplate
} from 'co-template-core';
import {
	createDefaultProject,
	createTemplateData,
	DEFAULT_TEMPLATE_ID,
	DiagramadorProject,
	parseProject,
	TEMPLATE_TEST_V0,
	TEMPLATE_TEST_V0_PREVIEW,
	serializeProject
} from './diagramador';
import { DiagramadorStatus, DiagramadorViewProvider, registerDiagramadorView } from './webview';

export async function activate(context: vscode.ExtensionContext) {
	const diagramadorController = new DiagramadorController(context);
	await diagramadorController.initialize();
	const diagramadorProvider = registerDiagramadorView(
		context,
		(message) => diagramadorController?.handleMessage(message),
		() => diagramadorController?.getProject() ?? createDefaultProject(),
		() => diagramadorController?.onViewVisible()
	);
	diagramadorController.setViewProvider(diagramadorProvider);
	context.subscriptions.push(diagramadorController);

	context.subscriptions.push(
		vscode.commands.registerCommand('co.diagramador.open', async () => {
			await diagramadorController?.open();
		})
	);
}

type DiagramadorPaths = {
	baseDir: string;
	projectPath: string;
	outDir: string;
	previewTexPath: string;
	previewPdfPath: string;
	buildLogPath: string;
};

type PdfJsPaths = {
	root: string;
	pdfJsPath: string;
	pdfWorkerPath: string;
	viewerPath: string;
	viewerCssPath: string;
	cMapDir: string;
	standardFontsDir: string;
};

const FONT_BLOCK_PATTERN = /% ========= Fonte[\s\S]*?% ========= Variaveis =========/;
const OPTIMIZED_FONT_BLOCK = String.raw`% ========= Fonte (depois do titulo) =========
\ifPDFTeX
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\fi
\usepackage{lmodern}
\newcommand{\comic}{\sffamily}

% ========= Variaveis =========`;

class DiagramadorController implements vscode.Disposable {
	private project: DiagramadorProject = createDefaultProject();
	private readonly paths: DiagramadorPaths;
	private viewProvider?: DiagramadorViewProvider;
	private readonly buildService: TemplateBuildService;
	private readonly previewManager: DiagramadorPreviewManager;
	private readonly output: vscode.OutputChannel;
	private readonly templateStorage: TemplateStoragePaths;
	private readonly headerImagePath: string;
	private readonly headerImageName = 'modelo_header_image1.jpg';
	private templates: TemplateSummary[] = [];
	private readonly templateCache = new Map<string, TemplatePackage>();
	private initialized = false;
	private bundlePath?: string;

	constructor(private readonly context: vscode.ExtensionContext) {
		const extensionRoot = context.extensionUri.fsPath;
		const globalStoragePath = context.globalStorageUri.fsPath;
		this.paths = resolveDiagramadorPaths();
		this.output = vscode.window.createOutputChannel('Diagramador');
		this.headerImagePath = path.join(extensionRoot, 'resources', this.headerImageName);
		this.templateStorage = resolveTemplateStoragePaths(globalStoragePath, path.resolve(extensionRoot, '..', '..'));
		this.buildService = new TemplateBuildService({
			debounceMs: 1500,
			onStatus: status => this.handleStatus(status),
			onComplete: result => this.handleBuildResult(result)
		});
		this.previewManager = new DiagramadorPreviewManager(this.output, extensionRoot, vscode.env.appName);
	}

	async initialize() {
		await ensureDiagramadorDirs(this.paths);
		await this.resolveBundlePath();
		this.project = await loadDiagramadorProject(this.paths);
		await this.ensureDefaultTemplate();
		const selectionChanged = await this.refreshTemplates();
		this.initialized = true;
		this.viewProvider?.sendProject(this.project);
		this.viewProvider?.sendTemplates(this.templates);
		if (selectionChanged) {
			await saveDiagramadorProject(this.paths, this.project);
		}
		await this.scheduleBuild();
	}

	setViewProvider(provider: DiagramadorViewProvider) {
		this.viewProvider = provider;
		if (this.initialized) {
			this.viewProvider.sendProject(this.project);
			this.viewProvider.sendTemplates(this.templates);
		}
	}

	getProject() {
		return this.project;
	}

	async open() {
		await this.ensureInitialized();
		await this.revealView();
		await this.previewManager.open(this.paths.previewPdfPath);
	}

	onViewVisible() {
		void this.refreshTemplates();
		void this.previewManager.open(this.paths.previewPdfPath);
	}

	async handleMessage(message: any) {
		switch (message?.type) {
			case 'ready':
				this.viewProvider?.sendProject(this.project);
				this.viewProvider?.sendTemplates(this.templates);
				return;
			case 'updateTemplate':
				await this.updateTemplate(message?.templateId);
				return;
			case 'updateDoc':
				await this.updateDoc(message?.patch);
				return;
			default:
				return;
		}
	}

	private async ensureInitialized() {
		if (!this.initialized) {
			await this.initialize();
		}
	}

	private async revealView() {
		try {
			await vscode.commands.executeCommand('workbench.view.extension.diagramador');
		} catch {
			// best effort
		}
		try {
			await vscode.commands.executeCommand('workbench.action.focusView', 'co.diagramador.blocksView');
		} catch {
			// best effort
		}
		this.viewProvider?.show(true);
	}

	private async updateTemplate(templateId: any) {
		const normalized = typeof templateId === 'string' && templateId.trim()
			? templateId.trim()
			: DEFAULT_TEMPLATE_ID;
		if (!this.templates.some(template => template.id === normalized)) {
			await this.refreshTemplates();
		}
		if (!this.templates.some(template => template.id === normalized)) {
			return;
		}
		if (this.project.templateId === normalized) {
			return;
		}
		this.project.templateId = normalized;
		await this.saveAndBuild();
	}

	private async updateDoc(patch: any) {
		if (!patch || typeof patch !== 'object') {
			return;
		}
		const doc = this.project.doc ?? createDefaultProject().doc;
		if (typeof patch.title === 'string') {
			doc.title = patch.title;
		}
		if (typeof patch.model === 'string') {
			doc.model = patch.model;
		}
		if (typeof patch.text === 'string') {
			doc.text = patch.text;
		}
		if (Array.isArray(patch.members)) {
			doc.members = patch.members.map((entry: any) => entry === null || entry === undefined ? '' : String(entry));
		}
		if (Array.isArray(patch.keywords)) {
			doc.keywords = patch.keywords.map((entry: any) => entry === null || entry === undefined ? '' : String(entry));
		}
		this.project.doc = doc;
		await this.saveAndBuild();
	}

	private async saveAndBuild() {
		await ensureDiagramadorDirs(this.paths);
		await saveDiagramadorProject(this.paths, this.project);
		await this.scheduleBuild();
	}

	private async scheduleBuild() {
		const template = await this.getTemplatePackage(this.project.templateId);
		if (!template) {
			this.handleStatus({ state: 'error', message: 'Template nao encontrado.' });
			return;
		}
		const previewData = createTemplateData(this.project);
		this.buildService.schedule({
			template,
			previewData,
			outDir: this.paths.outDir,
			fast: true,
			usePreviewTex: true
		});
	}

	private async refreshTemplates(): Promise<boolean> {
		await this.ensureDefaultTemplate();
		this.templates = await listTemplates(this.templateStorage);
		const current = this.project.templateId;
		if (this.templates.length === 0) {
			this.project.templateId = DEFAULT_TEMPLATE_ID;
		} else if (!this.templates.some(template => template.id === current)) {
			this.project.templateId = this.templates[0].id;
		}
		const changed = current !== this.project.templateId;
		this.templateCache.clear();
		this.viewProvider?.sendTemplates(this.templates);
		if (changed) {
			this.viewProvider?.sendProject(this.project);
		}
		return changed;
	}

	private async ensureDefaultTemplate() {
		const existing = await loadTemplate(this.templateStorage, DEFAULT_TEMPLATE_ID);
		if (existing) {
			await this.ensureHeaderImage(existing);
			await this.ensureOptimizedFontBlock(existing);
			await this.ensurePreviewTemplate(existing);
			return;
		}
		const defaults = {
			TaskNumber: 'XX',
			DivulgDate: '00/04/2020',
			DivulgTime: 'As 00h00min',
			DivulgLocal: 'Q.G. da C.O.',
			CumprDate: '00/04/2020',
			CumprTime: 'Ate as 00h00min',
			CumprLocal: 'Q.G. da C.O.',
			NextDate: '00/04/2020',
			NextTime: 'As 00h00min',
			NextLocal: 'Q.G. da C.O.',
			TaskBodyHeight: '6cm',
			TaskBody: ''
		};
		const manifest: TemplateManifest = {
			id: DEFAULT_TEMPLATE_ID,
			name: 'Teste (v0)',
			version: '0.0.1',
			description: 'Template base do Diagramador',
			entry: 'main.tex',
			schema: [
				{ key: 'TaskNumber', type: 'string', label: 'Numero da tarefa' },
				{ key: 'DivulgDate', type: 'string', label: 'Divulgacao (data)' },
				{ key: 'DivulgTime', type: 'string', label: 'Divulgacao (hora)' },
				{ key: 'DivulgLocal', type: 'string', label: 'Divulgacao (local)' },
				{ key: 'CumprDate', type: 'string', label: 'Cumprimento (data)' },
				{ key: 'CumprTime', type: 'string', label: 'Cumprimento (hora)' },
				{ key: 'CumprLocal', type: 'string', label: 'Cumprimento (local)' },
				{ key: 'NextDate', type: 'string', label: 'Proxima tarefa (data)' },
				{ key: 'NextTime', type: 'string', label: 'Proxima tarefa (hora)' },
				{ key: 'NextLocal', type: 'string', label: 'Proxima tarefa (local)' },
				{ key: 'TaskBodyHeight', type: 'string', label: 'Altura do corpo' },
				{ key: 'TaskBody', type: 'string', label: 'Texto da tarefa' }
			],
			defaults
		};
		try {
			const template = await saveTemplate(this.templateStorage, {
				manifest,
				mainTex: TEMPLATE_TEST_V0,
				previewData: defaults
			});
			await fs.copyFile(this.headerImagePath, path.join(template.assetsDir, this.headerImageName));
			await this.ensurePreviewTemplate(template);
		} catch (err: any) {
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao criar template padrao: ${err?.message ?? err}`);
		}
	}

	private async ensurePreviewTemplate(template: TemplatePackage) {
		if (template.readOnly || template.manifest.id !== DEFAULT_TEMPLATE_ID) {
			return;
		}
		const previewPath = path.join(template.dir, 'preview.tex');
		if (await fileExists(previewPath)) {
			return;
		}
		try {
			await fs.writeFile(previewPath, TEMPLATE_TEST_V0_PREVIEW, 'utf8');
		} catch (err: any) {
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao criar preview leve: ${err?.message ?? err}`);
		}
	}

	private async ensureOptimizedFontBlock(template: TemplatePackage) {
		if (template.readOnly || template.manifest.id !== DEFAULT_TEMPLATE_ID) {
			return;
		}
		if (!template.mainTex.includes('\\usepackage{fontspec}') && !template.mainTex.includes('Comic Sans MS')) {
			return;
		}
		const updated = template.mainTex.replace(FONT_BLOCK_PATTERN, OPTIMIZED_FONT_BLOCK);
		if (updated === template.mainTex) {
			return;
		}
		try {
			await fs.writeFile(template.entryPath, updated, 'utf8');
			template.mainTex = updated;
		} catch (err: any) {
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao otimizar fonte: ${err?.message ?? err}`);
		}
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

	private async ensureHeaderImage(template: TemplatePackage) {
		if (template.readOnly) {
			return;
		}
		const expectsPng = template.mainTex.includes('modelo_header_image1.png');
		const expectsJpg = template.mainTex.includes(this.headerImageName);
		if (!expectsPng && !expectsJpg) {
			return;
		}
		try {
			await fs.copyFile(this.headerImagePath, path.join(template.assetsDir, this.headerImageName));
			if (expectsPng && !expectsJpg) {
				const updated = template.mainTex.replaceAll('modelo_header_image1.png', this.headerImageName);
				await fs.writeFile(template.entryPath, updated, 'utf8');
				template.mainTex = updated;
			}
		} catch (err: any) {
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao atualizar imagem de cabecalho: ${err?.message ?? err}`);
		}
	}

	private async getTemplatePackage(templateId: string): Promise<TemplatePackage | undefined> {
		const normalized = templateId?.trim() || DEFAULT_TEMPLATE_ID;
		const cached = this.templateCache.get(normalized);
		if (cached) {
			return cached;
		}
		const template = await loadTemplate(this.templateStorage, normalized);
		if (template) {
			this.templateCache.set(normalized, template);
		}
		return template;
	}

	private handleBuildResult(result: TemplateBuildResult) {
		if (result.ok) {
			return;
		}
		this.output.appendLine(`[${new Date().toISOString()}] ${result.friendly}`);
		if (result.stdout) {
			this.output.appendLine(result.stdout);
		}
		if (result.stderr) {
			this.output.appendLine(result.stderr);
		}
	}

	private handleStatus(status: DiagramadorStatus) {
		this.viewProvider?.sendStatus(status);
		if (status.state === 'success') {
			void this.previewManager.refresh(this.paths.previewPdfPath);
		}
	}

	dispose() {
		this.buildService.dispose();
		this.previewManager.dispose();
		this.output.dispose();
	}
}

class DiagramadorPreviewManager implements vscode.Disposable {
	private lastViewPath?: string;
	private lastImagePath?: string;
	private panel?: vscode.WebviewPanel;
	private readonly pdfjsRoot?: string;
	private readonly previewMode: 'auto' | 'pdfjs' | 'system' | 'image';
	private readonly preferPdfJs: boolean;
	private previewListenerAttached = false;

	constructor(private readonly output: vscode.OutputChannel, extensionRoot: string, appName: string) {
		const candidate = path.resolve(extensionRoot, '..', 'latex-workshop', 'node_modules', 'pdfjs-dist');
		this.pdfjsRoot = candidate;
		this.previewMode = this.resolvePreviewMode(appName);
		this.preferPdfJs = this.previewMode === 'pdfjs' || (this.previewMode === 'auto' && this.shouldPreferPdfJs(appName));
		this.output.appendLine(`[${new Date().toISOString()}] Diagramador preview mode: ${this.previewMode}${this.preferPdfJs ? ' (prefer pdfjs)' : ''}`);
	}

	async open(previewPdfPath: string) {
		if (!await fileExists(previewPdfPath)) {
			return;
		}
		const viewPath = await this.copyForView(previewPdfPath);
		await this.showPreview(viewPath);
		await this.cleanupOldCopies(path.dirname(previewPdfPath), [viewPath, this.lastImagePath]);
	}

	async refresh(previewPdfPath: string) {
		await this.open(previewPdfPath);
	}

	private async copyForView(previewPdfPath: string): Promise<string> {
		const dir = path.dirname(previewPdfPath);
		const viewName = `preview_view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
		const viewPath = path.join(dir, viewName);
		await fs.copyFile(previewPdfPath, viewPath);
		this.lastViewPath = viewPath;
		return viewPath;
	}

	private async showPreview(viewPath: string) {
		const viewColumn = this.pickPreviewColumn();
		const uri = vscode.Uri.file(viewPath);
		if (this.preferPdfJs && await this.showPreviewWebviewPdfJs(viewPath, viewColumn)) {
			this.output.appendLine(`[${new Date().toISOString()}] Preview: pdfjs webview`);
			return;
		}
		if (this.previewMode !== 'image') {
			const customViewer = await this.findPdfCustomEditorViewType();
			if (customViewer) {
				try {
					await vscode.commands.executeCommand('vscode.openWith', uri, customViewer, {
						viewColumn,
						preview: true
					});
					this.panel?.dispose();
					this.panel = undefined;
					this.output.appendLine(`[${new Date().toISOString()}] Preview: custom editor (${customViewer})`);
					return;
				} catch (err: any) {
					this.output.appendLine(`[${new Date().toISOString()}] Falha ao abrir viewer PDF (${customViewer}): ${err?.message ?? err}`);
				}
			}
			const hasPdfViewer = Boolean(vscode.extensions.getExtension('vscode.pdf') || vscode.extensions.getExtension('ms-vscode.pdf'));
			if (hasPdfViewer) {
				try {
					await vscode.commands.executeCommand('vscode.open', uri, {
						viewColumn,
						preview: true
					});
					this.panel?.dispose();
					this.panel = undefined;
					this.output.appendLine(`[${new Date().toISOString()}] Preview: vscode.open (builtin)`);
					return;
				} catch (err: any) {
					this.output.appendLine(`[${new Date().toISOString()}] Falha ao abrir preview: ${err?.message ?? err}`);
				}
			}
		}
		if (!this.preferPdfJs && await this.showPreviewWebviewPdfJs(viewPath, viewColumn)) {
			this.output.appendLine(`[${new Date().toISOString()}] Preview: pdfjs webview (fallback)`);
			return;
		}
		if (this.previewMode !== 'system') {
			const imagePath = await this.renderPreviewImage(viewPath);
			if (imagePath) {
				this.lastImagePath = imagePath;
				await this.showPreviewWebviewImage(imagePath, viewColumn);
				this.output.appendLine(`[${new Date().toISOString()}] Preview: png fallback`);
				return;
			}
		}
		await this.showPreviewWebviewPdf(viewPath, viewColumn);
		this.output.appendLine(`[${new Date().toISOString()}] Preview: iframe fallback`);
	}

	private async findPdfCustomEditorViewType(): Promise<string | undefined> {
		for (const extension of vscode.extensions.all) {
			const customEditors = extension.packageJSON?.contributes?.customEditors;
			if (!Array.isArray(customEditors)) {
				continue;
			}
			const main = extension.packageJSON?.main;
			if (typeof main === 'string') {
				const mainPath = path.join(extension.extensionPath, main);
				if (!await fileExists(mainPath)) {
					continue;
				}
			}
			for (const editor of customEditors) {
				const selector = editor?.selector;
				const selectors = Array.isArray(selector) ? selector : selector ? [selector] : [];
				for (const entry of selectors) {
					const pattern = entry?.filenamePattern;
					if (typeof pattern !== 'string') {
						continue;
					}
					if (pattern.includes('.pdf') || pattern.includes('{pdf') || pattern.includes('pdf}')) {
						if (typeof editor.viewType === 'string') {
							return editor.viewType;
						}
					}
				}
			}
		}
		return undefined;
	}

	private async resolvePdfJsPaths(): Promise<PdfJsPaths | undefined> {
		if (!this.pdfjsRoot) {
			return undefined;
		}
		const root = this.pdfjsRoot;
		const pdfJsPath = path.join(root, 'build', 'pdf.mjs');
		const pdfWorkerPath = path.join(root, 'build', 'pdf.worker.mjs');
		const viewerPath = path.join(root, 'web', 'pdf_viewer.mjs');
		const viewerCssPath = path.join(root, 'web', 'pdf_viewer.css');
		const cMapDir = path.join(root, 'cmaps');
		const standardFontsDir = path.join(root, 'standard_fonts');
		if (!await fileExists(pdfJsPath)) {
			return undefined;
		}
		if (!await fileExists(pdfWorkerPath)) {
			return undefined;
		}
		if (!await fileExists(viewerPath)) {
			return undefined;
		}
		if (!await fileExists(viewerCssPath)) {
			return undefined;
		}
		if (!await fileExists(cMapDir)) {
			return undefined;
		}
		if (!await fileExists(standardFontsDir)) {
			return undefined;
		}
		return {
			root,
			pdfJsPath,
			pdfWorkerPath,
			viewerPath,
			viewerCssPath,
			cMapDir,
			standardFontsDir
		};
	}

	private async showPreviewWebviewPdfJs(viewPath: string, viewColumn: vscode.ViewColumn): Promise<boolean> {
		const paths = await this.resolvePdfJsPaths();
		if (!paths) {
			this.output.appendLine(`[${new Date().toISOString()}] PDF.js assets not found; skipping pdfjs preview.`);
			return false;
		}
		let pdfBase64: string | undefined;
		try {
			const pdfData = await fs.readFile(viewPath);
			pdfBase64 = pdfData.toString('base64');
		} catch (err: any) {
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao ler PDF para preview: ${err?.message ?? err}`);
			return false;
		}
		const dir = path.dirname(viewPath);
		const panel = this.ensurePreviewPanel(viewColumn, [
			vscode.Uri.file(dir),
			vscode.Uri.file(paths.root)
		]);
		panel.webview.html = this.getPdfJsPreviewHtml(panel.webview, paths, pdfBase64);
		return true;
	}

	private ensurePreviewPanel(viewColumn: vscode.ViewColumn, localResourceRoots: vscode.Uri[]) {
		if (!this.panel) {
			this.panel = vscode.window.createWebviewPanel(
				'co.diagramador.preview',
				'Diagramador Preview',
				{ viewColumn, preserveFocus: true },
				{
					enableScripts: true,
					localResourceRoots
				}
			);
			this.panel.onDidDispose(() => {
				this.panel = undefined;
				this.previewListenerAttached = false;
			});
			if (!this.previewListenerAttached) {
				this.previewListenerAttached = true;
				this.panel.webview.onDidReceiveMessage(message => {
					if (message?.type === 'previewError') {
						this.output.appendLine(`[${new Date().toISOString()}] Preview error: ${message?.message ?? 'unknown'}`);
						if (message?.stack) {
							this.output.appendLine(message.stack);
						}
					}
				});
			}
		} else {
			this.panel.reveal(viewColumn, true);
			this.panel.webview.options = {
				enableScripts: true,
				localResourceRoots
			};
		}
		return this.panel;
	}

	private async renderPreviewImage(viewPath: string): Promise<string | undefined> {
		const dir = path.dirname(viewPath);
		const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const base = path.join(dir, `preview_view_${stamp}`);
		const args = ['-f', '1', '-l', '1', '-png', viewPath, base];
		const imagePath = `${base}-1.png`;
		return new Promise(resolve => {
			let stderr = '';
			const child = spawn('pdftoppm', args, { cwd: dir });
			child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
			child.on('error', () => resolve(undefined));
			child.on('close', async (code: number | null) => {
				if (code !== 0) {
					if (stderr.trim()) {
						this.output.appendLine(`[${new Date().toISOString()}] pdftoppm: ${stderr.trim()}`);
					}
					resolve(undefined);
					return;
				}
				if (await fileExists(imagePath)) {
					resolve(imagePath);
					return;
				}
				resolve(undefined);
			});
		});
	}

	private async showPreviewWebviewPdf(viewPath: string, viewColumn: vscode.ViewColumn) {
		const dir = path.dirname(viewPath);
		const panel = this.ensurePreviewPanel(viewColumn, [vscode.Uri.file(dir)]);
		panel.webview.html = this.getPdfPreviewHtml(panel.webview, viewPath);
	}

	private async showPreviewWebviewImage(imagePath: string, viewColumn: vscode.ViewColumn) {
		const dir = path.dirname(imagePath);
		const panel = this.ensurePreviewPanel(viewColumn, [vscode.Uri.file(dir)]);
		panel.webview.html = this.getImagePreviewHtml(panel.webview, imagePath);
	}

	/* eslint-disable local/code-no-unexternalized-strings */
	private getPdfJsPreviewHtml(webview: vscode.Webview, paths: PdfJsPaths, pdfBase64: string): string {
		const nonce = getNonce();
		const csp = [
			"default-src 'none'",
			`img-src ${webview.cspSource} data: blob:`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}' ${webview.cspSource}`,
			`connect-src ${webview.cspSource}`,
			`font-src ${webview.cspSource}`,
			`worker-src ${webview.cspSource} blob:`
		].join('; ');
		const pdfJsUri = webview.asWebviewUri(vscode.Uri.file(paths.pdfJsPath));
		const pdfWorkerUri = webview.asWebviewUri(vscode.Uri.file(paths.pdfWorkerPath));
		const viewerUri = webview.asWebviewUri(vscode.Uri.file(paths.viewerPath));
		const viewerCssUri = webview.asWebviewUri(vscode.Uri.file(paths.viewerCssPath));
		const cMapUri = webview.asWebviewUri(vscode.Uri.file(paths.cMapDir));
		const standardFontsUri = webview.asWebviewUri(vscode.Uri.file(paths.standardFontsDir));
		const pdfPayload = JSON.stringify(pdfBase64);
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Diagramador Preview</title>
<link rel="stylesheet" href="${viewerCssUri}">
<style>
	:root { color-scheme: dark; }
	body {
		margin: 0;
		background: #1e1e1e;
		color: #d4d4d4;
		font-family: "Segoe UI", Arial, sans-serif;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: #252526;
		border-bottom: 1px solid #333;
	}
	.toolbar .spacer { flex: 1; }
	button {
		background: #3c3c3c;
		color: #fff;
		border: 1px solid #4a4a4a;
		border-radius: 4px;
		padding: 4px 8px;
		cursor: pointer;
	}
	button:disabled { opacity: 0.5; cursor: default; }
	input[type="number"] {
		width: 64px;
		background: #1e1e1e;
		color: #d4d4d4;
		border: 1px solid #4a4a4a;
		border-radius: 4px;
		padding: 4px 6px;
	}
	.viewerRoot {
		position: relative;
		flex: 1 1 auto;
	}
	#viewerContainer {
		position: absolute;
		inset: 0;
		overflow: auto;
		background: #1e1e1e;
	}
	#viewer {
		margin: 0 auto;
	}
	.status {
		position: absolute;
		top: 52px;
		left: 12px;
		font-size: 12px;
		color: #9e9e9e;
	}
	.pdfViewer .page {
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
		margin: 12px auto;
	}
</style>
</head>
<body>
	<div class="toolbar">
		<button id="prevPage" type="button">Prev</button>
		<button id="nextPage" type="button">Next</button>
		<span>Page</span>
		<input id="pageNumber" type="number" min="1" value="1" />
		<span id="pageCount">/ 1</span>
		<span class="spacer"></span>
		<button id="zoomOut" type="button">-</button>
		<span id="zoomValue">100%</span>
		<button id="zoomIn" type="button">+</button>
		<button id="fitWidth" type="button">Fit width</button>
	</div>
	<div class="viewerRoot">
		<div id="viewerContainer">
			<div id="viewer" class="pdfViewer"></div>
		</div>
	</div>
	<div id="status" class="status">Loading PDF...</div>
<script nonce="${nonce}" type="module">
	import * as pdfjsLib from '${pdfJsUri}';
	import { EventBus, PDFLinkService, PDFViewer } from '${viewerUri}';
	const vscode = acquireVsCodeApi();

	const pdfBase64 = ${pdfPayload};
	const workerSrc = '${pdfWorkerUri}';
	const cMapUrl = '${cMapUri}/';
	const standardFontDataUrl = '${standardFontsUri}/';

	const statusEl = document.getElementById('status');
	const zoomValue = document.getElementById('zoomValue');
	const pageNumber = document.getElementById('pageNumber');
	const pageCount = document.getElementById('pageCount');
	const prevButton = document.getElementById('prevPage');
	const nextButton = document.getElementById('nextPage');
	const zoomInButton = document.getElementById('zoomIn');
	const zoomOutButton = document.getElementById('zoomOut');
	const fitWidthButton = document.getElementById('fitWidth');

	let pdfViewer;

	async function configureWorker() {
		try {
			const response = await fetch(workerSrc);
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(blobUrl, { type: 'module' });
		} catch (err) {
			pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
		}
	}

	function updateZoomLabel(scale) {
		if (!Number.isFinite(scale)) {
			return;
		}
		zoomValue.textContent = Math.round(scale * 100) + '%';
	}

	function updateNav() {
		if (!pdfViewer) {
			return;
		}
		const total = pdfViewer.pagesCount || 1;
		const current = pdfViewer.currentPageNumber || 1;
		prevButton.disabled = current <= 1;
		nextButton.disabled = current >= total;
	}

	function decodeBase64ToBytes(base64) {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}

	async function loadPdf() {
		try {
			await configureWorker();
			const eventBus = new EventBus();
			const linkService = new PDFLinkService({ eventBus });
			const container = document.getElementById('viewerContainer');
			const viewer = document.getElementById('viewer');
			pdfViewer = new PDFViewer({
				container,
				viewer,
				eventBus,
				linkService
			});
			linkService.setViewer(pdfViewer);

			eventBus.on('pagesinit', () => {
				pageCount.textContent = '/ ' + (pdfViewer.pagesCount || 1);
				pageNumber.value = String(pdfViewer.currentPageNumber || 1);
				pdfViewer.currentScaleValue = 'page-width';
				updateZoomLabel(pdfViewer.currentScale);
				updateNav();
				statusEl.textContent = '';
			});

			eventBus.on('pagechanging', (evt) => {
				pageNumber.value = String(evt.pageNumber || 1);
				updateNav();
			});

			eventBus.on('scalechanging', (evt) => {
				updateZoomLabel(evt.scale);
			});

			const pdfBytes = decodeBase64ToBytes(pdfBase64);
			const loadingTask = pdfjsLib.getDocument({
				data: pdfBytes,
				cMapUrl,
				cMapPacked: true,
				standardFontDataUrl,
				useWasm: false,
				useWorkerFetch: false,
				isEvalSupported: false,
				disableStream: true,
				disableRange: true,
				disableAutoFetch: true,
				disableWorker: true
			});
			const pdfDoc = await loadingTask.promise;
			pdfViewer.setDocument(pdfDoc);
			linkService.setDocument(pdfDoc);
		} catch (err) {
			const message = err && err.message ? err.message : String(err);
			statusEl.textContent = 'Failed to load PDF: ' + message;
			vscode.postMessage({
				type: 'previewError',
				message,
				stack: err && err.stack ? err.stack : undefined
			});
			console.error(err);
		}
	}

	prevButton.addEventListener('click', () => {
		if (pdfViewer) {
			pdfViewer.currentPageNumber = Math.max(1, (pdfViewer.currentPageNumber || 1) - 1);
		}
	});

	nextButton.addEventListener('click', () => {
		if (pdfViewer) {
			const total = pdfViewer.pagesCount || 1;
			pdfViewer.currentPageNumber = Math.min(total, (pdfViewer.currentPageNumber || 1) + 1);
		}
	});

	pageNumber.addEventListener('change', () => {
		if (!pdfViewer) {
			return;
		}
		let value = Number.parseInt(pageNumber.value, 10);
		if (!Number.isFinite(value)) {
			value = pdfViewer.currentPageNumber || 1;
		}
		const total = pdfViewer.pagesCount || 1;
		value = Math.min(Math.max(value, 1), total);
		pdfViewer.currentPageNumber = value;
	});

	zoomInButton.addEventListener('click', () => {
		if (pdfViewer) {
			pdfViewer.currentScale = Math.min((pdfViewer.currentScale || 1) + 0.1, 4);
		}
	});

	zoomOutButton.addEventListener('click', () => {
		if (pdfViewer) {
			pdfViewer.currentScale = Math.max((pdfViewer.currentScale || 1) - 0.1, 0.2);
		}
	});

	fitWidthButton.addEventListener('click', () => {
		if (pdfViewer) {
			pdfViewer.currentScaleValue = 'page-width';
			updateZoomLabel(pdfViewer.currentScale);
		}
	});

	loadPdf();
</script>
</body>
</html>`;
	}

	private resolvePreviewMode(appName: string): 'auto' | 'pdfjs' | 'system' | 'image' {
		const envMode = (process.env.CO_DIAGRAMADOR_PREVIEW_MODE ?? '').trim().toLowerCase();
		if (envMode === 'pdfjs') {
			return 'pdfjs';
		}
		if (envMode === 'system' || envMode === 'custom') {
			return 'system';
		}
		if (envMode === 'image') {
			return 'image';
		}
		if (envMode === 'auto') {
			return 'auto';
		}
		const lower = appName.toLowerCase();
		if (lower.includes('dev') || lower.includes('oss')) {
			return 'pdfjs';
		}
		return 'auto';
	}

	private shouldPreferPdfJs(appName: string): boolean {
		const lower = appName.toLowerCase();
		return lower.includes('dev') || lower.includes('oss');
	}

	private getPdfPreviewHtml(webview: vscode.Webview, viewPath: string): string {
		const csp = [
			"default-src 'none'",
			`frame-src ${webview.cspSource} blob:`,
			`style-src ${webview.cspSource} 'unsafe-inline'`
		].join('; ');
		const pdfUri = webview.asWebviewUri(vscode.Uri.file(viewPath));
		const cacheBust = Date.now();
		return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Diagramador Preview</title>
<style>
	body, html { margin: 0; padding: 0; height: 100%; background: #1e1e1e; }
	iframe { width: 100%; height: 100%; border: 0; background: #1e1e1e; }
</style>
</head>
<body>
<iframe src="${pdfUri}?v=${cacheBust}#toolbar=0&navpanes=0"></iframe>
</body>
</html>`;
	}

	private getImagePreviewHtml(webview: vscode.Webview, imagePath: string): string {
		const csp = [
			"default-src 'none'",
			`img-src ${webview.cspSource}`,
			`style-src ${webview.cspSource} 'unsafe-inline'`
		].join('; ');
		const imageUri = webview.asWebviewUri(vscode.Uri.file(imagePath));
		const cacheBust = Date.now();
		return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Diagramador Preview</title>
<style>
	body, html { margin: 0; padding: 0; height: 100%; background: #1e1e1e; }
	.preview {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		background: #1e1e1e;
	}
	img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
</head>
<body>
<div class="preview">
	<img src="${imageUri}?v=${cacheBust}" alt="Preview PDF" />
</div>
	</body>
	</html>`;
	}
	/* eslint-enable local/code-no-unexternalized-strings */

	private pickPreviewColumn(): vscode.ViewColumn {
		const hasOpenTabs = vscode.window.tabGroups.all.some(group => group.tabs.length > 0);
		if (!hasOpenTabs) {
			return vscode.ViewColumn.One;
		}
		return vscode.ViewColumn.Beside;
	}

	private async cleanupOldCopies(dir: string, keepPaths: Array<string | undefined>) {
		try {
			const keep = new Set(keepPaths.filter(Boolean) as string[]);
			const entries = await fs.readdir(dir);
			const targets = entries.filter(entry => entry.startsWith('preview_view_'));
			await Promise.all(targets.map(async entry => {
				const full = path.join(dir, entry);
				if (!keep.has(full)) {
					await fs.unlink(full).catch(() => undefined);
				}
			}));
		} catch {
			// best effort
		}
	}

	dispose() {
		this.panel?.dispose();
		if (this.lastViewPath) {
			void fs.unlink(this.lastViewPath).catch(() => undefined);
		}
		if (this.lastImagePath) {
			void fs.unlink(this.lastImagePath).catch(() => undefined);
		}
	}
}

function resolveDiagramadorPaths(): DiagramadorPaths {
	const baseDir = (process.env.CO_SAVE_DIR && process.env.CO_SAVE_DIR.trim())
		? process.env.CO_SAVE_DIR.trim()
		: path.join(os.homedir(), 'teste_salvo');
	return {
		baseDir,
		projectPath: path.join(baseDir, 'project.json'),
		outDir: path.join(baseDir, 'out'),
		previewTexPath: path.join(baseDir, 'out', 'preview.tex'),
		previewPdfPath: path.join(baseDir, 'out', 'preview.pdf'),
		buildLogPath: path.join(baseDir, 'out', 'build.log')
	};
}

async function ensureDiagramadorDirs(paths: DiagramadorPaths) {
	await fs.mkdir(paths.baseDir, { recursive: true });
	await fs.mkdir(paths.outDir, { recursive: true });
}

async function loadDiagramadorProject(paths: DiagramadorPaths): Promise<DiagramadorProject> {
	try {
		const raw = await fs.readFile(paths.projectPath, 'utf8');
		const parsed = parseProject(raw);
		if (parsed) {
			return parsed;
		}
	} catch {
		// ignore
	}
	return createDefaultProject();
}

async function saveDiagramadorProject(paths: DiagramadorPaths, project: DiagramadorProject) {
	const content = serializeProject(project);
	await atomicWrite(paths.projectPath, content);
}

async function atomicWrite(filePath: string, content: string) {
	const tmpPath = `${filePath}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
	await fs.writeFile(tmpPath, content, 'utf8');
	try {
		await fs.rename(tmpPath, filePath);
	} catch {
		await fs.unlink(filePath).catch(() => undefined);
		await fs.rename(tmpPath, filePath);
	}
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

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i += 1) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function deactivate() { }
