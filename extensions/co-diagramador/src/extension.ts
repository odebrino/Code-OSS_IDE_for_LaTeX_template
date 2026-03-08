/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';
import {
	TemplateBuildResult,
	TemplateBuildService,
	TemplateFieldSchema,
	TemplateManifest,
	TemplatePackage,
	TemplateStoragePaths,
	TemplateSummary,
	describeTemplateBuildFailure,
	loadTemplate,
	scanTemplateStorage,
	resolveTemplateStoragePaths,
	resolveTectonicBundlePath,
	saveTemplate,
	validateTemplate
} from 'co-template-core';
import {
	migrateLegacyProject,
	parseProject,
	serializeProject
} from 'co-doc-core';
import {
	CoRuntimeRelocationReason,
	LocalStorageProvider,
	isExecutableCommandSnap,
	pruneRuntimeChildren,
	resolveCoPaths,
	resolveCoPersistentPaths
} from 'co-storage-core';
import {
	createDefaultProject,
	DEFAULT_TEMPLATE_ID,
	DEFAULT_TASK_TYPE,
	DiagramadorProject,
	DiagramadorTaskType,
	LEGACY_TEMPLATE_ID,
	TEMPLATE_TEST_V0
} from './diagramador';
import { DiagramadorViewProvider, registerDiagramadorView } from './webview';
import { DiagramadorHostUi, vscodeHostUi } from './hostUi';
import {
	DiagramadorConfirmRequestMessage,
	DiagramadorBuildDetails,
	DiagramadorHostMessage,
	DiagramadorPreviewInfo,
	DiagramadorRuntimeInfo,
	DiagramadorState,
	DiagramadorStatus,
	DiagramadorTaskSummary,
	DiagramadorTemplateSaveMessage,
	DiagramadorWebviewMessage,
	isDiagramadorWebviewMessage
} from './protocol';
import { PdfPreviewManager, PreviewOpenResult } from 'co-preview-core';
import { createDiagramadorTestingHarness, DiagramadorTestApi } from './testing/harness';
import {
	DIAGRAMADOR_DEFAULT_CREATE_TEMPLATE_ID,
	DIAGRAMADOR_MANAGED_TEMPLATES,
	DIAGRAMADOR_TEMPLATE_OPTIONS
} from './templateSeeds';

export async function activate(context: vscode.ExtensionContext) {
	const testingHarness = process.env.CO_TESTING === '1'
		? createDiagramadorTestingHarness(context)
		: undefined;
	const diagramadorController = new DiagramadorController(context, testingHarness?.dependencies);
	diagramadorController.log('activate: starting');
	await diagramadorController.initialize();
	const diagramadorProvider = registerDiagramadorView(
		context,
		(message, webview) => diagramadorController?.handleMessage(message, webview),
		() => diagramadorController.getState(),
		() => diagramadorController?.onViewVisible()
	);
	diagramadorController.setViewProvider(diagramadorProvider);
	context.subscriptions.push(diagramadorController);

	context.subscriptions.push(
		vscode.commands.registerCommand('co.diagramador.open', async () => {
			diagramadorController.log('command: co.diagramador.open');
			await diagramadorController?.open();
		}),
		vscode.commands.registerCommand('co.diagramador.manageTemplates', async () => {
			diagramadorController.log('command: co.diagramador.manageTemplates');
			await diagramadorController?.manageTemplates();
		})
	);

	if (testingHarness) {
		const api = testingHarness.createApi(diagramadorController);
		return { __test: api satisfies DiagramadorTestApi };
	}

	return undefined;
}

type DiagramadorPaths = {
	storageBaseDir: string;
	runtimeBaseDir: string;
	projectPath: string;
	tasksDir: string;
	outDir: string;
	templatePreviewDir: string;
	previewTexPath: string;
	previewPdfPath: string;
	buildLogPath: string;
};

type DiagramadorBuildServiceLike = vscode.Disposable & {
	schedule(request: {
		template: TemplatePackage;
		previewData: Record<string, any>;
		outDir: string;
		fast?: boolean;
	}): void;
};

type DiagramadorPreviewManagerLike = vscode.Disposable & {
	open(previewPdfPath: string): Promise<PreviewOpenResult>;
	refresh(previewPdfPath: string): Promise<PreviewOpenResult>;
	showStatus(status: {
		state: 'idle' | 'waiting_for_build' | 'ready' | 'build_error' | 'preview_error' | 'unavailable';
		message: string;
		detail?: string;
		title?: string;
		path?: string;
	}): Promise<PreviewOpenResult>;
};

type DiagramadorBuildServiceFactory = (
	scope: 'document' | 'template',
	options: {
		debounceMs?: number;
		onStatus?: (status: DiagramadorStatus) => void;
		onComplete?: (result: TemplateBuildResult) => void;
	}
) => DiagramadorBuildServiceLike;

type DiagramadorPreviewManagerFactory = (
	scope: 'document' | 'template',
	output: vscode.OutputChannel,
	options: {
		extensionRoot: string;
		appName: string;
		title: string;
		viewType: string;
	}
) => DiagramadorPreviewManagerLike;

type DiagramadorMessageTarget = Pick<vscode.Webview, 'postMessage'>;

