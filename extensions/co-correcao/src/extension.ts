/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import {
	TemplateBuildResult,
	TemplateBuildService,
	TemplateBuildStatus,
	TemplatePackage,
	TemplateStoragePaths,
	loadTemplate,
	resolveTemplateStoragePaths,
	resolveTectonicBundlePath
} from 'co-template-core';
import { LocalStorageProvider } from 'co-storage-core';
import { migrateLegacyProject, parseProject } from 'co-doc-core';
import { PdfPreviewManager } from 'co-preview-core';
import {
	CorrecaoFieldSummary,
	CorrecaoRevisionSummary,
	CorrecaoState,
	CorrecaoStatus,
	CorrecaoTaskSummary,
	registerCorrecaoView
} from './webview';

const TASKS_DIR_NAME = 'tarefas';
const CORRECTIONS_DIR_NAME = 'corrections';
const BASE_FILE_NAME = 'base.json';
const INDEX_FILE_NAME = 'index.json';
const PREVIEW_DIR_NAME = 'preview';
const PREVIEW_PDF_NAME = 'preview.pdf';
const CO_DIAGRAMADOR_EXTENSION_ID = 'odebrino.co-diagramador';

const FIELD_PREFERENCES = ['TaskBody', 'taskBody', 'text', 'Text', 'body', 'Body', 'descricao', 'Descricao', 'conteudo', 'Conteudo'];

const DEFAULT_STATUS: CorrecaoStatus = { state: 'idle' };

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const controller = new CorrecaoController(context);
	await controller.initialize();
	const viewProvider = registerCorrecaoView(
		context,
		(message) => controller.handleMessage(message),
		() => controller.getState()
	);
	controller.setViewProvider(viewProvider);
	context.subscriptions.push(controller);

	context.subscriptions.push(
		vscode.commands.registerCommand('coCorrecao.openTaskPdf', async () => {
			await controller.open();
		}),
		vscode.commands.registerCommand('coCorrecao.newRevision', async () => {
			await controller.createRevision();
		}),
		vscode.commands.registerCommand('coCorrecao.selectRevision', async () => {
			await controller.selectRevisionFromCommand();
		}),
		vscode.commands.registerCommand('coCorrecao.acceptSuggestion', async () => {
			await controller.updateSuggestionFromCommand('accepted');
		}),
		vscode.commands.registerCommand('coCorrecao.rejectSuggestion', async () => {
			await controller.updateSuggestionFromCommand('rejected');
		})
	);
}

export function deactivate(): void {
	// no-op
}

type FieldType = 'string' | 'string[]';

type TaskProject = {
	templateId?: string;
	data?: Record<string, any>;
};

type CorrectionOp = {
	op: 'replace' | 'insert' | 'comment';
	start?: number;
	end?: number;
	at?: number;
	text: string;
	status?: 'pending' | 'accepted' | 'rejected';
};

type CorrectionBaseFile = {
	baseHash: string;
	createdAt: string;
	taskId: string;
	templateId: string;
	fieldKey: string;
	fieldType: FieldType;
	text: string;
};

type CorrectionIndexFile = {
	baseHash: string;
	revisions: Array<{ id: string; createdAt: string; parent: string | 'base' }>;
};

type CorrectionRevisionFile = {
	id: string;
	parent: string | 'base';
	baseHash: string;
	createdAt: string;
	ops: CorrectionOp[];
};

