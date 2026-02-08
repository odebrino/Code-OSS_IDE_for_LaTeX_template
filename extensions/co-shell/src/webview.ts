/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unexternalized-strings */

import * as vscode from 'vscode';
import { DiagramadorProject } from './diagramador';

type Role = 'student' | 'admin';

type MessageHandler = (message: any, webview: vscode.Webview) => void | Promise<void>;

const panels = new Map<Role, vscode.WebviewPanel>();

export function openHomePanel(
	context: vscode.ExtensionContext,
	role: Role,
	onMessage: MessageHandler
) {
	const existing = panels.get(role);
	if (existing) {
		existing.reveal(vscode.ViewColumn.One, true);
		return existing;
	}

	const title = role === 'student' ? 'CO Student Home' : 'CO Admin Home';
	const panel = vscode.window.createWebviewPanel(
		role === 'student' ? 'coShell.studentHome' : 'coShell.adminHome',
		title,
		{ viewColumn: vscode.ViewColumn.One, preserveFocus: role === 'student' },
		{
			enableScripts: true,
			localResourceRoots: [context.globalStorageUri, context.extensionUri]
		}
	);

	panel.webview.html = getHomeHtml(panel.webview, role);
	panel.webview.onDidReceiveMessage(message => onMessage(message, panel.webview));
	panel.onDidDispose(() => panels.delete(role));
	panels.set(role, panel);

	return panel;
}

export function registerAdminView(context: vscode.ExtensionContext, onMessage: MessageHandler) {
	const provider = new AdminHomeViewProvider(context, onMessage);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('coShell.adminView', provider)
	);
}

export type DiagramadorStatus = {
	state: 'idle' | 'building' | 'success' | 'error';
	message?: string;
};

export type DiagramadorTemplateSummary = {
	id: string;
	name: string;
	version?: string;
	description?: string;
};

export class DiagramadorViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private readonly uiBuildId: string;
	private lastHtmlBuildId?: string;
	private templates: DiagramadorTemplateSummary[] = [];

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly onMessage: MessageHandler,
		private readonly getProject: () => DiagramadorProject,
		uiBuildId: string,
		private readonly onVisible?: () => void
	) {
		this.uiBuildId = uiBuildId;
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri]
		};
		this.refreshWebview(true);
		view.webview.onDidReceiveMessage(message => this.onMessage(message, view.webview));
		view.onDidChangeVisibility(() => {
			if (view.visible) {
				this.refreshWebview(true);
				this.onVisible?.();
			}
		});
	}

	sendProject(project: DiagramadorProject) {
		this.view?.webview.postMessage({ type: 'project', project });
	}

	sendTemplates(templates: DiagramadorTemplateSummary[]) {
		this.templates = templates;
		this.view?.webview.postMessage({ type: 'templates', templates });
	}

	sendStatus(status: DiagramadorStatus) {
		this.view?.webview.postMessage({ type: 'status', status });
	}

	show(preserveFocus = true) {
		this.refreshWebview(true);
		this.view?.show(preserveFocus);
	}

	private refreshWebview(force = false) {
		if (!this.view) {
			return;
		}
		if (!force && this.lastHtmlBuildId === this.uiBuildId) {
			return;
		}
		this.view.webview.html = getDiagramadorHtml(this.view.webview, this.getProject(), this.templates, this.uiBuildId);
		this.lastHtmlBuildId = this.uiBuildId;
	}
}

export function registerDiagramadorView(
	context: vscode.ExtensionContext,
	onMessage: MessageHandler,
	getProject: () => DiagramadorProject,
	onVisible?: () => void
) {
	const provider = new DiagramadorViewProvider(context, onMessage, getProject, getUiBuildId(context), onVisible);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('co.diagramador.blocksView', provider)
	);
	return provider;
}

function getUiBuildId(context: vscode.ExtensionContext): string {
	const version = String(context.extension?.packageJSON?.version ?? '0.0.0');
	if (context.extensionMode === vscode.ExtensionMode.Development) {
		return `${version} / ${new Date().toISOString()}`;
	}
	return version;
}

class AdminHomeViewProvider implements vscode.WebviewViewProvider {
	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly onMessage: MessageHandler
	) { }

	resolveWebviewView(view: vscode.WebviewView): void {
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.globalStorageUri, this.context.extensionUri]
		};
		view.webview.html = getHomeHtml(view.webview, 'admin');
		view.webview.onDidReceiveMessage(message => this.onMessage(message, view.webview));
	}
}