export type DiagramadorControllerDependencies = {
	ui?: DiagramadorHostUi;
	output?: vscode.OutputChannel;
	createBuildService?: DiagramadorBuildServiceFactory;
	createPreviewManager?: DiagramadorPreviewManagerFactory;
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

const PROJECT_FILE_NAME = 'project.json';
const TASKS_DIR_NAME = 'tarefas';
const OUT_DIR_NAME = 'out';
const PREVIEW_TEX_NAME = 'main.tex';
const PREVIEW_PDF_NAME = 'preview.pdf';
const BUILD_LOG_NAME = 'build.log';
const TEMPLATE_PREVIEW_DIR_NAME = 'template-preview';

const DEFAULT_TEMPLATE_SCHEMA: TemplateFieldSchema[] = [
	{ key: 'Title', type: 'string', label: 'Titulo' },
	{ key: 'Members', type: 'string[]', label: 'Integrantes' }
];

const DEFAULT_TEMPLATE_PREVIEW = {
	Title: 'Modelo de Template',
	Members: ['Integrante 1', 'Integrante 2']
};

const DEFAULT_TEMPLATE_SOURCE = String.raw`\documentclass[12pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{parskip}
\usepackage{geometry}
\geometry{a4paper, margin=2.5cm}

\input{co_data.tex}

\begin{document}
\section*{\Title}

\textbf{Integrantes}\\
\Members

\end{document}`;

function createDefaultBuildService(
	_scope: 'document' | 'template',
	options: {
		debounceMs?: number;
		onStatus?: (status: DiagramadorStatus) => void;
		onComplete?: (result: TemplateBuildResult) => void;
	}
): DiagramadorBuildServiceLike {
	return new TemplateBuildService(options);
}

function createDefaultPreviewManager(
	_scope: 'document' | 'template',
	output: vscode.OutputChannel,
	options: {
		extensionRoot: string;
		appName: string;
		title: string;
		viewType: string;
	}
): DiagramadorPreviewManagerLike {
	return new PdfPreviewManager(output, options);
}

export class DiagramadorController implements vscode.Disposable {
	private project: DiagramadorProject = createDefaultProject();
	private status: DiagramadorStatus = { state: 'idle' };
	private buildError?: string;
	private buildLogPath?: string;
	private buildOutDir?: string;
	private buildDetails?: DiagramadorBuildDetails;
	private previewInfo: DiagramadorPreviewInfo = { state: 'idle', message: 'Aguardando PDF.' };
	private templateStatus: DiagramadorStatus = { state: 'idle' };
	private templateError?: string;
	private templateBuildError?: string;
	private templateBuildLogPath?: string;
	private templateBuildOutDir?: string;
	private templateBuildDetails?: DiagramadorBuildDetails;
	private templatePreviewInfo: DiagramadorPreviewInfo = { state: 'idle', message: 'Aguardando PDF do template.' };
	private paths: DiagramadorPaths;
	private readonly storage: LocalStorageProvider;
	private viewProvider?: DiagramadorViewProvider;
	private readonly buildService: DiagramadorBuildServiceLike;
	private readonly templateBuildService: DiagramadorBuildServiceLike;
	private readonly previewManager: DiagramadorPreviewManagerLike;
	private readonly templatePreviewManager: DiagramadorPreviewManagerLike;
	private readonly output: vscode.OutputChannel;
	private readonly ui: DiagramadorHostUi;
	private readonly templateStorage: TemplateStoragePaths;
	private readonly headerImagePath: string;
	private readonly headerImageName = 'modelo_header_image1.jpg';
	private templates: TemplateSummary[] = [];
	private currentSchema: TemplateFieldSchema[] = [];
	private tasks: DiagramadorTaskSummary[] = [];
	private currentTaskId?: string;
	private editorTemplate?: TemplatePackage;
	private editorAssets: string[] = [];
	private editorRevision = 0;
	private readonly templateCache = new Map<string, TemplatePackage>();
	private initialized = false;
	private bundlePath?: string;
	private viewMode: 'list' | 'task' = 'list';
	private activeTab: 'document' | 'templates' = 'document';
	private openDocumentPreviewOnNextSuccess = false;
	private runtimeInfo: DiagramadorRuntimeInfo;

	constructor(
		private readonly context: vscode.ExtensionContext,
		deps: DiagramadorControllerDependencies = {}
	) {
		const extensionRoot = context.extensionUri.fsPath;
		const globalStoragePath = context.globalStorageUri.fsPath;
		const persistentPaths = resolveCoPersistentPaths({
			feature: 'diagramador',
			globalStoragePath,
			workspaceDir: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
			saveDirOverride: process.env.CO_SAVE_DIR
		});
		const storageBaseDir = persistentPaths.baseDir;
		const bootstrapRuntimeBaseDir = path.join(os.homedir(), 'CO-runtime', 'bootstrap', 'diagramador');
		this.paths = resolveDiagramadorPaths(storageBaseDir, bootstrapRuntimeBaseDir);
		this.storage = new LocalStorageProvider(storageBaseDir);
		this.ui = deps.ui ?? vscodeHostUi;
		this.output = deps.output ?? vscode.window.createOutputChannel('CO Diagramador');
		this.headerImagePath = path.join(extensionRoot, 'resources', this.headerImageName);
		this.templateStorage = resolveTemplateStoragePaths(globalStoragePath, path.resolve(extensionRoot, '..', '..'));
		this.runtimeInfo = {
			baseDir: bootstrapRuntimeBaseDir,
			outDir: path.join(bootstrapRuntimeBaseDir, OUT_DIR_NAME),
			relocated: false
		};
		const createBuildService = deps.createBuildService ?? createDefaultBuildService;
		const createPreviewManager = deps.createPreviewManager ?? createDefaultPreviewManager;
		this.buildService = createBuildService('document', {
			debounceMs: 900,
			onStatus: status => this.handleStatus(status),
			onComplete: result => this.handleBuildResult(result)
		});
		this.templateBuildService = createBuildService('template', {
			debounceMs: 900,
			onStatus: status => this.handleTemplateStatus(status),
			onComplete: result => this.handleTemplateBuildResult(result)
		});
		this.previewManager = createPreviewManager('document', this.output, {
			extensionRoot,
			appName: vscode.env.appName,
			title: 'Diagramador Preview',
			viewType: 'co.diagramador.preview'
		});
		this.templatePreviewManager = createPreviewManager('template', this.output, {
			extensionRoot,
			appName: vscode.env.appName,
			title: 'Template Preview',
			viewType: 'co.diagramador.templatePreview'
		});
	}

	async initialize() {
		await this.resolveRuntimePaths();
		await ensureDiagramadorDirs(this.storage, this.paths);
		await this.cleanupRuntimeArtifacts();
		await this.resolveBundlePath();
		await this.migrateLegacyProject();
		await this.refreshTasks();
		this.viewMode = this.currentTaskId ? 'task' : 'list';
		this.project = createDefaultProject();
		await this.ensureSeedTemplates();
		await this.ensureDefaultTemplate();
		const selectionChanged = await this.refreshTemplates();
		this.initialized = true;
		this.viewProvider?.sendState(this.getState());
		if (selectionChanged && this.currentTaskId) {
			await this.saveAndBuild();
		}
	}

	setViewProvider(provider: DiagramadorViewProvider) {
		this.viewProvider = provider;
		if (this.initialized) {
			this.viewProvider.sendState(this.getState());
		}
	}

	getState(): DiagramadorState {
		const currentTaskMeta = this.getCurrentTaskMeta();
		return {
			templates: this.templates,
			selectedTemplateId: this.project.templateId,
			viewMode: this.viewMode,
			schema: this.currentSchema,
			data: this.project.data ?? {},
			status: this.status,
			buildError: this.buildError,
			buildLogPath: this.buildLogPath,
			buildOutDir: this.buildOutDir,
			buildDetails: this.buildDetails,
			preview: this.previewInfo,
			tasks: this.tasks,
			currentTaskId: this.currentTaskId,
			currentTaskLabel: currentTaskMeta.label,
			currentTaskType: currentTaskMeta.taskType,
			currentTemplateId: currentTaskMeta.templateId,
			currentTemplateName: currentTaskMeta.templateName,
			runtimeInfo: this.runtimeInfo,
			activeTab: this.activeTab,
			templateEditor: {
				selectedTemplateId: this.editorTemplate?.manifest.id ?? '',
				template: this.editorTemplate
					? {
						manifest: this.editorTemplate.manifest,
						mainTex: this.editorTemplate.mainTex,
						previewData: this.editorTemplate.previewData,
						readOnly: this.editorTemplate.readOnly,
						assets: this.editorAssets
					}
					: undefined,
				status: this.templateStatus,
				error: this.templateError,
				buildError: this.templateBuildError,
				buildLogPath: this.templateBuildLogPath,
				buildOutDir: this.templateBuildOutDir,
				buildDetails: this.templateBuildDetails,
				preview: this.templatePreviewInfo,
				revision: this.editorRevision
			}
		};
	}

	async open() {
		this.log('open: requested');
		await this.ensureInitialized();
		await this.revealView();
		await this.refreshTasks();
		if (!this.currentTaskId) {
			this.viewMode = 'list';
		}
		await this.openDocumentPreview();
		this.viewProvider?.sendState(this.getState());
	}

	async manageTemplates() {
		await this.ensureInitialized();
		await this.refreshTemplates();
		type TemplateAction = 'open-folder' | 'import' | 'export' | 'duplicate' | 'delete';
		const actions: Array<vscode.QuickPickItem & { value: TemplateAction }> = [
			{ label: 'Abrir pasta de templates', value: 'open-folder', description: 'Abre o diretorio compartilhado dos templates.' },
			{ label: 'Importar ZIP', value: 'import', description: 'Importa um template ZIP para o storage compartilhado.' },
			{ label: 'Exportar template', value: 'export', description: 'Exporta um template existente para ZIP.' },
			{ label: 'Duplicar template', value: 'duplicate', description: 'Cria uma copia editavel de um template.' },
			{ label: 'Excluir template', value: 'delete', description: 'Remove um template nao-readonly.' }
		];
		const actionPick = await this.ui.showQuickPick(actions, {
			placeHolder: 'Escolha uma acao para gerenciar templates',
			ignoreFocusOut: true
		});
		if (!actionPick) {
			return;
		}
		if (actionPick.value === 'open-folder') {
			await vscode.env.openExternal(vscode.Uri.file(this.templateStorage.primaryDir));
			return;
		}
		if (actionPick.value === 'import') {
			await this.importEditorTemplateZip();
			return;
		}
		const pickableTemplates = this.templates.map(template => ({
			label: template.name,
			description: template.readOnly ? `${template.id} · somente leitura` : template.id,
			value: template.id
		}));
		const templatePick = await this.ui.showQuickPick(pickableTemplates, {
			placeHolder: 'Escolha o template',
			ignoreFocusOut: true
		});
		if (!templatePick) {
			return;
		}
		await this.selectEditorTemplate(templatePick.value, { silent: true, skipBuild: true });
		switch (actionPick.value) {
			case 'export':
				await this.exportEditorTemplate();
				return;
			case 'duplicate':
				await this.duplicateEditorTemplate();
				return;
			case 'delete':
				await this.deleteEditorTemplate();
				return;
			default:
				return;
		}
	}

	onViewVisible() {
		void this.refreshTemplates();
		void this.refreshTasks();
		void this.openDocumentPreview();
	}

	async handleMessage(message: DiagramadorWebviewMessage | unknown, webview?: DiagramadorMessageTarget) {
		if (!isDiagramadorWebviewMessage(message)) {
			return;
		}
		try {
			this.log(`webview message: ${message.type}`);
			await this.ensureInitialized();
			switch (message.type) {
				case 'ready':
					this.viewProvider?.sendState(this.getState());
					return;
				case 'setTab':
					this.setActiveTab(message.tab);
					return;
				case 'openTask':
					await this.openTask(message.taskId);
					return;
				case 'createTask':
					await this.createTask(message, webview);
					return;
				case 'backToList':
					await this.backToList();
					return;
				case 'renameTask':
					await this.renameTask(message.taskId, message.label);
					return;
				case 'deleteTask':
					await this.deleteTask(message.taskId);
					return;
				case 'updateTemplate':
					await this.updateTemplate(message.templateId);
					return;
				case 'updateField':
					await this.updateField(message.key, message.value);
					return;
				case 'templateSelect':
					await this.selectEditorTemplate(message.templateId);
					return;
				case 'templateCreate':
					await this.createEditorTemplate();
					return;
				case 'templateDuplicate':
					await this.duplicateEditorTemplate();
					return;
				case 'templateDelete':
					await this.deleteEditorTemplate();
					return;
				case 'templateExport':
					await this.exportEditorTemplate();
					return;
				case 'templateImport':
					await this.importEditorTemplateZip();
					return;
				case 'templateSave':
					await this.saveEditorTemplateDraft(message);
					return;
				case 'templateAddAsset':
					await this.addEditorAsset(message.name, message.contents);
					return;
				case 'templateDeleteAsset':
					await this.deleteEditorAsset(message.name);
					return;
				case 'openBuildLog':
					await this.openBuildLog(message.scope);
					return;
				case 'openBuildFolder':
					await this.openBuildFolder(message.scope);
					return;
				case 'retryBuild':
					await this.retryBuild(message.scope);
					return;
				case 'confirmRequest':
					await this.handleConfirmRequest(message, webview);
					return;
				default:
					return;
			}
		} catch (err) {
			const details = err instanceof Error ? err.message : String(err);
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao processar acao: ${details}`);
			void this.ui.showErrorMessage(`Falha ao processar acao: ${details}`);
			this.viewProvider?.sendState(this.getState());
		}
	}

	log(message: string) {
		this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
	}

	private setActiveTab(tab: any) {
		if (tab !== 'document' && tab !== 'templates') {
			return;
		}
		if (this.activeTab === tab) {
			return;
		}
		this.activeTab = tab;
		this.viewProvider?.sendState(this.getState());
		if (tab === 'document') {
			void this.openDocumentPreview();
		} else {
			void this.openTemplatePreview();
		}
	}

	private async handleConfirmRequest(message: DiagramadorConfirmRequestMessage, webview?: DiagramadorMessageTarget) {
		if (!webview) {
			return;
		}
		const confirmLabel = message.confirmLabel?.trim() || 'Continuar';
		const cancelLabel = message.cancelLabel?.trim() || 'Cancelar';
		const accepted = message.severity === 'info'
			? (await this.ui.showInformationMessage(message.message, confirmLabel, cancelLabel)) === confirmLabel
			: (await this.ui.showWarningMessage(message.message, {
				modal: true,
				detail: message.detail || message.title
			}, confirmLabel, cancelLabel)) === confirmLabel;
		const response: DiagramadorHostMessage = {
			type: 'confirmResult',
			requestId: message.requestId,
			accepted
		};
		await webview.postMessage(response);
	}

	private async openBuildLog(scope: 'document' | 'template' | unknown) {
		const target = scope === 'template' ? this.templateBuildLogPath : this.buildLogPath;
		if (!target || !await fileExists(target)) {
			await this.ui.showWarningMessage('Log nao encontrado.', undefined);
			return;
		}
		const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
		await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
	}

	private async openBuildFolder(scope: 'document' | 'template' | unknown) {
		const targetDir = scope === 'template'
			? this.templateBuildOutDir ?? (this.editorTemplate ? path.join(this.paths.templatePreviewDir, this.editorTemplate.manifest.id) : undefined)
			: this.buildOutDir ?? this.paths.outDir;
		if (!targetDir || !await fileExists(targetDir)) {
			await this.ui.showWarningMessage('Pasta de saida nao encontrada.', undefined);
			return;
		}
		await vscode.env.openExternal(vscode.Uri.file(targetDir));
	}

	private async retryBuild(scope: 'document' | 'template' | unknown) {
		if (scope === 'template') {
			await this.scheduleTemplateBuild();
			if (this.activeTab === 'templates') {
				await this.openTemplatePreview();
			}
			return;
		}
		if (!this.currentTaskId) {
			return;
		}
		await this.scheduleBuild();
		if (this.activeTab === 'document') {
			await this.openDocumentPreview();
		}
	}

	private async resolveRuntimePaths() {
		const resolution = await resolveCoPaths({
			feature: 'diagramador',
			appName: vscode.env.appName,
			globalStoragePath: this.context.globalStorageUri.fsPath,
			workspaceDir: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
			saveDirOverride: process.env.CO_SAVE_DIR,
			configuredRuntimeBaseDir: vscode.workspace.getConfiguration('co.runtime').get<string>('baseDir'),
			envRuntimeBaseDir: process.env.CO_RUNTIME_BASE_DIR,
			isSnapTectonic: await isSnapTectonicCommand(),
			platform: process.platform
		});
		this.paths = resolveDiagramadorPaths(resolution.persistent.baseDir, resolution.runtime.baseDir);
		this.runtimeInfo = {
			baseDir: resolution.runtime.baseDir,
			outDir: this.paths.outDir,
			relocated: resolution.runtime.relocated,
			reason: formatRuntimeReason(resolution.runtime.reason),
			requestedBaseDir: resolution.runtime.requestedBaseDir
		};
		if (resolution.runtime.relocated) {
			this.output.appendLine(`[${new Date().toISOString()}] Runtime realocado: ${resolution.runtime.requestedBaseDir} -> ${resolution.runtime.baseDir}`);
		}
	}

	private async cleanupRuntimeArtifacts() {
		await fs.mkdir(this.paths.runtimeBaseDir, { recursive: true });
		await fs.mkdir(this.paths.outDir, { recursive: true });
		await fs.mkdir(this.paths.templatePreviewDir, { recursive: true });
		await pruneRuntimeChildren(this.paths.templatePreviewDir, { maxAgeDays: 14, maxEntries: 50 });
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

	private async updateTemplate(templateId: string | undefined) {
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
			await this.ensureTemplateReady(normalized);
			this.viewProvider?.sendState(this.getState());
			return;
		}
		this.project.templateId = normalized;
		const template = await this.ensureTemplateReady(normalized);
		this.viewProvider?.sendState(this.getState());
		await this.saveAndBuild(template);
	}

	private async updateField(key: any, value: any) {
		if (typeof key !== 'string' || !key.trim()) {
			return;
		}
		const schemaEntry = this.currentSchema.find(entry => entry.key === key);
		const nextData = { ...(this.project.data ?? {}) };
		let normalizedValue: string | number | boolean | string[] | undefined;
		if (key === 'TaskLabel') {
			const trimmed = String(value ?? '').trim();
			normalizedValue = trimmed ? trimmed : undefined;
		} else if (key === 'TaskType') {
			normalizedValue = normalizeTaskType(value) ?? DEFAULT_TASK_TYPE;
		} else {
			normalizedValue = normalizeFieldValue(schemaEntry?.type, value);
		}
		if (normalizedValue === undefined) {
			delete nextData[key];
		} else {
			nextData[key] = normalizedValue;
		}
		this.project.data = nextData;
		await this.saveAndBuild();
	}

	private async saveAndBuild(template?: TemplatePackage) {
		if (!this.currentTaskId) {
			return;
		}
		await ensureDiagramadorDirs(this.storage, this.paths);
		const resolvedTemplate = template ?? await this.ensureTemplateReady(this.project.templateId);
		await saveDiagramadorTask(this.storage, this.currentTaskId, this.project);
		await this.refreshTasks();
		this.buildOutDir = this.paths.outDir;
		await this.scheduleBuild(resolvedTemplate);
	}

	private async scheduleBuild(template?: TemplatePackage) {
		if (!this.currentTaskId) {
			return;
		}
		const resolvedTemplate = template ?? await this.ensureTemplateReady(this.project.templateId);
		if (!resolvedTemplate) {
			this.handleStatus({ state: 'error', message: 'Template nao encontrado.' });
			return;
		}
		this.buildOutDir = this.paths.outDir;
		const fastBuild = this.getFastBuildSetting();
		this.buildService.schedule({
			template: resolvedTemplate,
			previewData: this.project.data ?? {},
			outDir: this.paths.outDir,
			fast: fastBuild
		});
	}

	private getFastBuildSetting() {
		return vscode.workspace.getConfiguration('co.diagramador').get<boolean>('fastBuild', true);
	}

	private async selectEditorTemplate(templateId: string | undefined, options?: { silent?: boolean; skipBuild?: boolean }) {
		const normalized = typeof templateId === 'string' ? templateId.trim() : '';
		if (!normalized) {
			return;
		}
		const template = await loadTemplate(this.templateStorage, normalized);
		if (!template) {
			return;
		}
		this.editorTemplate = template;
		this.templateError = undefined;
		await this.refreshEditorAssets();
		if (!options?.silent) {
			this.viewProvider?.sendState(this.getState());
		}
		if (!options?.skipBuild) {
			await this.scheduleTemplateBuild();
		}
		if (this.activeTab === 'templates') {
			await this.openTemplatePreview();
		}
	}

	private async createEditorTemplate() {
		const id = await this.getUniqueTemplateId('novo-template');
		const manifest: TemplateManifest = {
			id,
			name: 'Novo Template',
			version: '0.1.0',
			description: 'Template em branco',
			entry: 'main.tex',
			schema: DEFAULT_TEMPLATE_SCHEMA.map(field => ({ ...field })),
			defaults: { ...DEFAULT_TEMPLATE_PREVIEW }
		};
		const saved = await saveTemplate(this.templateStorage, {
			manifest,
			mainTex: DEFAULT_TEMPLATE_SOURCE,
			previewData: { ...DEFAULT_TEMPLATE_PREVIEW }
		});
		this.editorTemplate = saved;
		this.editorRevision += 1;
		await this.refreshTemplates();
		await this.scheduleTemplateBuild();
	}

	private async duplicateEditorTemplate() {
		const base = this.editorTemplate;
		if (!base) {
			return;
		}
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
		this.editorTemplate = saved;
		this.editorRevision += 1;
		await this.refreshTemplates();
		await this.scheduleTemplateBuild();
	}

	private async deleteEditorTemplate() {
		const current = this.editorTemplate;
		if (!current || current.readOnly) {
			return;
		}
		const wasCurrentTemplate = current.manifest.id === this.project.templateId;
		const previousTemplateId = this.project.templateId;
		const confirmation = await this.ui.showWarningMessage(
			wasCurrentTemplate
				? `Excluir template "${current.manifest.name}"? Ele esta em uso no documento atual e sera substituido.`
				: `Excluir template "${current.manifest.name}"?`,
			{ modal: true },
			'Excluir',
			'Cancelar'
		);
		if (confirmation !== 'Excluir') {
			return;
		}
		await fs.rm(current.dir, { recursive: true, force: true });
		this.editorTemplate = undefined;
		this.editorAssets = [];
		await this.refreshTemplates();
		const templateChanged = this.project.templateId !== previousTemplateId;
		if (templateChanged && this.currentTaskId) {
			await this.saveAndBuild();
		}
		if (templateChanged && wasCurrentTemplate) {
			const nextTemplate = this.templates.find(template => template.id === this.project.templateId);
			const nextName = nextTemplate?.name || this.project.templateId;
			await this.ui.showInformationMessage(`Template atual foi substituido por "${nextName}".`);
		}
		await this.scheduleTemplateBuild();
	}

	private async exportEditorTemplate() {
		if (!this.editorTemplate) {
			return;
		}
		const target = await this.ui.showSaveDialog({
			filters: { 'Template Package': ['zip'] },
			saveLabel: 'Exportar',
			defaultUri: vscode.Uri.file(path.join(this.context.globalStorageUri.fsPath, `${this.editorTemplate.manifest.id}.zip`))
		});
		if (!target) {
			return;
		}
		try {
			await createTemplateZip(this.editorTemplate, target.fsPath);
			this.output.appendLine(`[${new Date().toISOString()}] Exportado: ${target.fsPath}`);
		} catch (err: any) {
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao exportar: ${err?.message ?? err}`);
		}
	}

	private async importEditorTemplateZip() {
		const selection = await this.ui.showOpenDialog({
			canSelectMany: false,
			canSelectFiles: true,
			canSelectFolders: false,
			filters: { 'Template Package': ['zip'] },
			openLabel: 'Importar'
		});
		if (!selection?.length) {
			return;
		}
		const zipPath = selection[0].fsPath;
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-zip-'));
		try {
			await extractZipToDir(zipPath, tempRoot);
			const templateRoot = await findTemplateRoot(tempRoot);
			if (!templateRoot) {
				this.templateError = 'Zip invalido: template.json ou main.tex ausente.';
				this.viewProvider?.sendState(this.getState());
				return;
			}
			const manifestPath = path.join(templateRoot, 'template.json');
			const mainTexPath = path.join(templateRoot, 'main.tex');
			const manifestRaw = await fs.readFile(manifestPath, 'utf8');
			const manifest = JSON.parse(manifestRaw) as TemplateManifest;
			const validation = validateTemplate(manifest, { dirName: manifest.id });
			if (!validation.ok) {
				this.templateError = validation.errors.join(' ');
				this.viewProvider?.sendState(this.getState());
				return;
			}
			if (!await fileExists(mainTexPath)) {
				this.templateError = 'main.tex ausente no zip.';
				this.viewProvider?.sendState(this.getState());
				return;
			}
			const targetDir = path.join(this.templateStorage.primaryDir, manifest.id);
			if (await fileExists(targetDir)) {
				const confirmation = await this.ui.showWarningMessage(
					`Template "${manifest.id}" ja existe. Substituir?`,
					{ modal: true },
					'Substituir',
					'Cancelar'
				);
				if (confirmation !== 'Substituir') {
					return;
				}
				await fs.rm(targetDir, { recursive: true, force: true });
			}
			await fs.mkdir(targetDir, { recursive: true });
			await fs.copyFile(manifestPath, path.join(targetDir, 'template.json'));
			await fs.copyFile(mainTexPath, path.join(targetDir, 'main.tex'));
			const previewPath = path.join(templateRoot, 'preview_data.json');
			if (await fileExists(previewPath)) {
				await fs.copyFile(previewPath, path.join(targetDir, 'preview_data.json'));
			}
			const assetsSource = path.join(templateRoot, 'assets');
			if (await fileExists(assetsSource)) {
				await copyDirectory(assetsSource, path.join(targetDir, 'assets'));
			}
			this.output.appendLine(`[${new Date().toISOString()}] Template importado: ${manifest.id}`);
			await this.refreshTemplates();
			await this.selectEditorTemplate(manifest.id);
		} catch (err: any) {
			this.templateError = `Falha ao importar: ${err?.message ?? err}`;
			this.viewProvider?.sendState(this.getState());
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}

	private async saveEditorTemplateDraft(message: DiagramadorTemplateSaveMessage) {
		const manifestText = typeof message.manifestText === 'string' ? message.manifestText : '';
		const mainTex = typeof message.mainTex === 'string' ? message.mainTex : '';
		const previewText = typeof message.previewText === 'string' ? message.previewText : '';
		const previousId = typeof message.previousId === 'string' ? message.previousId.trim() : undefined;

		let manifest: TemplateManifest;
		try {
			manifest = JSON.parse(manifestText) as TemplateManifest;
		} catch {
			this.templateError = 'template.json invalido.';
			this.viewProvider?.sendState(this.getState());
			return;
		}
		const validation = validateTemplate(manifest, { dirName: manifest.id });
		if (!validation.ok) {
			this.templateError = validation.errors.join(' ');
			this.viewProvider?.sendState(this.getState());
			return;
		}
		let previewData: Record<string, any> = {};
		if (previewText.trim()) {
			try {
				const parsed = JSON.parse(previewText) as Record<string, any>;
				previewData = isPlainObject(parsed) ? parsed : {};
			} catch {
				this.templateError = 'preview_data.json invalido.';
				this.viewProvider?.sendState(this.getState());
				return;
			}
		}

		const targetId = manifest.id.trim();
		if (!targetId) {
			this.templateError = 'ID do template invalido.';
			this.viewProvider?.sendState(this.getState());
			return;
		}
		if (previousId && previousId !== targetId && await this.templateExists(targetId)) {
			this.templateError = 'Ja existe um template com esse ID.';
			this.viewProvider?.sendState(this.getState());
			return;
		}

		const current = this.editorTemplate;
		if (current?.readOnly && (!previousId || previousId === current.manifest.id)) {
			this.templateError = 'Template somente leitura. Duplique para editar.';
			this.viewProvider?.sendState(this.getState());
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
				mainTex,
				previewData
			});
			if (current && current.readOnly) {
				await copyAssets(current.assetsDir, saved.assetsDir);
			}
			this.editorTemplate = saved;
			this.editorRevision += 1;
			this.templateError = undefined;
			await this.refreshEditorAssets();
			await this.refreshTemplates();
			await this.scheduleTemplateBuild();
		} catch (err: any) {
			this.templateError = `Falha ao salvar: ${err?.message ?? err}`;
			this.viewProvider?.sendState(this.getState());
		}
	}

	private async addEditorAsset(name: string | undefined, contents: string | undefined) {
		const current = this.editorTemplate;
		if (!current || current.readOnly) {
			return;
		}
		const safePath = normalizeAssetPath(name);
		if (!safePath || typeof contents !== 'string') {
			return;
		}
		const target = path.join(current.assetsDir, ...safePath.split('/'));
		await fs.mkdir(path.dirname(target), { recursive: true });
		const buffer = Buffer.from(contents, 'base64');
		await fs.writeFile(target, buffer);
		await this.refreshEditorAssets();
		this.viewProvider?.sendState(this.getState());
		await this.scheduleTemplateBuild();
	}

	private async deleteEditorAsset(name: string | undefined) {
		const current = this.editorTemplate;
		if (!current || current.readOnly) {
			return;
		}
		const safePath = normalizeAssetPath(name);
		if (!safePath) {
			return;
		}
		const target = path.join(current.assetsDir, ...safePath.split('/'));
		await fs.unlink(target).catch(() => undefined);
		await this.refreshEditorAssets();
		this.viewProvider?.sendState(this.getState());
		await this.scheduleTemplateBuild();
	}

	private async scheduleTemplateBuild() {
		if (!this.editorTemplate) {
			return;
		}
		const refreshed = await loadTemplate(this.templateStorage, this.editorTemplate.manifest.id);
		if (refreshed) {
			this.editorTemplate = refreshed;
		}
		const fastBuild = this.getFastBuildSetting();
		const outDir = path.join(this.paths.templatePreviewDir, this.editorTemplate.manifest.id);
		this.templateBuildOutDir = outDir;
		this.templateBuildService.schedule({
			template: this.editorTemplate,
			previewData: this.editorTemplate.previewData ?? {},
			outDir,
			fast: fastBuild
		});
	}

	private async openTemplatePreview() {
		if (!this.editorTemplate) {
			this.templatePreviewInfo = { state: 'idle', message: 'Selecione um template para ver a preview.' };
			this.viewProvider?.sendState(this.getState());
			return;
		}
		const previewPath = path.join(this.paths.templatePreviewDir, this.editorTemplate.manifest.id, PREVIEW_PDF_NAME);
		const result = await this.resolvePreviewForScope('template', previewPath);
		this.templatePreviewInfo = toPreviewInfo(result, previewPath);
		this.viewProvider?.sendState(this.getState());
	}

	private async refreshEditorAssets() {
		if (!this.editorTemplate) {
			this.editorAssets = [];
			return;
		}
		this.editorAssets = await listAssetEntries(this.editorTemplate.assetsDir);
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

	private async refreshTemplates(): Promise<boolean> {
		await this.ensureSeedTemplates();
		await this.ensureDefaultTemplate();
		const scan = await scanTemplateStorage(this.templateStorage);
		this.templates = scan.templates;
		this.logTemplateScanIssues(scan.issues);
		const current = this.project.templateId;
		if (this.templates.length === 0) {
			this.project.templateId = DEFAULT_TEMPLATE_ID;
		} else if (!this.templates.some(template => template.id === current)) {
			this.project.templateId = this.templates.find(template => template.id === DEFAULT_TEMPLATE_ID)?.id ?? this.templates[0].id;
		}
		const changed = current !== this.project.templateId;
		this.templateCache.clear();
		await this.ensureTemplateReady(this.project.templateId);
		if (this.editorTemplate && !this.templates.some(template => template.id === this.editorTemplate?.manifest.id)) {
			this.editorTemplate = undefined;
			this.editorAssets = [];
		}
		if (!this.editorTemplate && this.templates.length) {
			const fallbackId = this.templates.some(template => template.id === this.project.templateId)
				? this.project.templateId
				: this.templates[0].id;
			await this.selectEditorTemplate(fallbackId, { silent: true, skipBuild: true });
		}
		this.viewProvider?.sendState(this.getState());
		return changed;
	}

	private logTemplateScanIssues(issues: Array<{ id: string; code: string; message: string; path: string }>) {
		if (!issues.length) {
			return;
		}
		for (const issue of issues) {
			this.output.appendLine(`[${new Date().toISOString()}] Template com problema (${issue.id} / ${issue.code}): ${issue.message} [${issue.path}]`);
		}
	}

	private async refreshTasks() {
		this.tasks = await listDiagramadorTasks(this.storage, this.paths);
		if (this.currentTaskId && !this.tasks.some(task => task.id === this.currentTaskId)) {
			this.currentTaskId = undefined;
			this.viewMode = 'list';
			this.project = createDefaultProject();
			this.currentSchema = [];
			this.buildError = undefined;
			this.buildLogPath = undefined;
			this.buildDetails = undefined;
			this.buildOutDir = undefined;
			this.previewInfo = { state: 'idle', message: 'Selecione ou crie uma tarefa.' };
			this.viewProvider?.sendState(this.getState());
		}
		this.viewProvider?.sendState(this.getState());
	}

	private async openTask(taskId: string | undefined) {
		const normalized = normalizeTaskId(taskId);
		if (!normalized) {
			return;
		}
		const project = await loadDiagramadorTask(this.storage, normalized);
		if (!project) {
			return;
		}
		this.project = project;
		this.currentTaskId = normalized;
		this.viewMode = 'task';
		this.buildError = undefined;
		this.buildLogPath = undefined;
		this.buildDetails = undefined;
		this.buildOutDir = this.paths.outDir;
		this.previewInfo = { state: 'waiting_for_build', message: 'Aguardando geracao do PDF.', path: this.paths.previewPdfPath };
		const selectionChanged = await this.refreshTemplates();
		this.viewProvider?.sendState(this.getState());
		if (selectionChanged) {
			await this.saveAndBuild();
			return;
		}
		await this.refreshTasks();
		await this.openDocumentPreview();
		await this.scheduleBuild();
	}

	private async createTask(
		message?: { label?: string; taskType?: string; templateId?: string },
		webview?: DiagramadorMessageTarget
	) {
		const request = await this.resolveCreateTaskRequest(message, webview);
		if (!request) {
			return;
		}
		const taskId = await createUniqueTaskId(this.storage);
		this.project = createDefaultProject();
		this.project.templateId = request.templateId;
		this.project.data = {
			...(this.project.data ?? {}),
			TaskLabel: request.label,
			TaskType: request.taskType
		};
		this.currentTaskId = taskId;
		this.viewMode = 'task';
		this.activeTab = 'document';
		this.openDocumentPreviewOnNextSuccess = true;
		this.buildError = undefined;
		this.buildLogPath = undefined;
		this.buildDetails = undefined;
		this.buildOutDir = this.paths.outDir;
		this.previewInfo = { state: 'waiting_for_build', message: 'Gerando PDF da nova tarefa...', path: this.paths.previewPdfPath };
		const template = await this.ensureTemplateReady(request.templateId);
		this.viewProvider?.sendState(this.getState());
		await this.openDocumentPreview();
		await this.saveAndBuild(template);
	}

	private async resolveCreateTaskRequest(
		message: { label?: string; taskType?: string; templateId?: string } | undefined,
		webview?: DiagramadorMessageTarget
	): Promise<{ label: string; taskType: DiagramadorTaskType; templateId: string } | undefined> {
		await this.ensureSeedTemplates();
		await this.refreshTemplates();
		const normalized = {
			label: typeof message?.label === 'string' ? message.label.trim() : '',
			taskType: normalizeTaskType(message?.taskType) ?? DEFAULT_TASK_TYPE,
			templateId: typeof message?.templateId === 'string' ? message.templateId.trim() : DIAGRAMADOR_DEFAULT_CREATE_TEMPLATE_ID
		};
		const availableTemplates = new Set(this.resolveCreateTaskTemplates().map(option => option.value));
		const errors: {
			label?: string;
			taskType?: string;
			templateId?: string;
			general?: string;
		} = {};
		if (!normalized.label) {
			errors.label = 'Informe um nome para a tarefa.';
		}
		if (!isDiagramadorTaskType(normalized.taskType)) {
			errors.taskType = 'Escolha um tipo valido.';
		}
		if (!availableTemplates.has(normalized.templateId)) {
			errors.templateId = 'Escolha um template disponivel.';
		}
		if (Object.keys(errors).length > 0) {
			if (webview) {
				const response: DiagramadorHostMessage = {
					type: 'createTaskValidation',
					errors
				};
				await webview.postMessage(response);
				return undefined;
			}
			await this.ui.showWarningMessage(errors.general ?? errors.label ?? errors.taskType ?? errors.templateId ?? 'Dados da tarefa invalidos.', undefined);
			return undefined;
		}
		return {
			label: normalized.label,
			taskType: normalized.taskType,
			templateId: normalized.templateId
		};
	}

	private resolveCreateTaskTemplates(): Array<vscode.QuickPickItem & { value: string }> {
		const availableTemplateIds = new Set(this.templates.map(template => template.id));
		return DIAGRAMADOR_TEMPLATE_OPTIONS
			.filter(option => availableTemplateIds.has(option.id))
			.sort((a, b) => {
				if (a.id === DIAGRAMADOR_DEFAULT_CREATE_TEMPLATE_ID) {
					return -1;
				}
				if (b.id === DIAGRAMADOR_DEFAULT_CREATE_TEMPLATE_ID) {
					return 1;
				}
				return a.label.localeCompare(b.label);
			})
			.map(option => ({
				label: option.label,
				value: option.id,
				description: option.description
			}));
	}

	private async backToList(options?: { preserveTasks?: boolean }) {
		const currentTemplateId = this.project.templateId || DEFAULT_TEMPLATE_ID;
		this.currentTaskId = undefined;
		this.viewMode = 'list';
		this.project = createDefaultProject();
		this.project.templateId = currentTemplateId;
		this.currentSchema = [];
		this.status = { state: 'idle' };
		this.buildError = undefined;
		this.buildLogPath = undefined;
		this.buildDetails = undefined;
		this.buildOutDir = undefined;
		this.previewInfo = { state: 'idle', message: 'Selecione ou crie uma tarefa.' };
		if (!options?.preserveTasks) {
			await this.refreshTasks();
		}
		await this.openDocumentPreview();
		this.viewProvider?.sendState(this.getState());
	}

	private getCurrentTaskMeta() {
		const templateId = this.currentTaskId ? this.project.templateId : undefined;
		const taskType = resolveTaskType(this.project);
		return {
			label: this.currentTaskId ? getTaskLabel(this.project, this.currentTaskId) : undefined,
			taskType,
			templateId,
			templateName: templateId ? this.templates.find(template => template.id === templateId)?.name ?? templateId : undefined
		};
	}

	private async renameTask(taskId: string | undefined, label: string | undefined) {
		const normalized = normalizeTaskId(taskId);
		if (!normalized) {
			return;
		}
		const currentLabel = typeof label === 'string' ? label : '';
		const input = await this.ui.showInputBox({
			prompt: 'Nome da tarefa',
			value: currentLabel,
			placeHolder: 'Ex: Tarefa 01'
		});
		if (input === undefined) {
			return;
		}
		const trimmed = input.trim();
		const project = await loadDiagramadorTask(this.storage, normalized);
		if (!project) {
			return;
		}
		const data = isPlainObject(project.data) ? project.data : {};
		const nextData = { ...data };
		if (trimmed) {
			nextData.TaskLabel = trimmed;
		} else {
			delete nextData.TaskLabel;
		}
		project.data = nextData;
		await saveDiagramadorTask(this.storage, normalized, project);
		if (this.currentTaskId === normalized) {
			this.project = project;
			this.viewProvider?.sendState(this.getState());
			await this.scheduleBuild();
		}
		await this.refreshTasks();
	}

	private async deleteTask(taskId: string | undefined) {
		const normalized = normalizeTaskId(taskId);
		if (!normalized) {
			return;
		}
		const taskLabel = this.tasks.find(task => task.id === normalized)?.label ?? normalized;
		const confirmation = await this.ui.showWarningMessage(
			this.currentTaskId === normalized
				? `Excluir a tarefa atual (${taskLabel})?`
				: `Excluir a tarefa "${taskLabel}"?`,
			{ modal: true },
			'Excluir',
			'Cancelar'
		);
		if (confirmation !== 'Excluir') {
			return;
		}
		const target = path.join(this.paths.tasksDir, `${normalized}.json`);
		await fs.rm(target, { force: true });
		if (this.currentTaskId === normalized) {
			await this.backToList({ preserveTasks: true });
		}
		await this.refreshTasks();
	}

	private async migrateLegacyProject() {
		const hasTasks = await hasDiagramadorTasks(this.storage);
		if (hasTasks) {
			return;
		}
		const legacyProject = await readProjectFromStorage(this.storage, PROJECT_FILE_NAME);
		if (!legacyProject) {
			return;
		}
		const taskId = await createUniqueTaskId(this.storage);
		await saveDiagramadorTask(this.storage, taskId, legacyProject);
	}

	private async ensureSeedTemplates() {
		for (const seed of DIAGRAMADOR_MANAGED_TEMPLATES) {
			try {
				await saveTemplate(this.templateStorage, {
					manifest: seed.manifest,
					mainTex: seed.mainTex,
					previewData: seed.previewData
				});
			} catch (err: any) {
				const message = `Falha ao preparar template "${seed.manifest.id}": ${err?.message ?? err}`;
				this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
				throw new Error(message);
			}
		}
	}

	private async ensureDefaultTemplate() {
		const existing = await loadTemplate(this.templateStorage, LEGACY_TEMPLATE_ID);
		if (existing) {
			await this.ensureHeaderImage(existing);
			await this.ensureOptimizedFontBlock(existing);
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
			TaskBody: '',
			Sponsors: '',
			Food: ''
		};
		const manifest: TemplateManifest = {
			id: LEGACY_TEMPLATE_ID,
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
				{ key: 'TaskBody', type: 'latex', label: 'Texto da tarefa' },
				{ key: 'Sponsors', type: 'latex', label: 'Patrocinadores' },
				{ key: 'Food', type: 'latex', label: 'Alimento' }
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
		} catch (err: any) {
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao criar template padrao: ${err?.message ?? err}`);
		}
	}

	private async ensureOptimizedFontBlock(template: TemplatePackage) {
		if (template.readOnly || template.manifest.id !== LEGACY_TEMPLATE_ID) {
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
		const resolved = await resolveTectonicBundlePath({
			configuredPath: configured,
			globalStoragePath: this.context.globalStorageUri.fsPath
		});
		if (resolved) {
			process.env.CO_TECTONIC_BUNDLE = resolved;
			this.bundlePath = resolved;
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

	private async ensureTemplateReady(templateId: string): Promise<TemplatePackage | undefined> {
		const template = await this.getTemplatePackage(templateId);
		this.currentSchema = template?.manifest.schema ?? [];
		if (template) {
			const changed = applySchemaDefaults(this.project, template);
			if (changed) {
				this.viewProvider?.sendState(this.getState());
			}
		}
		return template;
	}

	private async openDocumentPreview() {
		if (!this.currentTaskId) {
			this.previewInfo = { state: 'idle', message: 'Selecione ou crie uma tarefa.' };
			await this.previewManager.showStatus({
				state: 'idle',
				title: 'Diagramador Preview',
				message: 'Selecione ou crie uma tarefa.',
				detail: 'Crie ou abra uma tarefa para gerar o PDF.'
			});
			this.viewProvider?.sendState(this.getState());
			return;
		}
		const result = await this.resolvePreviewForScope('document', this.paths.previewPdfPath);
		this.previewInfo = toPreviewInfo(result, this.paths.previewPdfPath);
		this.viewProvider?.sendState(this.getState());
	}

	private async resolvePreviewForScope(scope: 'document' | 'template', previewPath: string): Promise<PreviewOpenResult> {
		const manager = scope === 'template' ? this.templatePreviewManager : this.previewManager;
		const status = scope === 'template' ? this.templateStatus : this.status;
		const buildError = scope === 'template' ? this.templateBuildError : this.buildError;
		const buildDetails = scope === 'template' ? this.templateBuildDetails : this.buildDetails;
		const title = scope === 'template' ? 'Template Preview' : 'Diagramador Preview';
		if (status.state === 'building') {
			return manager.showStatus({
				state: 'waiting_for_build',
				title,
				message: 'Gerando PDF...',
				detail: previewPath,
				path: previewPath
			});
		}
		if (buildError) {
			return manager.showStatus({
				state: 'build_error',
				title,
				message: buildError,
				detail: [buildDetails?.detail, previewPath].filter(Boolean).join('\n\n'),
				path: previewPath
			});
		}
		return manager.open(previewPath);
	}

	private handleBuildResult(result: TemplateBuildResult) {
		const description = describeTemplateBuildFailure(result);
		this.buildLogPath = result.logPath;
		this.buildOutDir = result.diagnostics?.outDir ?? this.paths.outDir;
		this.buildDetails = {
			failureCode: result.failureCode,
			detail: description.detail,
			technicalDetails: description.technicalDetails
		};
		if (result.ok) {
			const shouldOpenPreview = this.activeTab === 'document' || this.openDocumentPreviewOnNextSuccess;
			this.buildError = undefined;
			this.openDocumentPreviewOnNextSuccess = false;
			this.viewProvider?.sendState(this.getState());
			if (shouldOpenPreview) {
				void this.openDocumentPreview();
			}
			return;
		}
		this.buildError = description.summary;
		this.output.appendLine(`[${new Date().toISOString()}] ${description.summary}`);
		if (description.detail) {
			this.output.appendLine(description.detail);
		}
		if (result.stdout) {
			this.output.appendLine(result.stdout);
		}
		if (result.stderr) {
			this.output.appendLine(result.stderr);
		}
		const shouldOpenPreview = this.activeTab === 'document' || this.openDocumentPreviewOnNextSuccess;
		this.openDocumentPreviewOnNextSuccess = false;
		if (shouldOpenPreview) {
			void this.openDocumentPreview();
		}
		this.viewProvider?.sendState(this.getState());
	}

	private handleStatus(status: DiagramadorStatus) {
		this.status = status;
		if (status.state === 'building') {
			this.buildError = undefined;
			this.buildDetails = undefined;
		}
		this.viewProvider?.sendState(this.getState());
		if (status.state === 'success') {
			return;
		}
		if (status.state === 'building' && (this.activeTab === 'document' || this.openDocumentPreviewOnNextSuccess)) {
			void this.openDocumentPreview();
		}
		if (status.state === 'error') {
			this.openDocumentPreviewOnNextSuccess = false;
			if (this.activeTab === 'document') {
				void this.openDocumentPreview();
			}
		}
	}

	private handleTemplateBuildResult(result: TemplateBuildResult) {
		const description = describeTemplateBuildFailure(result);
		this.templateBuildLogPath = result.logPath;
		this.templateBuildOutDir = result.diagnostics?.outDir ?? this.templateBuildOutDir;
		this.templateBuildDetails = {
			failureCode: result.failureCode,
			detail: description.detail,
			technicalDetails: description.technicalDetails
		};
		if (result.ok) {
			this.templateBuildError = undefined;
			this.viewProvider?.sendState(this.getState());
			if (this.activeTab === 'templates') {
				void this.openTemplatePreview();
			}
			return;
		}
		this.templateBuildError = description.summary;
		this.output.appendLine(`[${new Date().toISOString()}] ${description.summary}`);
		if (description.detail) {
			this.output.appendLine(description.detail);
		}
		if (result.stdout) {
			this.output.appendLine(result.stdout);
		}
		if (result.stderr) {
			this.output.appendLine(result.stderr);
		}
		if (this.activeTab === 'templates') {
			void this.openTemplatePreview();
		}
		this.viewProvider?.sendState(this.getState());
	}

	private handleTemplateStatus(status: DiagramadorStatus) {
		this.templateStatus = status;
		if (status.state === 'building') {
			this.templateBuildError = undefined;
			this.templateBuildDetails = undefined;
		}
		this.viewProvider?.sendState(this.getState());
		if ((status.state === 'building' || status.state === 'error') && this.activeTab === 'templates') {
			void this.openTemplatePreview();
		}
	}

	dispose() {
		this.buildService.dispose();
		this.templateBuildService.dispose();
		this.previewManager.dispose();
		this.templatePreviewManager.dispose();
		this.output.dispose();
	}
}

function toPreviewInfo(result: PreviewOpenResult, previewPath: string): DiagramadorPreviewInfo {
	return {
		state: result.state,
		modeUsed: result.modeUsed,
		reasonCode: result.reasonCode,
		message: result.message,
		details: result.details,
		path: previewPath
	};
}

function resolveDiagramadorPaths(storageBaseDir: string, runtimeBaseDir: string): DiagramadorPaths {
	return {
		storageBaseDir,
		runtimeBaseDir,
		projectPath: path.join(storageBaseDir, PROJECT_FILE_NAME),
		tasksDir: path.join(storageBaseDir, TASKS_DIR_NAME),
		outDir: path.join(runtimeBaseDir, OUT_DIR_NAME),
		templatePreviewDir: path.join(runtimeBaseDir, TEMPLATE_PREVIEW_DIR_NAME),
		previewTexPath: path.join(runtimeBaseDir, OUT_DIR_NAME, PREVIEW_TEX_NAME),
		previewPdfPath: path.join(runtimeBaseDir, OUT_DIR_NAME, PREVIEW_PDF_NAME),
		buildLogPath: path.join(runtimeBaseDir, OUT_DIR_NAME, BUILD_LOG_NAME)
	};
}

async function ensureDiagramadorDirs(storage: LocalStorageProvider, paths: DiagramadorPaths) {
	await storage.ensureDir('');
	await storage.ensureDir(TASKS_DIR_NAME);
	await fs.mkdir(paths.outDir, { recursive: true });
	await fs.mkdir(paths.templatePreviewDir, { recursive: true });
}

async function readProjectFromStorage(storage: LocalStorageProvider, relativePath: string): Promise<DiagramadorProject | null> {
	const raw = await storage.readFile(relativePath);
	if (!raw) {
		return null;
	}
	const parsed = parseProjectPayload(raw);
	if (!parsed.project) {
		return null;
	}
	if (parsed.migrated) {
		await storage.writeFileAtomic(relativePath, serializeProject(parsed.project));
	}
	return parsed.project;
}

async function saveProjectToStorage(storage: LocalStorageProvider, relativePath: string, project: DiagramadorProject) {
	const content = serializeProject(project);
	await storage.writeFileAtomic(relativePath, content);
}

function getTaskRelativePath(taskId: string): string {
	return path.join(TASKS_DIR_NAME, `${taskId}.json`);
}

async function loadDiagramadorTask(storage: LocalStorageProvider, taskId: string): Promise<DiagramadorProject | null> {
	const relativePath = getTaskRelativePath(taskId);
	return readProjectFromStorage(storage, relativePath);
}

async function saveDiagramadorTask(storage: LocalStorageProvider, taskId: string, project: DiagramadorProject) {
	const relativePath = getTaskRelativePath(taskId);
	await saveProjectToStorage(storage, relativePath, project);
}

async function listDiagramadorTasks(storage: LocalStorageProvider, paths: DiagramadorPaths): Promise<DiagramadorTaskSummary[]> {
	try {
		const entries = storage.listFiles ? await storage.listFiles(TASKS_DIR_NAME) : [];
		const tasks: DiagramadorTaskSummary[] = [];
		for (const entry of entries) {
			if (!entry.endsWith('.json')) {
				continue;
			}
			const baseName = entry.slice(0, -'.json'.length);
			const id = normalizeTaskId(baseName);
			if (!id || id !== baseName) {
				continue;
			}
			const fullPath = path.join(paths.tasksDir, entry);
			let updatedAt = 0;
			try {
				const stats = await fs.stat(fullPath);
				updatedAt = stats.mtimeMs;
			} catch {
				updatedAt = 0;
			}
			const project = await readProjectFromStorage(storage, path.join(TASKS_DIR_NAME, entry));
			const label = getTaskLabel(project, id);
			tasks.push({
				id,
				label,
				updatedAt,
				taskType: resolveTaskType(project ?? undefined),
				templateId: project?.templateId
			});
		}
		tasks.sort((a, b) => b.updatedAt - a.updatedAt);
		return tasks;
	} catch {
		return [];
	}
}

async function hasDiagramadorTasks(storage: LocalStorageProvider): Promise<boolean> {
	try {
		const entries = storage.listFiles ? await storage.listFiles(TASKS_DIR_NAME) : [];
		return entries.some(entry => entry.endsWith('.json'));
	} catch {
		return false;
	}
}

async function createUniqueTaskId(storage: LocalStorageProvider): Promise<string> {
	let candidate = createTaskId();
	let attempts = 0;
	while (await storage.fileExists(getTaskRelativePath(candidate))) {
		attempts += 1;
		candidate = createTaskId();
		if (attempts > 6) {
			candidate = `${createTaskId()}_${Math.random().toString(36).slice(2, 6)}`;
			break;
		}
	}
	return candidate;
}

function createTaskId(): string {
	return `tarefa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTaskId(value: string | null | undefined): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim().replace(/\.json$/i, '');
	if (!trimmed) {
		return undefined;
	}
	const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
	return sanitized || undefined;
}

function getTaskLabel(project: DiagramadorProject | null, fallbackId: string): string {
	const data = isPlainObject(project?.data) ? project?.data : {};
	const customLabel = normalizeTaskLabel(pickDataValue(data, ['TaskLabel', 'taskLabel', 'label', 'Label']));
	if (customLabel) {
		return customLabel;
	}
	const taskNumber = normalizeTaskLabel(pickDataValue(data, ['TaskNumber', 'taskNumber']));
	if (taskNumber && taskNumber.toUpperCase() !== 'XX') {
		return `Tarefa ${taskNumber}`;
	}
	const title = normalizeTaskLabel(pickDataValue(data, ['title', 'Title']));
	if (title) {
		return title;
	}
	const model = normalizeTaskLabel(pickDataValue(data, ['model', 'Model']));
	if (model) {
		return model;
	}
	const shortId = fallbackId.slice(-6);
	return shortId ? `Tarefa sem titulo (${shortId})` : 'Tarefa sem titulo';
}

function normalizeTaskLabel(value: string | null | undefined): string {
	if (value === null || value === undefined) {
		return '';
	}
	return String(value).trim();
}

function normalizeTaskType(value: unknown): DiagramadorTaskType | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	switch (value.trim().toLowerCase()) {
		case 'teorica':
			return 'teorica';
		case 'pratica':
			return 'pratica';
		case 'salinha':
			return 'salinha';
		default:
			return undefined;
	}
}

function isDiagramadorTaskType(value: unknown): value is DiagramadorTaskType {
	return normalizeTaskType(value) !== undefined;
}

async function isSnapTectonicCommand(): Promise<boolean> {
	const configured = (process.env.TECTONIC_PATH ?? '').trim();
	if (configured.includes('/snap/')) {
		return true;
	}
	return isExecutableCommandSnap('tectonic');
}

function formatRuntimeReason(reason: CoRuntimeRelocationReason | undefined): string | undefined {
	switch (reason) {
		case 'hidden_path_under_snap':
			return 'Runtime realocado para evitar compilacao em diretorio oculto com o Tectonic Snap.';
		case 'tmp_path_under_snap':
			return 'Runtime realocado para evitar compilacao em diretorio temporario com o Tectonic Snap.';
		default:
			return undefined;
	}
}

function resolveTaskType(project: DiagramadorProject | undefined): DiagramadorTaskType {
	const data = isPlainObject(project?.data) ? project.data : {};
	return normalizeTaskType(pickDataValue(data, ['TaskType', 'taskType', 'type', 'Type'])) ?? DEFAULT_TASK_TYPE;
}

function pickDataValue(data: Record<string, any>, keys: string[]): string | undefined {
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(data, key)) {
			const value = data[key];
			if (value !== null && value !== undefined) {
				return String(value);
			}
		}
	}
	return undefined;
}