class CorrecaoController implements vscode.Disposable {
	private viewProvider?: { sendState: (state: CorrecaoState) => void; show: (preserveFocus?: boolean) => void };
	private tasks: CorrecaoTaskSummary[] = [];
	private fields: CorrecaoFieldSummary[] = [];
	private selectedTaskId?: string;
	private selectedFieldKey?: string;
	private selectedFieldType: FieldType = 'string';
	private selectedRevisionId: string = 'base';
	private baseText = '';
	private baseHash = '';
	private revisions = new Map<string, CorrectionRevisionFile>();
	private revisionIndex: CorrectionIndexFile | null = null;
	private status: CorrecaoStatus = DEFAULT_STATUS;
	private buildError?: string;
	private buildLogPath?: string;
	private currentProject?: TaskProject;
	private templateStorage: TemplateStoragePaths;
	private templateCache = new Map<string, TemplatePackage>();
	private readonly output: vscode.OutputChannel;
	private readonly previewManager: PdfPreviewManager;
	private readonly buildService: TemplateBuildService;
	private readonly correctionsStorage: LocalStorageProvider;
	private readonly diagramadorBaseDir: string;
	private readonly correctionsBaseDir: string;
	private bundlePath?: string;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.output = vscode.window.createOutputChannel('CO Correcao');
		this.previewManager = new PdfPreviewManager(this.output, {
			extensionRoot: context.extensionPath,
			appName: vscode.env.appName,
			title: 'Correcao Preview',
			viewType: 'co.correcao.preview'
		});
		this.buildService = new TemplateBuildService({
			debounceMs: 700,
			onStatus: status => this.handleBuildStatus(status),
			onComplete: result => this.handleBuildResult(result)
		});
		this.diagramadorBaseDir = resolveDiagramadorBaseDir(context);
		this.correctionsBaseDir = resolveCorrectionsBaseDir(context);
		this.correctionsStorage = new LocalStorageProvider(this.correctionsBaseDir);
		const repoRoot = path.resolve(context.extensionPath, '..', '..');
		this.templateStorage = resolveTemplateStoragePaths(context.globalStorageUri.fsPath, repoRoot);
	}

	async initialize(): Promise<void> {
		await this.refreshTasks();
		if (this.tasks.length) {
			await this.selectTask(this.tasks[0].id, { silent: true });
		}
	}

	setViewProvider(provider: { sendState: (state: CorrecaoState) => void; show: (preserveFocus?: boolean) => void }) {
		this.viewProvider = provider;
		this.viewProvider.sendState(this.getState());
	}

	async open(): Promise<void> {
		await this.refreshTasks();
		this.viewProvider?.show(true);
		this.viewProvider?.sendState(this.getState());
	}

	getState(): CorrecaoState {
		const revisions: CorrecaoRevisionSummary[] = [];
		revisions.push({ id: 'base', label: 'Base', isBase: true });
		if (this.revisionIndex?.revisions?.length) {
			for (const revision of this.revisionIndex.revisions) {
				revisions.push({
					id: revision.id,
					label: `Revisao ${revision.id.replace(/^rev-/, '')}`,
					createdAt: revision.createdAt,
					parent: revision.parent
				});
			}
		}
		const selectedRevisionId = this.selectedRevisionId || 'base';
		const selectedRevision = selectedRevisionId === 'base' ? undefined : this.revisions.get(selectedRevisionId);
		const ops = selectedRevision?.ops ?? [];
		const text = selectedRevisionId === 'base'
			? this.baseText
			: applyRevisionChain(this.baseText, selectedRevisionId, this.revisions);

		return {
			tasks: this.tasks,
			selectedTaskId: this.selectedTaskId,
			fields: this.fields,
			selectedFieldKey: this.selectedFieldKey,
			revisions,
			selectedRevisionId,
			ops: ops.map(op => ({ ...op })),
			text,
			status: this.status,
			buildError: this.buildError,
			buildLogPath: this.buildLogPath
		};
	}

	async handleMessage(message: any): Promise<void> {
		switch (message?.type) {
			case 'ready':
				this.viewProvider?.sendState(this.getState());
				return;
			case 'selectTask':
				await this.selectTask(message?.taskId);
				return;
			case 'refreshTasks':
				await this.refreshTasks();
				this.viewProvider?.sendState(this.getState());
				return;
			case 'selectField':
				await this.selectField(message?.key);
				return;
			case 'selectRevision':
				await this.selectRevision(message?.revisionId);
				return;
			case 'newRevision':
				await this.createRevision();
				return;
			case 'addSuggestion':
				await this.addSuggestion(message);
				return;
			case 'acceptSuggestion':
				await this.updateSuggestionStatus(message?.revisionId, message?.index, 'accepted');
				return;
			case 'rejectSuggestion':
				await this.updateSuggestionStatus(message?.revisionId, message?.index, 'rejected');
				return;
			case 'openBuildLog':
				await this.openBuildLog();
				return;
			default:
				return;
		}
	}

	async createRevision(): Promise<void> {
		if (!this.selectedTaskId || !this.baseHash) {
			return;
		}
		const parent = this.selectedRevisionId || 'base';
		const revision = await this.createRevisionFile(parent);
		this.revisions.set(revision.id, revision);
		this.revisionIndex = this.revisionIndex ?? { baseHash: this.baseHash, revisions: [] };
		this.revisionIndex.revisions.push({ id: revision.id, createdAt: revision.createdAt, parent });
		await this.saveRevisionIndex();
		this.selectedRevisionId = revision.id;
		this.viewProvider?.sendState(this.getState());
		await this.scheduleBuild();
	}

	async selectRevisionFromCommand(): Promise<void> {
		const revisions = this.getState().revisions;
		if (!revisions.length) {
			return;
		}
		const pick = await vscode.window.showQuickPick(revisions.map(entry => ({ label: entry.label, id: entry.id })), {
			placeHolder: 'Selecione a revisao'
		});
		if (!pick) {
			return;
		}
		await this.selectRevision(pick.id);
	}

	async updateSuggestionFromCommand(status: 'accepted' | 'rejected'): Promise<void> {
		const revisionId = this.selectedRevisionId;
		if (!revisionId || revisionId === 'base') {
			return;
		}
		const revision = this.revisions.get(revisionId);
		if (!revision || !revision.ops.length) {
			return;
		}
		const pick = await vscode.window.showQuickPick(
			revision.ops.map((op, index) => ({
				label: `${index + 1}: ${op.op} (${op.status ?? 'pending'})`,
				detail: op.text,
				index
			})),
			{ placeHolder: 'Selecione a sugestao' }
		);
		if (!pick) {
			return;
		}
		await this.updateSuggestionStatus(revisionId, pick.index, status);
	}

	async selectRevision(revisionId: string): Promise<void> {
		if (!revisionId) {
			return;
		}
		this.selectedRevisionId = revisionId;
		this.viewProvider?.sendState(this.getState());
		await this.scheduleBuild();
	}

	async selectField(key: string): Promise<void> {
		if (!key || !this.currentProject) {
			return;
		}
		this.selectedFieldKey = key;
		const field = this.fields.find(entry => entry.key === key);
		this.selectedFieldType = field?.type ?? 'string';
		await this.loadCorrectionsForField();
		this.viewProvider?.sendState(this.getState());
		await this.scheduleBuild();
	}

	async refreshTasks(): Promise<void> {
		this.tasks = await listDiagramadorTasks(this.diagramadorBaseDir);
	}

	async selectTask(taskId: string, options?: { silent?: boolean }): Promise<void> {
		if (!taskId || this.selectedTaskId === taskId) {
			if (!options?.silent) {
				this.viewProvider?.sendState(this.getState());
			}
			return;
		}
		const project = await readTaskProject(this.diagramadorBaseDir, taskId);
		if (!project) {
			return;
		}
		this.selectedTaskId = taskId;
		this.currentProject = project;
		this.fields = extractTextFields(project.data ?? {});
		this.selectedFieldKey = pickDefaultFieldKey(this.fields, this.selectedFieldKey);
		const field = this.fields.find(entry => entry.key === this.selectedFieldKey);
		this.selectedFieldType = field?.type ?? 'string';
		await this.loadCorrectionsForField();
		if (!options?.silent) {
			this.viewProvider?.sendState(this.getState());
		}
		await this.scheduleBuild();
	}

	async addSuggestion(message: any): Promise<void> {
		if (!this.selectedTaskId || !this.selectedFieldKey) {
			return;
		}
		const opType = message?.opType;
		const text = typeof message?.text === 'string' ? message.text : '';
		if (!text.trim()) {
			return;
		}
		const start = Number.isFinite(message?.start) ? Number(message.start) : undefined;
		const end = Number.isFinite(message?.end) ? Number(message.end) : undefined;
		const at = Number.isFinite(message?.at) ? Number(message.at) : undefined;
		const op = buildOp(opType, { start, end, at, text });
		if (!op) {
			return;
		}
		let revisionId = this.selectedRevisionId;
		if (!revisionId || revisionId === 'base') {
			const revision = await this.createRevisionFile('base');
			this.revisions.set(revision.id, revision);
			this.revisionIndex = this.revisionIndex ?? { baseHash: this.baseHash, revisions: [] };
			this.revisionIndex.revisions.push({ id: revision.id, createdAt: revision.createdAt, parent: 'base' });
			await this.saveRevisionIndex();
			revisionId = revision.id;
			this.selectedRevisionId = revision.id;
		}
		const revision = this.revisions.get(revisionId);
		if (!revision) {
			return;
		}
		revision.ops.push(op);
		await this.saveRevisionFile(revision);
		this.viewProvider?.sendState(this.getState());
		await this.scheduleBuild();
	}

	async updateSuggestionStatus(revisionId: string, index: number, status: 'accepted' | 'rejected'): Promise<void> {
		if (!revisionId || revisionId === 'base') {
			return;
		}
		const revision = this.revisions.get(revisionId);
		if (!revision) {
			return;
		}
		if (!Number.isFinite(index)) {
			return;
		}
		const target = revision.ops[index];
		if (!target) {
			return;
		}
		target.status = status;
		await this.saveRevisionFile(revision);
		this.viewProvider?.sendState(this.getState());
		await this.scheduleBuild();
	}

	private async loadCorrectionsForField(): Promise<void> {
		if (!this.selectedTaskId || !this.selectedFieldKey || !this.currentProject) {
			return;
		}
		this.baseText = extractFieldText(this.currentProject.data ?? {}, this.selectedFieldKey, this.selectedFieldType);
		this.baseHash = hashText(this.baseText);
		await this.ensureBaseFile();
		await this.loadRevisionIndex();
		await this.loadRevisions();
		if (this.selectedRevisionId !== 'base' && !this.revisions.has(this.selectedRevisionId)) {
			this.selectedRevisionId = 'base';
		}
	}

	private async ensureBaseFile(): Promise<void> {
		if (!this.selectedTaskId || !this.currentProject || !this.selectedFieldKey) {
			return;
		}
		await this.correctionsStorage.ensureDir(this.selectedTaskId);
		const basePath = path.join(this.selectedTaskId, BASE_FILE_NAME);
		const raw = await this.correctionsStorage.readFile(basePath);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as CorrectionBaseFile;
				if (parsed.baseHash === this.baseHash && parsed.fieldKey === this.selectedFieldKey) {
					return;
				}
			} catch {
				// ignore
			}
		}
		const templateId = this.currentProject.templateId ?? '';
		const baseFile: CorrectionBaseFile = {
			baseHash: this.baseHash,
			createdAt: new Date().toISOString(),
			taskId: this.selectedTaskId,
			templateId,
			fieldKey: this.selectedFieldKey,
			fieldType: this.selectedFieldType,
			text: this.baseText
		};
		await this.correctionsStorage.writeFileAtomic(basePath, JSON.stringify(baseFile, null, 2));
		this.revisionIndex = { baseHash: this.baseHash, revisions: [] };
		await this.saveRevisionIndex();
	}

	private async loadRevisionIndex(): Promise<void> {
		if (!this.selectedTaskId) {
			return;
		}
		const indexPath = path.join(this.selectedTaskId, INDEX_FILE_NAME);
		const raw = await this.correctionsStorage.readFile(indexPath);
		if (!raw) {
			this.revisionIndex = { baseHash: this.baseHash, revisions: [] };
			return;
		}
		try {
			const parsed = JSON.parse(raw) as CorrectionIndexFile;
			if (parsed?.baseHash === this.baseHash && Array.isArray(parsed.revisions)) {
				this.revisionIndex = parsed;
				return;
			}
		} catch {
			// ignore
		}
		this.revisionIndex = { baseHash: this.baseHash, revisions: [] };
	}

	private async loadRevisions(): Promise<void> {
		this.revisions.clear();
		if (!this.selectedTaskId || !this.revisionIndex) {
			return;
		}
		for (const entry of this.revisionIndex.revisions) {
			const revision = await this.readRevisionFile(entry.id);
			if (revision && revision.baseHash === this.baseHash) {
				this.revisions.set(revision.id, revision);
			}
		}
	}

	private async createRevisionFile(parent: string | 'base'): Promise<CorrectionRevisionFile> {
		if (!this.selectedTaskId) {
			throw new Error('Nenhuma tarefa selecionada.');
		}
		const revisionId = createRevisionId(this.revisionIndex?.revisions ?? []);
		const revision: CorrectionRevisionFile = {
			id: revisionId,
			parent,
			baseHash: this.baseHash,
			createdAt: new Date().toISOString(),
			ops: []
		};
		await this.saveRevisionFile(revision);
		return revision;
	}

	private async readRevisionFile(revisionId: string): Promise<CorrectionRevisionFile | null> {
		if (!this.selectedTaskId || !revisionId) {
			return null;
		}
		const pathRel = path.join(this.selectedTaskId, `${revisionId}.json`);
		const raw = await this.correctionsStorage.readFile(pathRel);
		if (!raw) {
			return null;
		}
		try {
			const parsed = JSON.parse(raw) as CorrectionRevisionFile;
			if (!parsed || typeof parsed.id !== 'string') {
				return null;
			}
			parsed.ops = Array.isArray(parsed.ops) ? parsed.ops : [];
			return parsed;
		} catch {
			return null;
		}
	}

	private async saveRevisionFile(revision: CorrectionRevisionFile): Promise<void> {
		if (!this.selectedTaskId) {
			return;
		}
		const pathRel = path.join(this.selectedTaskId, `${revision.id}.json`);
		await this.correctionsStorage.writeFileAtomic(pathRel, JSON.stringify(revision, null, 2));
	}

	private async saveRevisionIndex(): Promise<void> {
		if (!this.selectedTaskId || !this.revisionIndex) {
			return;
		}
		const pathRel = path.join(this.selectedTaskId, INDEX_FILE_NAME);
		await this.correctionsStorage.writeFileAtomic(pathRel, JSON.stringify(this.revisionIndex, null, 2));
	}

	private async scheduleBuild(): Promise<void> {
		if (!this.selectedTaskId || !this.currentProject || !this.selectedFieldKey) {
			return;
		}
		await this.resolveBundlePath();
		const templateId = this.currentProject.templateId ?? '';
		const template = await this.ensureTemplateReady(templateId);
		if (!template) {
			this.buildError = 'Template nao encontrado.';
			this.viewProvider?.sendState(this.getState());
			return;
		}
		const currentText = this.selectedRevisionId === 'base'
			? this.baseText
			: applyRevisionChain(this.baseText, this.selectedRevisionId, this.revisions);
		const nextValue = this.selectedFieldType === 'string[]'
			? currentText.split(/\r?\n/)
			: currentText;
		const previewData = {
			...(this.currentProject.data ?? {}),
			[this.selectedFieldKey]: nextValue
		};
		const outDir = path.join(this.correctionsBaseDir, this.selectedTaskId, PREVIEW_DIR_NAME);
		await fs.mkdir(outDir, { recursive: true });
		this.buildService.schedule({
			template,
			previewData,
			outDir,
			fast: true
		});
	}

	private handleBuildStatus(status: TemplateBuildStatus) {
		this.status = status;
		if (status.state === 'building') {
			this.buildError = undefined;
		}
		this.viewProvider?.sendState(this.getState());
	}

	private handleBuildResult(result: TemplateBuildResult) {
		this.buildLogPath = result.logPath;
		if (result.ok) {
			this.buildError = undefined;
			this.viewProvider?.sendState(this.getState());
			void this.previewManager.open(path.join(path.dirname(result.pdfPath), PREVIEW_PDF_NAME));
			return;
		}
		this.buildError = result.friendly || 'Falha ao gerar o PDF.';
		this.output.appendLine(`[${new Date().toISOString()}] ${result.friendly}`);
		if (result.stdout) {
			this.output.appendLine(result.stdout);
		}
		if (result.stderr) {
			this.output.appendLine(result.stderr);
		}
		this.viewProvider?.sendState(this.getState());
	}

	private async openBuildLog(): Promise<void> {
		if (!this.buildLogPath || !await fileExists(this.buildLogPath)) {
			await vscode.window.showWarningMessage('Log nao encontrado.');
			return;
		}
		const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(this.buildLogPath));
		await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
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

	private async ensureTemplateReady(templateId: string): Promise<TemplatePackage | undefined> {
		const normalized = templateId?.trim();
		if (!normalized) {
			return undefined;
		}
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

	dispose(): void {
		this.buildService.dispose();
		this.previewManager.dispose();
		this.output.dispose();
	}
}

