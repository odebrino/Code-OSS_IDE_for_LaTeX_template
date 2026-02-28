/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unexternalized-strings */

import * as vscode from 'vscode';

export type CorrecaoStatus = {
	state: 'idle' | 'building' | 'success' | 'error';
	message?: string;
};

export type CorrecaoTaskSummary = {
	id: string;
	label: string;
};

export type CorrecaoFieldSummary = {
	key: string;
	label: string;
	type: 'string' | 'string[]';
};

export type CorrecaoRevisionSummary = {
	id: string;
	label: string;
	createdAt?: string;
	parent?: string;
	isBase?: boolean;
};

export type CorrecaoOpSummary = {
	op: 'replace' | 'insert' | 'comment';
	start?: number;
	end?: number;
	at?: number;
	text: string;
	status?: 'pending' | 'accepted' | 'rejected';
};

export type CorrecaoState = {
	tasks: CorrecaoTaskSummary[];
	selectedTaskId?: string;
	fields: CorrecaoFieldSummary[];
	selectedFieldKey?: string;
	revisions: CorrecaoRevisionSummary[];
	selectedRevisionId?: string;
	ops: CorrecaoOpSummary[];
	text: string;
	status: CorrecaoStatus;
	buildError?: string;
	buildLogPath?: string;
};

type MessageHandler = (message: any, webview: vscode.Webview) => void | Promise<void>;

export class CorrecaoViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private readonly uiBuildId: string;
	private lastHtmlBuildId?: string;
	private state: CorrecaoState;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly onMessage: MessageHandler,
		private readonly getState: () => CorrecaoState,
		uiBuildId: string
	) {
		this.uiBuildId = uiBuildId;
		this.state = getState();
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
			}
		});
	}

	sendState(state: CorrecaoState) {
		this.state = state;
		this.view?.webview.postMessage({ type: 'state', state });
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
		this.state = this.getState();
		this.view.webview.html = getCorrecaoHtml(this.view.webview, this.state, this.uiBuildId);
		this.lastHtmlBuildId = this.uiBuildId;
	}
}

