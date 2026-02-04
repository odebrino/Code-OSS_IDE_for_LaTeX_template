/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { ChildProcess, spawn } from 'child_process';
import {
	createBlock,
	createDefaultProject,
	DiagramadorBlock,
	DiagramadorBlockType,
	DiagramadorProject,
	parseProject,
	renderLatex,
	serializeProject
} from './diagramador';
import { DiagramadorStatus, DiagramadorViewProvider, openHomePanel, registerAdminView, registerDiagramadorView } from './webview';

type Role = 'student' | 'admin';

type GeneratePayload = {
	nome?: string;
	turma?: string;
	titulo?: string;
	disciplina?: string;
	professor?: string;
	data?: string;
	observacoes?: string;
};

const ROLE_KEY = 'co.role';

let currentRole: Role = 'student';
let lastLogPath: string | undefined;
let diagramadorController: DiagramadorController | undefined;

export async function activate(context: vscode.ExtensionContext) {
	currentRole = await resolveRole(context);
	await setRole(context, currentRole);

	const messageHandler = createMessageHandler(context);
	registerAdminView(context, messageHandler);

	diagramadorController = new DiagramadorController();
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
		vscode.commands.registerCommand('coShell.openStudentHome', async () => {
			await setRole(context, 'student');
			await enterStudentMode(context, diagramadorController);
		}),
		vscode.commands.registerCommand('coShell.openAdminHome', async () => {
			await setRole(context, 'admin');
			await enterAdminMode(context);
		}),
		vscode.commands.registerCommand('coShell.enterAdminMode', async () => {
			const email = await vscode.window.showInputBox({
				prompt: 'Admin email',
				placeHolder: 'admin@escola.com'
			});
			if (!email) {
				return;
			}
			const ok = await isAdminEmail(context, email);
			if (!ok) {
				vscode.window.showErrorMessage('Email nao esta na whitelist de admins.');
				return;
			}
			await setRole(context, 'admin');
			await enterAdminMode(context);
		}),
		vscode.commands.registerCommand('co.diagramador.open', async () => {
			await diagramadorController?.open();
		})
	);

	if (currentRole === 'admin') {
		await enterAdminMode(context);
	} else {
		await enterStudentMode(context, diagramadorController);
	}
}

async function resolveRole(context: vscode.ExtensionContext): Promise<Role> {
	const stored = context.globalState.get<Role>(ROLE_KEY);
	if (stored) {
		return stored;
	}

	const configuredEmail = vscode.workspace.getConfiguration('coShell').get<string>('userEmail');
	if (configuredEmail && await isAdminEmail(context, configuredEmail)) {
		return 'admin';
	}

	return 'student';
}

async function setRole(context: vscode.ExtensionContext, role: Role) {
	currentRole = role;
	await context.globalState.update(ROLE_KEY, role);
	await vscode.commands.executeCommand('setContext', 'co.role', role);
}

async function enterStudentMode(context: vscode.ExtensionContext, diagramador?: DiagramadorController) {
	await hideUiForStudent(context);
	if (diagramador) {
		await diagramador.open();
	} else {
		openHomePanel(context, 'student', createMessageHandler(context));
	}
}

async function enterAdminMode(context: vscode.ExtensionContext) {
	await showUiForAdmin();
	openHomePanel(context, 'admin', createMessageHandler(context));
}

async function hideUiForStudent(context: vscode.ExtensionContext) {
	const isDev = context.extensionMode === vscode.ExtensionMode.Development || process.env.VSCODE_DEV === '1';
	const closeWorkspace = vscode.workspace.getConfiguration('coShell').get<boolean>('closeWorkspace', true);
	const commands = [
		'workbench.action.closeAllEditors',
		'workbench.action.closeSidebar',
		'workbench.action.closePanel',
		'workbench.action.closeAuxiliaryBar'
	];
	if (!isDev && closeWorkspace) {
		commands.push('workbench.action.closeFolder');
	}

	for (const command of commands) {
		try {
			await vscode.commands.executeCommand(command);
		} catch {
			// best effort
		}
	}

	const workbenchConfig = vscode.workspace.getConfiguration('workbench');
	const statusVisible = workbenchConfig.get<boolean>('statusBar.visible');
	if (statusVisible) {
		try {
			await vscode.commands.executeCommand('workbench.action.toggleStatusbarVisibility');
		} catch {
			// best effort
		}
	}
}