function resolveDiagramadorBaseDir(context: vscode.ExtensionContext): string {
	const override = (process.env.CO_SAVE_DIR ?? '').trim();
	if (override) {
		return override;
	}
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (workspaceFolder) {
		return path.join(workspaceFolder.uri.fsPath, '.co', 'diagramador');
	}
	const globalRoot = path.dirname(context.globalStorageUri.fsPath);
	return path.join(globalRoot, CO_DIAGRAMADOR_EXTENSION_ID, 'diagramador');
}

function resolveCorrectionsBaseDir(context: vscode.ExtensionContext): string {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (workspaceFolder) {
		return path.join(workspaceFolder.uri.fsPath, '.co', CORRECTIONS_DIR_NAME);
	}
	return path.join(context.globalStorageUri.fsPath, CORRECTIONS_DIR_NAME);
}

async function listDiagramadorTasks(baseDir: string): Promise<CorrecaoTaskSummary[]> {
	try {
		const tasksDir = path.join(baseDir, TASKS_DIR_NAME);
		const entries = await fs.readdir(tasksDir, { withFileTypes: true });
		const tasks: CorrecaoTaskSummary[] = [];
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith('.json')) {
				continue;
			}
			const id = entry.name.replace(/\.json$/i, '');
			const project = await readTaskProject(baseDir, id);
			const label = getTaskLabel(project, id);
			tasks.push({ id, label });
		}
		tasks.sort((a, b) => a.label.localeCompare(b.label));
		return tasks;
	} catch {
		return [];
	}
}