export function registerCorrecaoView(
	context: vscode.ExtensionContext,
	onMessage: MessageHandler,
	getState: () => CorrecaoState
) {
	const provider = new CorrecaoViewProvider(context, onMessage, getState, getUiBuildId(context));
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('co.correcao.mainView', provider)
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

function getCorrecaoHtml(webview: vscode.Webview, state: CorrecaoState, uiBuildId: string): string {
	const nonce = getNonce();
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} blob:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src 'nonce-${nonce}'`
	].join('; ');
	const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');
	const safeBuildId = escapeHtml(uiBuildId);

	return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Correcao</title>
<style>
	:root {
		--bg: radial-gradient(120% 70% at 10% -10%, rgba(248, 113, 113, 0.18), transparent 55%),
			radial-gradient(120% 70% at 90% -20%, rgba(56, 189, 248, 0.18), transparent 55%),
			var(--vscode-sideBar-background, #f7f4ef);
		--surface: var(--vscode-editor-background, #ffffff);
		--card-bg: linear-gradient(120deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.04) 45%), var(--surface);
		--card-border: var(--vscode-panel-border, rgba(0, 0, 0, 0.12));
		--text: var(--vscode-foreground, #222222);
		--muted: var(--vscode-descriptionForeground, rgba(100, 100, 100, 0.8));
		--accent: #ef4444;
		--accent-strong: #f97316;
		--shadow: 0 16px 30px rgba(0, 0, 0, 0.18);
		--radius: 14px;
		--font-display: "Playfair Display", "Times New Roman", serif;
		--font-body: "Source Sans 3", "Segoe UI", sans-serif;
	}
	body {
		font-family: var(--font-body);
		font-size: 14px;
		line-height: 1.45;
		margin: 0;
		padding: 16px;
		color: var(--text);
		background: var(--bg);
		min-height: 100vh;
		background-attachment: fixed;
	}
	.container {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.hero {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.eyebrow {
		font-size: 10px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.hero h1 {
		font-family: var(--font-display);
		font-size: 24px;
		margin: 4px 0 6px;
	}
	.lead {
		margin: 0;
		font-size: 13px;
		color: var(--muted);
		max-width: 42ch;
	}
	.status-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid var(--card-border);
		background: rgba(8, 8, 8, 0.5);
		font-size: 12px;
		color: var(--text);
	}
	.status-chip::before {
		content: '';
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--muted);
		box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.05);
	}
	.status-chip[data-state="building"]::before { background: #f97316; }
	.status-chip[data-state="success"]::before { background: #22c55e; }
	.status-chip[data-state="error"]::before { background: #ef4444; }
	.card {
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: var(--radius);
		padding: 16px;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.card-title {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--muted);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	label {
		font-size: 12px;
		color: var(--muted);
	}
	input, select, textarea, button {
		font-family: inherit;
	}
	input, select, textarea {
		padding: 8px 10px;
		border-radius: 10px;
		border: 1px solid var(--card-border);
		background: rgba(0, 0, 0, 0.06);
		color: inherit;
	}
	textarea {
		min-height: 160px;
		resize: vertical;
		font-size: 13px;
		line-height: 1.4;
	}
	button {
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		padding: 8px 12px;
		cursor: pointer;
		font-size: 12px;
	}
	button.secondary {
		background: transparent;
		color: var(--text);
		border: 1px solid var(--card-border);
	}
	button.ghost {
		background: transparent;
		color: var(--text);
		border: 1px dashed var(--card-border);
	}
	button:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.ops-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.op-item {
		border: 1px solid var(--card-border);
		border-radius: 10px;
		padding: 8px;
		background: rgba(0, 0, 0, 0.05);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.op-meta {
		font-size: 11px;
		color: var(--muted);
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.op-text {
		font-size: 12px;
		white-space: pre-wrap;
	}
	.error-line {
		font-size: 12px;
		color: #ef4444;
		min-height: 18px;
	}
	.hidden { display: none; }
	.build-id { font-size: 11px; color: var(--muted); text-align: right; }
</style>
</head>
<body>
	<div class="container">
		<div class="hero">
			<div>
				<div class="eyebrow">CO</div>
				<h1>Correcao</h1>
				<p class="lead">Sugestoes por revisao para atualizar o texto e gerar o PDF corrigido.</p>
			</div>
			<div class="status-chip" id="status" data-state="idle">Aguardando</div>
		</div>

		<section class="card">
			<div class="card-title">Tarefa</div>
			<div class="field">
				<label for="taskSelect">Selecionar tarefa</label>
				<select id="taskSelect"></select>
			</div>
			<div class="field">
				<label for="fieldSelect">Campo do texto</label>
				<select id="fieldSelect"></select>
			</div>
			<div class="row">
				<button id="refreshButton" class="secondary" type="button">Atualizar tarefas</button>
				<button id="openLogButton" class="ghost" type="button">Abrir log completo</button>
			</div>
			<div id="buildError" class="error-line"></div>
		</section>

		<section class="card">
			<div class="card-title">Revisoes e sugestoes</div>
			<div class="field">
				<label for="revisionSelect">Revisao</label>
				<select id="revisionSelect"></select>
			</div>
			<div class="row">
				<button id="newRevisionButton" type="button">Nova revisao</button>
			</div>
			<div id="opsList" class="ops-list"></div>
			<div id="opsEmpty" class="error-line hidden">Nenhuma sugestao nesta revisao.</div>
		</section>

		<section class="card">
			<div class="card-title">Texto</div>
			<textarea id="textArea" readonly></textarea>
			<div class="field">
				<label for="opType">Tipo de sugestao</label>
				<select id="opType">
					<option value="replace">Substituir selecao</option>
					<option value="insert">Inserir no cursor</option>
					<option value="comment">Comentario</option>
				</select>
			</div>
			<div class="field">
				<label for="opText">Texto da sugestao</label>
				<textarea id="opText" placeholder="Digite a sugestao..."></textarea>
			</div>
			<div class="row">
				<button id="addOpButton" type="button">Adicionar sugestao</button>
				<span id="formError" class="error-line"></span>
			</div>
		</section>

		<div class="build-id">UI build ${safeBuildId}</div>
	</div>

<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	let state = ${stateJson};

	const statusEl = document.getElementById('status');
	const taskSelect = document.getElementById('taskSelect');
	const fieldSelect = document.getElementById('fieldSelect');
	const revisionSelect = document.getElementById('revisionSelect');
	const opsList = document.getElementById('opsList');
	const opsEmpty = document.getElementById('opsEmpty');
	const textArea = document.getElementById('textArea');
	const opType = document.getElementById('opType');
	const opText = document.getElementById('opText');
	const addOpButton = document.getElementById('addOpButton');
	const newRevisionButton = document.getElementById('newRevisionButton');
	const refreshButton = document.getElementById('refreshButton');
	const openLogButton = document.getElementById('openLogButton');
	const buildErrorEl = document.getElementById('buildError');
	const formError = document.getElementById('formError');

	function setState(next) {
		state = next || { tasks: [], fields: [], revisions: [], ops: [], text: '', status: { state: 'idle' } };
		render();
	}

	function renderStatus() {
		const status = state.status || { state: 'idle' };
		statusEl.dataset.state = status.state || 'idle';
		statusEl.textContent = status.message || (status.state === 'building' ? 'Gerando PDF...' : status.state === 'success' ? 'PDF atualizado' : status.state === 'error' ? 'Falha ao gerar' : 'Aguardando');
		buildErrorEl.textContent = state.buildError || '';
		openLogButton.classList.toggle('hidden', !state.buildLogPath);
	}

	function renderTasks() {
		const tasks = Array.isArray(state.tasks) ? state.tasks : [];
		taskSelect.innerHTML = '';
		if (!tasks.length) {
			const option = document.createElement('option');
			option.value = '';
			option.textContent = 'Nenhuma tarefa encontrada';
			taskSelect.appendChild(option);
			taskSelect.disabled = true;
			return;
		}
		taskSelect.disabled = false;
		tasks.forEach(task => {
			const option = document.createElement('option');
			option.value = task.id;
			option.textContent = task.label;
			taskSelect.appendChild(option);
		});
		taskSelect.value = state.selectedTaskId || tasks[0].id;
	}

	function renderFields() {
		const fields = Array.isArray(state.fields) ? state.fields : [];
		fieldSelect.innerHTML = '';
		if (!fields.length) {
			const option = document.createElement('option');
			option.value = '';
			option.textContent = 'Nenhum campo';
			fieldSelect.appendChild(option);
			fieldSelect.disabled = true;
			return;
		}
		fieldSelect.disabled = false;
		fields.forEach(field => {
			const option = document.createElement('option');
			option.value = field.key;
			option.textContent = field.label;
			fieldSelect.appendChild(option);
		});
		fieldSelect.value = state.selectedFieldKey || fields[0].key;
	}

	function renderRevisions() {
		const revisions = Array.isArray(state.revisions) ? state.revisions : [];
		revisionSelect.innerHTML = '';
		if (!revisions.length) {
			const option = document.createElement('option');
			option.value = 'base';
			option.textContent = 'Base';
			revisionSelect.appendChild(option);
			revisionSelect.disabled = true;
			return;
		}
		revisionSelect.disabled = false;
		revisions.forEach(revision => {
			const option = document.createElement('option');
			option.value = revision.id;
			option.textContent = revision.label;
			revisionSelect.appendChild(option);
		});
		revisionSelect.value = state.selectedRevisionId || 'base';
	}

	function renderOps() {
		const ops = Array.isArray(state.ops) ? state.ops : [];
		opsList.innerHTML = '';
		if (!ops.length) {
			opsEmpty.classList.remove('hidden');
			return;
		}
		opsEmpty.classList.add('hidden');
		ops.forEach((op, index) => {
			const container = document.createElement('div');
			container.className = 'op-item';
			const meta = document.createElement('div');
			meta.className = 'op-meta';
			meta.textContent = op.op + ' • ' + (op.status || 'pending');
			const text = document.createElement('div');
			text.className = 'op-text';
			text.textContent = op.text || '';
			container.appendChild(meta);
			container.appendChild(text);
			if (op.op !== 'comment') {
				const actions = document.createElement('div');
				actions.className = 'row';
				const accept = document.createElement('button');
				accept.className = 'secondary';
				accept.type = 'button';
				accept.textContent = 'Aceitar';
				accept.addEventListener('click', () => {
					vscode.postMessage({ type: 'acceptSuggestion', revisionId: state.selectedRevisionId, index });
				});
				const reject = document.createElement('button');
				reject.className = 'secondary';
				reject.type = 'button';
				reject.textContent = 'Rejeitar';
				reject.addEventListener('click', () => {
					vscode.postMessage({ type: 'rejectSuggestion', revisionId: state.selectedRevisionId, index });
				});
				actions.appendChild(accept);
				actions.appendChild(reject);
				container.appendChild(actions);
			}
			opsList.appendChild(container);
		});
	}

	function renderText() {
		textArea.value = state.text || '';
	}

	function render() {
		renderStatus();
		renderTasks();
		renderFields();
		renderRevisions();
		renderOps();
		renderText();
	}

	function reportFormError(message) {
		formError.textContent = message || '';
	}

	taskSelect.addEventListener('change', () => {
		vscode.postMessage({ type: 'selectTask', taskId: taskSelect.value });
	});

	fieldSelect.addEventListener('change', () => {
		vscode.postMessage({ type: 'selectField', key: fieldSelect.value });
	});

	revisionSelect.addEventListener('change', () => {
		vscode.postMessage({ type: 'selectRevision', revisionId: revisionSelect.value });
	});

	newRevisionButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'newRevision' });
	});

	refreshButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'refreshTasks' });
	});

	openLogButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'openBuildLog' });
	});

	addOpButton.addEventListener('click', () => {
		reportFormError('');
		const text = opText.value || '';
		if (!text.trim()) {
			reportFormError('Digite o texto da sugestao.');
			return;
		}
		const start = textArea.selectionStart;
		const end = textArea.selectionEnd;
		const type = opType.value;
		if ((type === 'replace' || type === 'comment') && start === end) {
			reportFormError('Selecione um trecho do texto para substituir/comentar.');
			return;
		}
		vscode.postMessage({
			type: 'addSuggestion',
			opType: type,
			start,
			end,
			at: start,
			text
		});
		opText.value = '';
	});

	window.addEventListener('message', event => {
		const message = event.data || {};
		if (message.type === 'state') {
			setState(message.state);
		}
	});

	render();
	vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i += 1) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}