function getHomeHtml(webview: vscode.Webview, role: Role): string {
	const nonce = getNonce();
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} blob:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src 'nonce-${nonce}'`,
		`frame-src ${webview.cspSource} blob:`
	].join('; ');

	return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>CO</title>
<style>
	body {
		font-family: system-ui, Arial, sans-serif;
		margin: 0;
		padding: 16px;
		background: #f7f7f7;
		color: #222;
	}
	h1 { margin: 0 0 12px 0; font-size: 20px; }
	.container {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 16px;
		height: calc(100vh - 32px);
	}
	.card {
		background: #fff;
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 12px;
	}
	label { display: block; margin: 8px 0 4px; }
	input, button, textarea {
		width: 100%;
		padding: 8px;
		border-radius: 6px;
		border: 1px solid #ccc;
		box-sizing: border-box;
	}
	textarea {
		min-height: 90px;
		resize: vertical;
	}
	button { background: #2d7ef7; color: #fff; border: none; cursor: pointer; }
	button:disabled { background: #9bbcf2; }
	.form-actions {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.form-actions button { width: auto; flex: 1; }
	.hint { font-size: 12px; color: #666; margin-top: 6px; }
	#preview {
		width: 100%;
		height: calc(100% - 32px);
		border: 1px solid #ddd;
		border-radius: 8px;
		background: #fff;
	}
	#previewEmpty {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #777;
		height: calc(100% - 32px);
		border: 1px dashed #ccc;
		border-radius: 8px;
		background: #fafafa;
	}
	#status { margin-top: 8px; font-size: 12px; color: #444; }
	#details { margin-top: 8px; font-size: 12px; color: #a33; white-space: pre-wrap; }
	[data-role="student"] #adminExtras { display: none; }
	@media (max-width: 900px) {
		.container {
			grid-template-columns: 1fr;
			height: auto;
		}
		#preview, #previewEmpty {
			height: 60vh;
		}
	}
</style>
</head>
<body data-role="${role}">
	<h1>${role === 'student' ? 'Student Home' : 'Admin Home'}</h1>
	<div class="container">
		<div class="card">
			<form id="form">
				<label>Nome</label>
				<input id="nome" type="text" placeholder="Nome do aluno" />

				<label>Turma</label>
				<input id="turma" type="text" placeholder="Ex: 2B" />

				<label>Disciplina</label>
				<input id="disciplina" type="text" placeholder="Ex: Matematica" />

				<label>Professor</label>
				<input id="professor" type="text" placeholder="Ex: Maria" />

				<label>Data</label>
				<input id="data" type="date" />

				<label>Titulo</label>
				<input id="titulo" type="text" placeholder="Ex: Atividade 1" />

				<label>Observacoes</label>
				<textarea id="observacoes" placeholder="Escreva observacoes ou instrucoes..."></textarea>

				<div class="form-actions">
					<button id="btn" type="submit">Gerar PDF</button>
					<button id="clear" type="button">Limpar</button>
				</div>
				<div class="hint">Arquivos sao salvos localmente no armazenamento do CO Dev.</div>
				<div id="status"></div>
				<pre id="details"></pre>

				<div id="adminExtras">
					<hr />
					<button id="openLog" type="button">Abrir log</button>
					<button id="openTemplate" type="button">Abrir pasta do template</button>
				</div>
			</form>
		</div>

		<div class="card">
			<div id="previewEmpty">Nenhum PDF gerado ainda.</div>
			<iframe id="preview" title="Preview PDF"></iframe>
		</div>
	</div>

<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	const form = document.getElementById('form');
	const btn = document.getElementById('btn');
	const clear = document.getElementById('clear');
	const statusEl = document.getElementById('status');
	const detailsEl = document.getElementById('details');
	const preview = document.getElementById('preview');
	const previewEmpty = document.getElementById('previewEmpty');
	const role = document.body.dataset.role;

	form.addEventListener('submit', (event) => {
		event.preventDefault();
		btn.disabled = true;
		statusEl.textContent = 'Gerando PDF...';
		detailsEl.textContent = '';
		const payload = {
			nome: document.getElementById('nome').value,
			turma: document.getElementById('turma').value,
			disciplina: document.getElementById('disciplina').value,
			professor: document.getElementById('professor').value,
			data: document.getElementById('data').value,
			titulo: document.getElementById('titulo').value,
			observacoes: document.getElementById('observacoes').value
		};
		vscode.postMessage({ type: 'generatePdf', payload });
	});

	clear.addEventListener('click', () => {
		form.reset();
		statusEl.textContent = '';
		detailsEl.textContent = '';
		preview.src = '';
		preview.style.display = 'none';
		previewEmpty.style.display = 'flex';
	});

	document.getElementById('openLog').addEventListener('click', () => {
		vscode.postMessage({ type: 'openLog' });
	});

	document.getElementById('openTemplate').addEventListener('click', () => {
		vscode.postMessage({ type: 'openTemplate' });
	});

	window.addEventListener('message', (event) => {
		const msg = event.data;
		if (msg.type === 'pdfReady') {
			statusEl.textContent = 'PDF gerado.';
			previewEmpty.style.display = 'none';
			preview.style.display = 'block';
			preview.src = msg.pdfUri + '#toolbar=0&navpanes=0';
			btn.disabled = false;
		}
		if (msg.type === 'error') {
			statusEl.textContent = msg.friendly || 'Erro.';
			preview.style.display = 'none';
			previewEmpty.style.display = 'flex';
			if (role === 'admin' && msg.detail) {
				detailsEl.textContent = msg.detail;
			}
			btn.disabled = false;
		}
	});

	preview.style.display = 'none';
</script>
</body>
</html>`;
}