async function readTaskProject(baseDir: string, taskId: string): Promise<TaskProject | null> {
	const taskPath = path.join(baseDir, TASKS_DIR_NAME, `${taskId}.json`);
	try {
		const raw = await fs.readFile(taskPath, 'utf8');
		const parsed = parseProject(raw);
		if (parsed) {
			return parsed;
		}
		const legacy = JSON.parse(raw) as Record<string, any>;
		if (isPlainObject(legacy) && !Object.prototype.hasOwnProperty.call(legacy, 'schemaVersion')) {
			return migrateLegacyProject(legacy);
		}
	} catch {
		return null;
	}
	return null;
}

function extractTextFields(data: Record<string, any>): CorrecaoFieldSummary[] {
	const fields: CorrecaoFieldSummary[] = [];
	for (const [key, value] of Object.entries(data)) {
		if (typeof value === 'string') {
			fields.push({ key, label: key, type: 'string' });
			continue;
		}
		if (Array.isArray(value) && value.every(entry => typeof entry === 'string')) {
			fields.push({ key, label: key, type: 'string[]' });
		}
	}
	fields.sort((a, b) => a.key.localeCompare(b.key));
	return fields;
}

function pickDefaultFieldKey(fields: CorrecaoFieldSummary[], current?: string): string | undefined {
	if (current && fields.some(field => field.key === current)) {
		return current;
	}
	for (const preferred of FIELD_PREFERENCES) {
		if (fields.some(field => field.key === preferred)) {
			return preferred;
		}
	}
	return fields[0]?.key;
}