function parseProjectPayload(raw: string): { project: DiagramadorProject | null; migrated: boolean } {
	const parsed = parseProject(raw);
	if (parsed) {
		return { project: parsed, migrated: false };
	}
	try {
		const legacy = JSON.parse(raw) as Record<string, any>;
		if (isPlainObject(legacy) && !Object.prototype.hasOwnProperty.call(legacy, 'schemaVersion')) {
			return { project: migrateLegacyProject(legacy), migrated: true };
		}
	} catch {
		// ignore
	}
	return { project: null, migrated: false };
}

function isPlainObject(value: any): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeFieldValue(type: TemplateFieldSchema['type'] | undefined, value: any): string | number | boolean | string[] | undefined {
	switch (type) {
		case 'number': {
			if (typeof value === 'number' && Number.isFinite(value)) {
				return value;
			}
			if (typeof value === 'string' && value.trim()) {
				const parsed = Number(value);
				return Number.isFinite(parsed) ? parsed : undefined;
			}
			return undefined;
		}
		case 'boolean': {
			if (typeof value === 'boolean') {
				return value;
			}
			if (typeof value === 'string') {
				if (value === 'true') {
					return true;
				}
				if (value === 'false') {
					return false;
				}
			}
			return undefined;
		}
		case 'string[]': {
			if (Array.isArray(value)) {
				return value.map(entry => entry === null || entry === undefined ? '' : String(entry));
			}
			if (typeof value === 'string') {
				return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
			}
			return undefined;
		}
		case 'latex':
		case 'string':
		default: {
			if (value === null || value === undefined) {
				return '';
			}
			return typeof value === 'string' ? value : String(value);
		}
	}
}