function getDiagramadorHtml(
	webview: vscode.Webview,
	project: DiagramadorProject,
	templates: DiagramadorTemplateSummary[],
	uiBuildId: string
): string {
	const nonce = getNonce();
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} blob:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src 'nonce-${nonce}'`
	].join('; ');
	const projectJson = JSON.stringify(project).replace(/</g, '\\u003c');
	const templatesJson = JSON.stringify(templates).replace(/</g, '\\u003c');
	const safeBuildId = escapeHtml(uiBuildId);

	return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Diagramador</title>
<style>
	body {
		font-family: var(--vscode-font-family, system-ui, Arial, sans-serif);
		margin: 0;
		padding: 12px;
		color: var(--vscode-foreground, #222);
		background: var(--vscode-sideBar-background, #f7f7f7);
	}
	h2 { margin: 0 0 8px 0; font-size: 14px; }
	.card {
		background: var(--vscode-editor-background, #fff);
		border: 1px solid var(--vscode-panel-border, #ddd);
		border-radius: 8px;
		padding: 10px;
		margin-bottom: 10px;
	}
	.topline {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}
	.template-title {
		font-size: 12px;
		font-weight: 600;
	}
	.ui-build {
		font-size: 10px;
		color: #666;
		margin-bottom: 8px;
	}
	.status { font-size: 12px; color: var(--vscode-foreground, #444); }
	.status[data-state="error"] { color: #a33; }
	.status[data-state="success"] { color: #2d7ef7; }
	label { display: block; font-size: 12px; margin: 6px 0 4px; }
	input, textarea, select {
		width: 100%;
		box-sizing: border-box;
		padding: 6px 8px;
		border-radius: 6px;
		border: 1px solid var(--vscode-input-border, #ccc);
		background: var(--vscode-input-background, #fff);
		color: inherit;
		font-size: 12px;
	}
	textarea { resize: vertical; min-height: 140px; }
	button {
		width: auto;
		background: #2d7ef7;
		color: #fff;
		border: none;
		cursor: pointer;
		padding: 6px 10px;
		border-radius: 6px;
		font-size: 12px;
	}
	button.secondary { background: #5c6b7a; }
	button:disabled { opacity: 0.5; cursor: not-allowed; }
	.empty {
		font-size: 12px;
		color: #666;
		padding: 6px 0;
	}
	.hint {
		font-size: 11px;
		color: #666;
		margin-top: 6px;
	}
	.section {
		margin-top: 12px;
	}
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 6px;
		font-size: 12px;
		font-weight: 600;
	}
	.member-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px;
		margin-bottom: 6px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border-radius: 999px;
		border: 1px solid rgba(45, 126, 247, 0.35);
		background: rgba(45, 126, 247, 0.12);
		font-size: 11px;
	}
	.chip button {
		background: transparent;
		color: inherit;
		padding: 0 4px;
		border-radius: 999px;
	}
</style>
</head>
<body>
	<div class="topline">
		<div class="template-title" id="templateTitle"></div>
		<div class="status" id="status" data-state="idle"></div>
	</div>
	<div class="ui-build">UI_BUILD: ${safeBuildId}</div>

	<section class="card">
		<h2>Selecionador de Template</h2>
		<label for="templateSelect">Template</label>
		<select id="templateSelect"></select>
		<div class="hint">Template simples para validar preview.</div>
	</section>

	<section class="card">
		<h2>Dados do Documento</h2>
		<label for="doc-title">Titulo</label>
		<input id="doc-title" type="text" />

		<label for="doc-model">Modelo</label>
		<input id="doc-model" type="text" />

		<label for="doc-text">Texto</label>
		<textarea id="doc-text"></textarea>

		<div class="section">
			<div class="section-header">
				<span>Integrantes</span>
				<button id="addMember" class="secondary" type="button">Adicionar integrante</button>
			</div>
			<div id="membersList"></div>
		</div>

		<div class="section">
			<div class="section-header">
				<span>Palavras-chave</span>
			</div>
			<div id="keywordsList" class="chips"></div>
			<input id="keywordInput" type="text" placeholder="Digite e pressione Enter" />
		</div>
	</section>

<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	let project = ${projectJson};
	let templates = ${templatesJson};

	const statusEl = document.getElementById('status');
	const templateTitleEl = document.getElementById('templateTitle');
	const templateSelect = document.getElementById('templateSelect');
	const titleInput = document.getElementById('doc-title');
	const modelInput = document.getElementById('doc-model');
	const textInput = document.getElementById('doc-text');
	const membersList = document.getElementById('membersList');
	const addMemberBtn = document.getElementById('addMember');
	const keywordsList = document.getElementById('keywordsList');
	const keywordInput = document.getElementById('keywordInput');

	function setTemplates(next) {
		templates = Array.isArray(next) ? next : [];
	}

	function renderTemplateOptions() {
		templateSelect.innerHTML = '';
		if (!templates.length) {
			const option = document.createElement('option');
			option.value = '';
			option.textContent = 'Nenhum template encontrado';
			templateSelect.appendChild(option);
			templateSelect.disabled = true;
			return;
		}
		templateSelect.disabled = false;
		templates.forEach((template) => {
			const option = document.createElement('option');
			option.value = template.id;
			option.textContent = template.name || template.id;
			templateSelect.appendChild(option);
		});
	}

	function ensureTemplateSelection() {
		if (!templates.length) {
			project.templateId = '';
			return;
		}
		if (!project.templateId || !templates.some(template => template.id === project.templateId)) {
			project.templateId = templates[0].id;
		}
	}

	function setStatus(status) {
		if (!status) {
			statusEl.textContent = '';
			statusEl.dataset.state = 'idle';
			return;
		}
		statusEl.textContent = status.message || '';
		statusEl.dataset.state = status.state || 'idle';
	}

	function ensureDoc() {
		if (!project || typeof project !== 'object') {
			project = { templateId: templates[0]?.id || '', doc: { title: '', model: '', text: '', members: [], keywords: [] } };
		}
		if (!project.templateId) {
			project.templateId = templates[0]?.id || '';
		}
		if (!project.doc || typeof project.doc !== 'object') {
			project.doc = { title: '', model: '', text: '', members: [], keywords: [] };
		}
		if (!Array.isArray(project.doc.members)) {
			project.doc.members = [];
		}
		if (!Array.isArray(project.doc.keywords)) {
			project.doc.keywords = [];
		}
		project.doc.title = typeof project.doc.title === 'string' ? project.doc.title : String(project.doc.title ?? '');
		project.doc.model = typeof project.doc.model === 'string' ? project.doc.model : String(project.doc.model ?? '');
		project.doc.text = typeof project.doc.text === 'string' ? project.doc.text : String(project.doc.text ?? '');
		return project.doc;
	}

	function updateDoc(patch) {
		vscode.postMessage({ type: 'updateDoc', patch });
	}

	function renderTemplate() {
		ensureDoc();
		renderTemplateOptions();
		ensureTemplateSelection();
		const templateId = project.templateId;
		const current = templates.find(template => template.id === templateId);
		templateTitleEl.textContent = current ? 'Template: ' + (current.name || current.id) : 'Template: -';
		templateSelect.value = templateId || '';
	}

	function renderMembers() {
		const doc = ensureDoc();
		membersList.innerHTML = '';
		if (!doc.members.length) {
			const empty = document.createElement('div');
			empty.className = 'empty';
			empty.textContent = 'Nenhum integrante adicionado.';
			membersList.appendChild(empty);
			return;
		}
		doc.members.forEach((member, index) => {
			const row = document.createElement('div');
			row.className = 'member-row';
			const input = document.createElement('input');
			input.type = 'text';
			input.value = member || '';
			input.addEventListener('input', () => {
				const next = doc.members.slice();
				next[index] = input.value;
				doc.members = next;
				updateDoc({ members: next });
			});
			const removeBtn = document.createElement('button');
			removeBtn.type = 'button';
			removeBtn.className = 'secondary';
			removeBtn.textContent = 'Remover';
			removeBtn.addEventListener('click', () => {
				const next = doc.members.filter((_, idx) => idx !== index);
				doc.members = next;
				updateDoc({ members: next });
				renderMembers();
			});
			row.appendChild(input);
			row.appendChild(removeBtn);
			membersList.appendChild(row);
		});
	}

	function renderKeywords() {
		const doc = ensureDoc();
		keywordsList.innerHTML = '';
		if (!doc.keywords.length) {
			const empty = document.createElement('div');
			empty.className = 'empty';
			empty.textContent = 'Nenhuma palavra-chave adicionada.';
			keywordsList.appendChild(empty);
			return;
		}
		doc.keywords.forEach((keyword, index) => {
			const chip = document.createElement('div');
			chip.className = 'chip';
			const label = document.createElement('span');
			label.textContent = keyword;
			const removeBtn = document.createElement('button');
			removeBtn.type = 'button';
			removeBtn.textContent = 'x';
			removeBtn.addEventListener('click', () => {
				const next = doc.keywords.filter((_, idx) => idx !== index);
				doc.keywords = next;
				updateDoc({ keywords: next });
				renderKeywords();
			});
			chip.appendChild(label);
			chip.appendChild(removeBtn);
			keywordsList.appendChild(chip);
		});
	}

	function renderDoc() {
		const doc = ensureDoc();
		titleInput.value = doc.title || '';
		modelInput.value = doc.model || '';
		textInput.value = doc.text || '';
		renderMembers();
		renderKeywords();
	}

	templateSelect.addEventListener('change', () => {
		const value = templateSelect.value;
		if (project.templateId === value) {
			return;
		}
		project.templateId = value;
		renderTemplate();
		vscode.postMessage({ type: 'updateTemplate', templateId: value });
	});

	titleInput.addEventListener('input', () => {
		const doc = ensureDoc();
		doc.title = titleInput.value;
		updateDoc({ title: titleInput.value });
	});

	modelInput.addEventListener('input', () => {
		const doc = ensureDoc();
		doc.model = modelInput.value;
		updateDoc({ model: modelInput.value });
	});

	textInput.addEventListener('input', () => {
		const doc = ensureDoc();
		doc.text = textInput.value;
		updateDoc({ text: textInput.value });
	});

	addMemberBtn.addEventListener('click', () => {
		const doc = ensureDoc();
		const next = doc.members.slice();
		next.push('');
		doc.members = next;
		updateDoc({ members: next });
		renderMembers();
	});

	keywordInput.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') {
			return;
		}
		event.preventDefault();
		const value = keywordInput.value.trim();
		if (!value) {
			return;
		}
		const doc = ensureDoc();
		const next = doc.keywords.slice();
		next.push(value);
		doc.keywords = next;
		keywordInput.value = '';
		updateDoc({ keywords: next });
		renderKeywords();
	});

	window.addEventListener('message', (event) => {
		const msg = event.data;
		if (msg.type === 'templates') {
			setTemplates(msg.templates);
			const previous = project.templateId;
			renderTemplate();
			if (project.templateId && project.templateId !== previous) {
				vscode.postMessage({ type: 'updateTemplate', templateId: project.templateId });
			}
		}
		if (msg.type === 'project') {
			const previous = project?.templateId;
			project = msg.project;
			renderTemplate();
			renderDoc();
			if (project?.templateId && project.templateId !== previous) {
				vscode.postMessage({ type: 'updateTemplate', templateId: project.templateId });
			}
		}
		if (msg.type === 'status') {
			setStatus(msg.status);
		}
	});

	renderTemplate();
	renderDoc();
	vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