async function showUiForAdmin() {
	try {
		await vscode.commands.executeCommand('workbench.action.openSidebar');
	} catch {
		// best effort
	}
}

function createMessageHandler(context: vscode.ExtensionContext) {
	return async (message: any, webview: vscode.Webview) => {
		switch (message.type) {
			case 'generatePdf': {
				const result = await generatePdf(context, message.payload ?? {}, webview);
				if (result.ok) {
					webview.postMessage({ type: 'pdfReady', pdfUri: result.pdfUri });
				} else {
					webview.postMessage({
						type: 'error',
						friendly: result.friendly,
						detail: result.detail,
						role: currentRole
					});
				}
				break;
			}
			case 'openLog': {
				if (!lastLogPath) {
					return;
				}
				const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(lastLogPath));
				await vscode.window.showTextDocument(doc, { preview: false });
				break;
			}
			case 'openTemplate': {
				await vscode.commands.executeCommand('vscode.openFolder', context.globalStorageUri, true);
				break;
			}
		}
	};
}

async function isAdminEmail(context: vscode.ExtensionContext, email: string): Promise<boolean> {
	const admins = await loadAdmins(context);
	return admins.has(email.trim().toLowerCase());
}

async function loadAdmins(context: vscode.ExtensionContext): Promise<Set<string>> {
	const config = vscode.workspace.getConfiguration('coShell');
	const configuredPath = config.get<string>('adminsFile');
	const adminFile = configuredPath
		? resolveAdminPath(context.extensionPath, configuredPath)
		: path.join(context.extensionPath, 'config', 'admins.json');

	try {
		const raw = await fs.readFile(adminFile, 'utf8');
		const data = JSON.parse(raw) as { admins?: string[] };
		const list = (data.admins ?? []).map(value => value.trim().toLowerCase());
		return new Set(list);
	} catch {
		return new Set();
	}
}

function resolveAdminPath(extensionPath: string, configuredPath: string) {
	if (path.isAbsolute(configuredPath)) {
		return configuredPath;
	}
	return path.join(extensionPath, configuredPath);
}

async function generatePdf(
	context: vscode.ExtensionContext,
	payload: GeneratePayload,
	webview: vscode.Webview
): Promise<{ ok: true; pdfUri: string } | { ok: false; friendly: string; detail: string }> {
	const storageDir = context.globalStorageUri.fsPath;
	await fs.mkdir(storageDir, { recursive: true });

	const texPath = path.join(storageDir, 'main.tex');
	const pdfPath = path.join(storageDir, 'main.pdf');
	const logPath = path.join(storageDir, 'build.log');

	const tex = renderTex(payload);
	await fs.writeFile(texPath, tex, 'utf8');

	const result = await runLatex(texPath, storageDir);
	const logContent = `${result.stdout}\n${result.stderr}`.trim();
	await fs.writeFile(logPath, logContent || 'Sem log.', 'utf8');
	lastLogPath = logPath;

	if (!result.ok) {
		return {
			ok: false,
			friendly: result.friendly,
			detail: logContent
		};
	}

	const pdfUri = webview.asWebviewUri(vscode.Uri.file(pdfPath)).toString();
	return { ok: true, pdfUri };
}

function renderTex(payload: GeneratePayload) {
	const nome = escapeLatex(payload.nome || 'Aluno');
	const turma = escapeLatex(payload.turma || 'Turma');
	const titulo = escapeLatex(payload.titulo || 'Atividade');
	const disciplina = escapeLatex(payload.disciplina || 'Disciplina');
	const professor = escapeLatex(payload.professor || '');
	const data = escapeLatex(payload.data || '');
	const observacoes = escapeLatexBlock(payload.observacoes || '');

	return [
		'\\documentclass[12pt]{article}',
		'\\usepackage[utf8]{inputenc}',
		'\\usepackage{geometry}',
		'\\usepackage{lmodern}',
		'\\usepackage{parskip}',
		'\\geometry{a4paper, margin=2.5cm}',
		'\\begin{document}',
		'\\begin{center}',
		`{\\Large ${titulo}}\\\\`,
		'\\vspace{0.3cm}',
		`${disciplina}`,
		'\\end{center}',
		'\\vspace{0.6cm}',
		'\\begin{tabular}{ll}',
		`Nome: & ${nome} \\\\`,
		`Turma: & ${turma} \\\\`,
		`Professor: & ${professor || '-'} \\\\`,
		`Data: & ${data || '-'} \\\\`,
		'\\end{tabular}',
		'\\vspace{0.8cm}',
		'\\textbf{Observacoes}',
		'\\vspace{0.2cm}',
		observacoes || '-',
		'\\end{document}'
	].join('\n');
}