function extractFieldText(data: Record<string, any>, key: string, type: FieldType): string {
	const value = data[key];
	if (type === 'string[]') {
		if (Array.isArray(value)) {
			return value.map(entry => entry === null || entry === undefined ? '' : String(entry)).join('\n');
		}
		return '';
	}
	if (value === null || value === undefined) {
		return '';
	}
	return typeof value === 'string' ? value : String(value);
}

function getTaskLabel(project: TaskProject | null, fallbackId: string): string {
	const data = isPlainObject(project?.data) ? project?.data : {};
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
	return fallbackId;
}

function normalizeTaskLabel(value: string | null | undefined): string {
	if (value === null || value === undefined) {
		return '';
	}
	return String(value).trim();
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

function buildOp(opType: string, payload: { start?: number; end?: number; at?: number; text: string }): CorrectionOp | null {
	if (opType !== 'replace' && opType !== 'insert' && opType !== 'comment') {
		return null;
	}
	const op: CorrectionOp = {
		op: opType,
		text: payload.text,
		status: 'pending'
	};
	if (opType === 'insert') {
		op.at = typeof payload.at === 'number' ? payload.at : 0;
		return op;
	}
	if (typeof payload.start !== 'number' || typeof payload.end !== 'number') {
		return null;
	}
	op.start = payload.start;
	op.end = payload.end;
	return op;
}

function applyRevisionChain(baseText: string, revisionId: string, revisions: Map<string, CorrectionRevisionFile>, visited = new Set<string>()): string {
	if (!revisionId || revisionId === 'base') {
		return baseText;
	}
	if (visited.has(revisionId)) {
		return baseText;
	}
	const revision = revisions.get(revisionId);
	if (!revision) {
		return baseText;
	}
	visited.add(revisionId);
	const parentText = revision.parent && revision.parent !== 'base'
		? applyRevisionChain(baseText, revision.parent, revisions, visited)
		: baseText;
	visited.delete(revisionId);
	return applyPatch(parentText, revision.ops);
}

function applyPatch(baseText: string, ops: CorrectionOp[]): string {
	const filtered = ops.filter(op => op.op !== 'comment' && op.status !== 'rejected');
	const sorted = filtered.slice().sort((a, b) => opPosition(a) - opPosition(b));
	let result = baseText;
	let shift = 0;
	for (const op of sorted) {
		if (op.op === 'insert') {
			const at = clampNumber(op.at ?? 0, 0, baseText.length) + shift;
			result = result.slice(0, at) + op.text + result.slice(at);
			shift += op.text.length;
			continue;
		}
		const start = clampNumber(op.start ?? 0, 0, baseText.length);
		const end = clampNumber(op.end ?? start, 0, baseText.length);
		const from = Math.min(start, end) + shift;
		const to = Math.max(start, end) + shift;
		result = result.slice(0, from) + op.text + result.slice(to);
		shift += op.text.length - (to - from);
	}
	return result;
}

function opPosition(op: CorrectionOp): number {
	if (op.op === 'insert') {
		return typeof op.at === 'number' ? op.at : 0;
	}
	return typeof op.start === 'number' ? op.start : 0;
}

function clampNumber(value: number, min: number, max: number): number {
	if (value < min) {
		return min;
	}
	if (value > max) {
		return max;
	}
	return value;
}

function createRevisionId(existing: Array<{ id: string }>): string {
	const used = new Set(existing.map(entry => entry.id));
	let index = used.size + 1;
	while (index < 10000) {
		const id = `rev-${String(index).padStart(4, '0')}`;
		if (!used.has(id)) {
			return id;
		}
		index += 1;
	}
	return `rev-${Date.now()}`;
}

function hashText(value: string): string {
	return crypto.createHash('sha256').update(value).digest('hex');
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

function isPlainObject(value: any): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