function applySchemaDefaults(project: DiagramadorProject, template: TemplatePackage): boolean {
	const data = isPlainObject(project.data) ? project.data : {};
	const next: Record<string, any> = { ...data };
	const schema = Array.isArray(template.manifest.schema) ? template.manifest.schema : [];
	const defaults = isPlainObject(template.manifest.defaults) ? template.manifest.defaults : {};
	let changed = false;
	for (const field of schema) {
		if (!Object.prototype.hasOwnProperty.call(next, field.key)) {
			const fallback = Object.prototype.hasOwnProperty.call(defaults, field.key)
				? cloneDefaultValue(defaults[field.key])
				: defaultValueForType(field.type);
			next[field.key] = fallback;
			changed = true;
		}
	}
	if (changed) {
		project.data = next;
	}
	return changed;
}

function cloneDefaultValue(value: any): any {
	if (Array.isArray(value)) {
		return value.slice();
	}
	return value;
}

function defaultValueForType(type: TemplateFieldSchema['type']): any {
	switch (type) {
		case 'string[]':
			return [];
		case 'number':
			return 0;
		case 'boolean':
			return false;
		case 'latex':
		case 'string':
		default:
			return '';
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

async function listAssetEntries(dir: string): Promise<string[]> {
	if (!await fileExists(dir)) {
		return [];
	}
	const entries: string[] = [];
	await collectAssetEntries(dir, dir, entries);
	entries.sort();
	return entries;
}

async function collectAssetEntries(rootDir: string, currentDir: string, entries: string[]) {
	const dirents = await fs.readdir(currentDir, { withFileTypes: true });
	for (const entry of dirents) {
		const sourcePath = path.join(currentDir, entry.name);
		if (entry.isDirectory()) {
			await collectAssetEntries(rootDir, sourcePath, entries);
		} else if (entry.isFile()) {
			const rel = path.relative(rootDir, sourcePath).split(path.sep).join('/');
			entries.push(rel);
		}
	}
}

function normalizeAssetPath(value: any): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const normalized = value.replace(/\\/g, '/').trim();
	if (!normalized || normalized.startsWith('/')) {
		return undefined;
	}
	const parts = normalized.split('/').filter(Boolean);
	if (!parts.length || parts.some(part => part === '.' || part === '..')) {
		return undefined;
	}
	return parts.join('/');
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

async function extractZipToDir(zipPath: string, targetDir: string): Promise<void> {
	const root = path.resolve(targetDir);
	await fs.mkdir(root, { recursive: true });
	return new Promise((resolve, reject) => {
		yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
			if (err || !zipfile) {
				reject(err ?? new Error('Falha ao abrir o zip.'));
				return;
			}
			const onError = (error: Error) => {
				zipfile.close();
				reject(error);
			};
			zipfile.readEntry();
			zipfile.on('entry', entry => {
				const targetPath = resolveZipEntryPath(root, entry.fileName);
				if (!targetPath) {
					zipfile.readEntry();
					return;
				}
				if (entry.fileName.endsWith('/')) {
					fs.mkdir(targetPath, { recursive: true })
						.then(() => zipfile.readEntry())
						.catch(onError);
					return;
				}
				fs.mkdir(path.dirname(targetPath), { recursive: true }).then(() => {
					zipfile.openReadStream(entry, (streamErr, stream) => {
						if (streamErr || !stream) {
							onError(streamErr ?? new Error('Falha ao ler zip.'));
							return;
						}
						const output = fsSync.createWriteStream(targetPath);
						output.on('close', () => zipfile.readEntry());
						output.on('error', onError);
						stream.on('error', onError);
						stream.pipe(output);
					});
				}).catch(onError);
			});
			zipfile.on('end', () => {
				zipfile.close();
				resolve();
			});
			zipfile.on('error', onError);
		});
	});
}

function resolveZipEntryPath(root: string, entryName: string): string | undefined {
	const normalized = entryName.replace(/\\/g, '/');
	if (!normalized || path.isAbsolute(normalized)) {
		return undefined;
	}
	const parts = normalized.split('/');
	if (parts.some(part => part === '..')) {
		return undefined;
	}
	const targetPath = path.resolve(root, normalized);
	if (targetPath === root) {
		return targetPath;
	}
	if (!targetPath.startsWith(`${root}${path.sep}`)) {
		return undefined;
	}
	return targetPath;
}

async function findTemplateRoot(root: string): Promise<string | undefined> {
	try {
		const entries = await fs.readdir(root, { withFileTypes: true });
		const hasManifest = entries.some(entry => entry.isFile() && entry.name === 'template.json');
		const hasMain = entries.some(entry => entry.isFile() && entry.name === 'main.tex');
		if (hasManifest && hasMain) {
			return root;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const found = await findTemplateRoot(path.join(root, entry.name));
			if (found) {
				return found;
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

export function deactivate() { }