function escapeLatex(value: string) {
	const map: Record<string, string> = {
		'\\': '\\textbackslash{}',
		'{': '\\{',
		'}': '\\}',
		'%': '\\%',
		'$': '\\$',
		'#': '\\#',
		'&': '\\&',
		'_': '\\_',
		'^': '\\textasciicircum{}',
		'~': '\\textasciitilde{}'
	};
	return value.replace(/[\\{}%$#&_~^]/g, match => map[match]);
}

function escapeLatexBlock(value: string) {
	const escaped = escapeLatex(value);
	return escaped.replace(/\r?\n/g, '\\\\');
}

async function runLatex(texPath: string, outDir: string) {
	const latexmkArgs = [
		'-pdf',
		'-interaction=nonstopmode',
		'-halt-on-error',
		'-file-line-error',
		`-outdir=${outDir}`,
		texPath
	];

	const latexmk = await runProcess('latexmk', latexmkArgs, outDir);
	if (latexmk.ok || !latexmk.notFound) {
		return latexmk;
	}

	const pdflatexArgs = [
		'-interaction=nonstopmode',
		'-halt-on-error',
		'-file-line-error',
		`-output-directory=${outDir}`,
		texPath
	];

	return runProcess('pdflatex', pdflatexArgs, outDir);
}

function runProcess(command: string, args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; stderr: string; friendly: string; notFound: boolean }> {
	return new Promise(resolve => {
		let stdout = '';
		let stderr = '';

		const child = spawn(command, args, { cwd, shell: process.platform === 'win32' });
		child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
		child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

		child.on('error', (err: any) => {
			const notFound = err?.code === 'ENOENT';
			const friendly = notFound
				? 'Nao encontrei TeX Live/latexmk. Instale um TeX (ex: TeX Live).'
				: 'Falha ao executar o compilador LaTeX.';
			resolve({ ok: false, stdout, stderr: `${stderr}\n${err?.message ?? ''}`, friendly, notFound });
		});

		child.on('close', (code: number | null) => {
			if (code === 0) {
				resolve({ ok: true, stdout, stderr, friendly: '', notFound: false });
			} else {
				resolve({ ok: false, stdout, stderr, friendly: 'Erro ao gerar PDF. Verifique o log.', notFound: false });
			}
		});
	});
}

type DiagramadorPaths = {
	baseDir: string;
	projectPath: string;
	assetsDir: string;
	outDir: string;
	mainTexPath: string;
	previewPdfPath: string;
	buildLogPath: string;
};

type DiagramadorBuildResult = {
	ok: boolean;
	stdout: string;
	stderr: string;
	friendly: string;
	notFound: boolean;
};

class DiagramadorController implements vscode.Disposable {
	private project: DiagramadorProject = createDefaultProject();
	private readonly paths: DiagramadorPaths;
	private viewProvider?: DiagramadorViewProvider;
	private readonly buildService: DiagramadorBuildService;
	private readonly previewManager: DiagramadorPreviewManager;
	private readonly output: vscode.OutputChannel;
	private initialized = false;

	constructor() {
		this.paths = resolveDiagramadorPaths();
		this.output = vscode.window.createOutputChannel('Diagramador');
		this.buildService = new DiagramadorBuildService(this.paths, status => this.handleStatus(status), this.output);
		this.previewManager = new DiagramadorPreviewManager(this.output);
	}

	async initialize() {
		await ensureDiagramadorDirs(this.paths);
		this.project = await loadDiagramadorProject(this.paths);
		this.initialized = true;
		this.viewProvider?.sendProject(this.project);
		this.buildService.schedule(this.project);
	}

	setViewProvider(provider: DiagramadorViewProvider) {
		this.viewProvider = provider;
		if (this.initialized) {
			this.viewProvider.sendProject(this.project);
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
		void this.previewManager.open(this.paths.previewPdfPath);
	}

	async handleMessage(message: any) {
		switch (message?.type) {
			case 'ready':
				this.viewProvider?.sendProject(this.project);
				return;
			case 'updateHeader':
				await this.updateHeader(message?.field, message?.value);
				return;
			case 'updateBlock':
				await this.updateBlock(message?.id, message?.patch);
				return;
			case 'addBlock':
				await this.addBlock(message?.blockType);
				return;
			case 'moveBlock':
				await this.moveBlock(message?.id, message?.direction);
				return;
			case 'duplicateBlock':
				await this.duplicateBlock(message?.id);
				return;
			case 'removeBlock':
				await this.removeBlock(message?.id);
				return;
			case 'pickImage':
				await this.pickImage(message?.id);
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

	private async updateHeader(field: string, value: any) {
		if (!field || typeof field !== 'string') {
			return;
		}
		const allowed = new Set(['name', 'turma', 'disciplina', 'professor', 'date']);
		if (!allowed.has(field)) {
			return;
		}
		this.project.header = this.project.header ?? createDefaultProject().header;
		this.project.header[field as keyof typeof this.project.header] = String(value ?? '');
		await this.saveAndBuild();
	}

	private async updateBlock(id: string, patch: any) {
		if (!id || !patch) {
			return;
		}
		const block = this.project.blocks.find(item => item.id === id);
		if (!block) {
			return;
		}
		applyBlockPatch(block, patch);
		await this.saveAndBuild();
	}

	private async addBlock(type: DiagramadorBlockType) {
		const blockType = normalizeBlockType(type);
		this.project.blocks.push(createBlock(blockType));
		await this.saveAndBuild();
		this.viewProvider?.sendProject(this.project);
	}

	private async moveBlock(id: string, direction: number) {
		if (!id) {
			return;
		}
		const index = this.project.blocks.findIndex(block => block.id === id);
		if (index < 0) {
			return;
		}
		const delta = Number(direction) < 0 ? -1 : 1;
		const target = index + delta;
		if (target < 0 || target >= this.project.blocks.length) {
			return;
		}
		const [item] = this.project.blocks.splice(index, 1);
		this.project.blocks.splice(target, 0, item);
		await this.saveAndBuild();
		this.viewProvider?.sendProject(this.project);
	}

	private async duplicateBlock(id: string) {
		if (!id) {
			return;
		}
		const index = this.project.blocks.findIndex(block => block.id === id);
		if (index < 0) {
			return;
		}
		const block = this.project.blocks[index];
		const clone = cloneBlock(block);
		this.project.blocks.splice(index + 1, 0, clone);
		await this.saveAndBuild();
		this.viewProvider?.sendProject(this.project);
	}

	private async removeBlock(id: string) {
		if (!id) {
			return;
		}
		const startLength = this.project.blocks.length;
		this.project.blocks = this.project.blocks.filter(block => block.id !== id);
		if (this.project.blocks.length === startLength) {
			return;
		}
		await this.saveAndBuild();
		this.viewProvider?.sendProject(this.project);
	}

	private async pickImage(id: string) {
		const block = this.project.blocks.find(item => item.id === id);
		if (!block || block.type !== 'image') {
			return;
		}
		const result = await vscode.window.showOpenDialog({
			canSelectMany: false,
			openLabel: 'Selecionar imagem',
			filters: {
				Imagens: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
			}
		});
		if (!result || result.length === 0) {
			return;
		}
		const sourcePath = result[0].fsPath;
		await ensureDiagramadorDirs(this.paths);
		const assetName = await copyAssetToProject(sourcePath, this.paths.assetsDir);
		block.asset = assetName;
		await this.saveAndBuild();
		this.viewProvider?.sendProject(this.project);
	}

	private async saveAndBuild() {
		await ensureDiagramadorDirs(this.paths);
		await saveDiagramadorProject(this.paths, this.project);
		this.buildService.schedule(this.project);
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

class DiagramadorBuildService implements vscode.Disposable {
	private timer?: NodeJS.Timeout;
	private pendingProject?: DiagramadorProject;
	private currentProcess?: ChildProcess;
	private buildId = 0;

	constructor(
		private readonly paths: DiagramadorPaths,
		private readonly onStatus: (status: DiagramadorStatus) => void,
		private readonly output: vscode.OutputChannel
	) { }

	schedule(project: DiagramadorProject) {
		this.pendingProject = cloneProject(project);
		this.cancelRunning();
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			void this.runBuild();
		}, 900);
	}

	private async runBuild() {
		const project = this.pendingProject;
		if (!project) {
			return;
		}
		this.pendingProject = undefined;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}

		const buildId = ++this.buildId;
		this.cancelRunning();
		this.onStatus({ state: 'building', message: 'Gerando PDF...' });

		try {
			await ensureDiagramadorDirs(this.paths);
			const tex = renderLatex(project);
			await fs.writeFile(this.paths.mainTexPath, tex, 'utf8');
			const result = await this.runTectonic(this.paths.mainTexPath, this.paths.outDir);
			if (buildId !== this.buildId) {
				return;
			}
			await writeBuildLog(this.paths.buildLogPath, result);
			if (result.ok) {
				await updatePreviewPdf(this.paths);
				this.onStatus({ state: 'success', message: 'PDF atualizado.' });
			} else {
				this.output.appendLine(`[${new Date().toISOString()}] ${result.friendly}`);
				if (result.stdout) {
					this.output.appendLine(result.stdout);
				}
				if (result.stderr) {
					this.output.appendLine(result.stderr);
				}
				this.onStatus({ state: 'error', message: result.friendly });
			}
		} catch (err: any) {
			if (buildId !== this.buildId) {
				return;
			}
			const friendly = 'Nao foi possivel gerar o PDF.';
			this.output.appendLine(`[${new Date().toISOString()}] ${friendly}`);
			this.output.appendLine(String(err?.message ?? err));
			this.onStatus({ state: 'error', message: friendly });
		}
	}

	private runTectonic(texPath: string, outDir: string): Promise<DiagramadorBuildResult> {
		return new Promise(resolve => {
			let stdout = '';
			let stderr = '';
			const cmd = process.env.TECTONIC_PATH || 'tectonic';
			const args = ['--outdir', outDir, texPath];
			const bundle = process.env.CO_TECTONIC_BUNDLE;
			if (bundle) {
				args.unshift(bundle);
				args.unshift('--bundle');
			}

			const child = spawn(cmd, args, { cwd: outDir, shell: process.platform === 'win32' });
			this.currentProcess = child;
			child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
			child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

			child.on('error', (err: any) => {
				const notFound = err?.code === 'ENOENT';
				const friendly = notFound
					? 'Nao encontrei o Tectonic. Instale o Tectonic para gerar o PDF.'
					: 'Erro ao executar o Tectonic.';
				if (this.currentProcess === child) {
					this.currentProcess = undefined;
				}
				resolve({ ok: false, stdout, stderr: `${stderr}\n${err?.message ?? ''}`, friendly, notFound });
			});

			child.on('close', (code: number | null) => {
				if (this.currentProcess === child) {
					this.currentProcess = undefined;
				}
				if (code === 0) {
					resolve({ ok: true, stdout, stderr, friendly: '', notFound: false });
				} else {
					resolve({
						ok: false,
						stdout,
						stderr,
						friendly: 'Nao foi possivel gerar o PDF. Verifique a instalacao.',
						notFound: false
					});
				}
			});
		});
	}

	private cancelRunning() {
		if (this.currentProcess && !this.currentProcess.killed) {
			try {
				this.currentProcess.kill();
			} catch {
				// best effort
			}
			this.currentProcess = undefined;
		}
	}

	dispose() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.cancelRunning();
	}
}

class DiagramadorPreviewManager implements vscode.Disposable {
	private lastViewPath?: string;

	constructor(private readonly output: vscode.OutputChannel) { }

	async open(previewPdfPath: string) {
		if (!await fileExists(previewPdfPath)) {
			return;
		}
		const viewPath = await this.copyForView(previewPdfPath);
		await this.showPreview(viewPath);
		await this.cleanupOldCopies(path.dirname(previewPdfPath), viewPath);
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
		const uri = vscode.Uri.file(viewPath);
		const viewColumn = this.pickPreviewColumn();
		try {
			await vscode.commands.executeCommand('vscode.open', uri, {
				viewColumn,
				preview: true
			});
		} catch (err: any) {
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao abrir preview: ${err?.message ?? err}`);
		}
	}

	private pickPreviewColumn(): vscode.ViewColumn {
		const hasOpenTabs = vscode.window.tabGroups.all.some(group => group.tabs.length > 0);
		if (!hasOpenTabs) {
			return vscode.ViewColumn.One;
		}
		return vscode.ViewColumn.Beside;
	}

	private async cleanupOldCopies(dir: string, keepPath: string) {
		try {
			const entries = await fs.readdir(dir);
			const targets = entries.filter(entry => entry.startsWith('preview_view_'));
			await Promise.all(targets.map(async entry => {
				const full = path.join(dir, entry);
				if (full !== keepPath) {
					await fs.unlink(full).catch(() => undefined);
				}
			}));
		} catch {
			// best effort
		}
	}

	dispose() {
		if (this.lastViewPath) {
			void fs.unlink(this.lastViewPath).catch(() => undefined);
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
		assetsDir: path.join(baseDir, 'assets'),
		outDir: path.join(baseDir, 'out'),
		mainTexPath: path.join(baseDir, 'out', 'main.tex'),
		previewPdfPath: path.join(baseDir, 'out', 'preview.pdf'),
		buildLogPath: path.join(baseDir, 'out', 'build.log')
	};
}

async function ensureDiagramadorDirs(paths: DiagramadorPaths) {
	await fs.mkdir(paths.baseDir, { recursive: true });
	await fs.mkdir(paths.assetsDir, { recursive: true });
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

function cloneProject(project: DiagramadorProject): DiagramadorProject {
	return JSON.parse(JSON.stringify(project)) as DiagramadorProject;
}

function normalizeBlockType(type: DiagramadorBlockType): DiagramadorBlockType {
	switch (type) {
		case 'title':
		case 'text':
		case 'section':
		case 'question':
		case 'image':
			return type;
		default:
			return 'text';
	}
}

function applyBlockPatch(block: DiagramadorBlock, patch: any) {
	switch (block.type) {
		case 'title':
		case 'text': {
			if (typeof patch.text === 'string') {
				block.text = patch.text;
			}
			break;
		}
		case 'section': {
			if (typeof patch.title === 'string') {
				block.title = patch.title;
			}
			break;
		}
		case 'question': {
			if (typeof patch.statement === 'string') {
				block.statement = patch.statement;
			}
			if (patch.lines !== undefined) {
				const value = Math.max(1, Number(patch.lines));
				block.lines = Number.isFinite(value) ? value : 1;
			}
			break;
		}
		case 'image': {
			if (typeof patch.caption === 'string') {
				block.caption = patch.caption;
			}
			break;
		}
		default:
			break;
	}
}

function cloneBlock(block: DiagramadorBlock): DiagramadorBlock {
	const id = createBlock(block.type).id;
	switch (block.type) {
		case 'title':
			return { id, type: 'title', text: block.text };
		case 'text':
			return { id, type: 'text', text: block.text };
		case 'section':
			return { id, type: 'section', title: block.title };
		case 'question':
			return { id, type: 'question', statement: block.statement, lines: block.lines };
		case 'image':
			return { id, type: 'image', asset: block.asset, caption: block.caption };
		default:
			return { id, type: 'text', text: '' };
	}
}

async function copyAssetToProject(sourcePath: string, assetsDir: string): Promise<string> {
	const ext = path.extname(sourcePath) || '.png';
	const stamp = Date.now().toString(36);
	const rand = Math.random().toString(36).slice(2, 8);
	const filename = `img_${stamp}_${rand}${ext}`;
	const dest = path.join(assetsDir, filename);
	await fs.copyFile(sourcePath, dest);
	return filename;
}

async function writeBuildLog(logPath: string, result: DiagramadorBuildResult) {
	const stamp = new Date().toISOString();
	const lines = [
		`[${stamp}] ${result.ok ? 'OK' : 'ERRO'}`,
		result.stdout,
		result.stderr
	].filter(Boolean).join('\n');
	await fs.writeFile(logPath, lines || 'Sem log.', 'utf8');
}

async function updatePreviewPdf(paths: DiagramadorPaths) {
	const generated = path.join(paths.outDir, 'main.pdf');
	if (await fileExists(generated)) {
		await fs.copyFile(generated, paths.previewPdfPath);
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
