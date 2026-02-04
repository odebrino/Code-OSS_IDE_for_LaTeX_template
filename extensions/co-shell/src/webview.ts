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

export class DiagramadorViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly onMessage: MessageHandler,
		private readonly getProject: () => DiagramadorProject,
		private readonly onVisible?: () => void
	) { }

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri]
		};
		view.webview.html = getDiagramadorHtml(view.webview, this.getProject());
		view.webview.onDidReceiveMessage(message => this.onMessage(message, view.webview));
		view.onDidChangeVisibility(() => {
			if (view.visible) {
				this.onVisible?.();
			}
		});
	}

	sendProject(project: DiagramadorProject) {
		this.view?.webview.postMessage({ type: 'project', project });
	}

	sendStatus(status: DiagramadorStatus) {
		this.view?.webview.postMessage({ type: 'status', status });
	}

	show(preserveFocus = true) {
		this.view?.show(preserveFocus);
	}
}

export function registerDiagramadorView(
	context: vscode.ExtensionContext,
	onMessage: MessageHandler,
	getProject: () => DiagramadorProject,
	onVisible?: () => void
) {
	const provider = new DiagramadorViewProvider(context, onMessage, getProject, onVisible);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('co.diagramador.blocksView', provider)
	);
	return provider;
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

function getDiagramadorHtml(webview: vscode.Webview, project: DiagramadorProject): string {
	const nonce = getNonce();
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} blob:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src 'nonce-${nonce}'`
	].join('; ');
	const projectJson = JSON.stringify(project).replace(/</g, '\\u003c');

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
	h2 {
		margin: 0 0 8px 0;
		font-size: 14px;
	}
	.card {
		background: var(--vscode-editor-background, #fff);
		border: 1px solid var(--vscode-panel-border, #ddd);
		border-radius: 8px;
		padding: 10px;
		margin-bottom: 10px;
	}
	.status {
		font-size: 12px;
		color: var(--vscode-foreground, #444);
		margin-bottom: 8px;
	}
	.status[data-state="error"] { color: #a33; }
	.status[data-state="success"] { color: #2d7ef7; }
	label { display: block; font-size: 12px; margin: 6px 0 4px; }
	input, textarea, select, button {
		width: 100%;
		box-sizing: border-box;
		padding: 6px 8px;
		border-radius: 6px;
		border: 1px solid var(--vscode-input-border, #ccc);
		background: var(--vscode-input-background, #fff);
		color: inherit;
		font-size: 12px;
	}
	textarea { resize: vertical; min-height: 60px; }
	button {
		background: #2d7ef7;
		color: #fff;
		border: none;
		cursor: pointer;
	}
	button.secondary { background: #5c6b7a; }
	button:disabled { opacity: 0.5; cursor: not-allowed; }
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.blocks-header {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px;
		margin-bottom: 8px;
	}
	.block-item {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		align-items: center;
		width: 100%;
		background: transparent;
		color: inherit;
		border: 1px solid transparent;
		padding: 6px 8px;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
	}
	.block-item.selected {
		border-color: #2d7ef7;
		background: rgba(45, 126, 247, 0.12);
	}
	.block-tag {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #555;
	}
	.block-summary {
		flex: 1;
		font-size: 12px;
		color: inherit;
		text-align: right;
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px;
		margin-top: 8px;
	}
	.empty {
		font-size: 12px;
		color: #666;
		padding: 8px 0;
	}
</style>
</head>
<body>
	<div class="status" id="status" data-state="idle"></div>

	<section class="card">
		<h2>Cabecalho</h2>
		<div class="row">
			<div>
				<label for="header-name">Nome</label>
				<input id="header-name" type="text" />
			</div>
			<div>
				<label for="header-turma">Turma</label>
				<input id="header-turma" type="text" />
			</div>
			<div>
				<label for="header-disciplina">Disciplina</label>
				<input id="header-disciplina" type="text" />
			</div>
			<div>
				<label for="header-professor">Professor</label>
				<input id="header-professor" type="text" />
			</div>
			<div>
				<label for="header-date">Data</label>
				<input id="header-date" type="text" placeholder="dd/mm/aaaa" />
			</div>
		</div>
	</section>

	<section class="card">
		<h2>Blocos</h2>
		<div class="blocks-header">
			<select id="newBlockType">
				<option value="title">Titulo</option>
				<option value="text">Texto</option>
				<option value="section">Secao</option>
				<option value="question">Questao</option>
				<option value="image">Imagem</option>
			</select>
			<button id="addBlock">Adicionar</button>
		</div>
		<div id="blocksList"></div>
		<div class="actions">
			<button id="moveUp" class="secondary">Mover acima</button>
			<button id="moveDown" class="secondary">Mover abaixo</button>
			<button id="duplicate">Duplicar</button>
			<button id="remove" class="secondary">Remover</button>
		</div>
	</section>

	<section class="card">
		<h2>Editor do bloco</h2>
		<div id="blockEditor" class="empty">Selecione um bloco.</div>
	</section>

<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	let project = ${projectJson};
	let selectedId = project.blocks && project.blocks.length ? project.blocks[0].id : null;

	const statusEl = document.getElementById('status');
	const blocksList = document.getElementById('blocksList');
	const editorEl = document.getElementById('blockEditor');

	const headerFields = {
		name: document.getElementById('header-name'),
		turma: document.getElementById('header-turma'),
		disciplina: document.getElementById('header-disciplina'),
		professor: document.getElementById('header-professor'),
		date: document.getElementById('header-date')
	};

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function blockLabel(type) {
		switch (type) {
			case 'title': return 'Titulo';
			case 'text': return 'Texto';
			case 'section': return 'Secao';
			case 'question': return 'Questao';
			case 'image': return 'Imagem';
			default: return 'Bloco';
		}
	}

	function blockSummary(block) {
		const value = block.text || block.title || block.statement || block.caption || '';
		const trimmed = String(value).trim();
		return trimmed ? trimmed.slice(0, 30) : '...';
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

	function renderHeader() {
		const header = project.header || {};
		headerFields.name.value = header.name || '';
		headerFields.turma.value = header.turma || '';
		headerFields.disciplina.value = header.disciplina || '';
		headerFields.professor.value = header.professor || '';
		headerFields.date.value = header.date || '';

		Object.keys(headerFields).forEach((field) => {
			const input = headerFields[field];
			input.oninput = () => {
				project.header = project.header || {};
				project.header[field] = input.value;
				vscode.postMessage({ type: 'updateHeader', field, value: input.value });
			};
		});
	}

	function renderBlocks() {
		blocksList.innerHTML = '';
		if (!project.blocks || project.blocks.length === 0) {
			blocksList.innerHTML = '<div class="empty">Nenhum bloco adicionado.</div>';
			return;
		}
		project.blocks.forEach(block => {
			const button = document.createElement('button');
			button.className = 'block-item' + (block.id === selectedId ? ' selected' : '');
			button.dataset.id = block.id;
			button.innerHTML = '<span class="block-tag">' + escapeHtml(blockLabel(block.type)) + '</span>' +
				'<span class="block-summary">' + escapeHtml(blockSummary(block)) + '</span>';
			button.addEventListener('click', () => {
				selectedId = block.id;
				renderBlocks();
				renderEditor();
				updateActions();
			});
			blocksList.appendChild(button);
		});
	}

	function renderEditor() {
		const block = project.blocks ? project.blocks.find(item => item.id === selectedId) : null;
		if (!block) {
			editorEl.className = 'empty';
			editorEl.textContent = 'Selecione um bloco.';
			return;
		}
		editorEl.className = '';
		editorEl.innerHTML = '';
		if (block.type === 'title') {
			editorEl.innerHTML = '<label>Titulo</label><input id="block-text" type="text" />';
			const input = document.getElementById('block-text');
			input.value = block.text || '';
			input.oninput = () => {
				block.text = input.value;
				vscode.postMessage({ type: 'updateBlock', id: block.id, patch: { text: input.value } });
			};
		} else if (block.type === 'section') {
			editorEl.innerHTML = '<label>Secao</label><input id="block-title" type="text" />';
			const input = document.getElementById('block-title');
			input.value = block.title || '';
			input.oninput = () => {
				block.title = input.value;
				vscode.postMessage({ type: 'updateBlock', id: block.id, patch: { title: input.value } });
			};
		} else if (block.type === 'text') {
			editorEl.innerHTML = '<label>Texto</label><textarea id="block-text"></textarea>';
			const input = document.getElementById('block-text');
			input.value = block.text || '';
			input.oninput = () => {
				block.text = input.value;
				vscode.postMessage({ type: 'updateBlock', id: block.id, patch: { text: input.value } });
			};
		} else if (block.type === 'question') {
			editorEl.innerHTML = '<label>Enunciado</label><textarea id="block-statement"></textarea>' +
				'<label>Linhas de resposta</label><input id="block-lines" type="number" min="1" step="1" />';
			const statement = document.getElementById('block-statement');
			const lines = document.getElementById('block-lines');
			statement.value = block.statement || '';
			lines.value = block.lines || 1;
			statement.oninput = () => {
				block.statement = statement.value;
				vscode.postMessage({ type: 'updateBlock', id: block.id, patch: { statement: statement.value } });
			};
			lines.oninput = () => {
				const value = Math.max(1, Number(lines.value || 1));
				block.lines = value;
				lines.value = value;
				vscode.postMessage({ type: 'updateBlock', id: block.id, patch: { lines: value } });
			};
		} else if (block.type === 'image') {
			editorEl.innerHTML = '<label>Imagem</label>' +
				'<div class="empty" id="assetLabel"></div>' +
				'<button id="pickImage">Selecionar imagem</button>' +
				'<label>Legenda</label><input id="block-caption" type="text" />';
			const assetLabel = document.getElementById('assetLabel');
			assetLabel.textContent = block.asset ? block.asset : 'Nenhuma imagem selecionada.';
			const caption = document.getElementById('block-caption');
			caption.value = block.caption || '';
			caption.oninput = () => {
				block.caption = caption.value;
				vscode.postMessage({ type: 'updateBlock', id: block.id, patch: { caption: caption.value } });
			};
			document.getElementById('pickImage').addEventListener('click', () => {
				vscode.postMessage({ type: 'pickImage', id: block.id });
			});
		}
	}

	function updateActions() {
		const hasBlock = Boolean(selectedId);
		document.getElementById('duplicate').disabled = !hasBlock;
		document.getElementById('remove').disabled = !hasBlock;
		document.getElementById('moveUp').disabled = !hasBlock;
		document.getElementById('moveDown').disabled = !hasBlock;
	}

	document.getElementById('addBlock').addEventListener('click', () => {
		const type = document.getElementById('newBlockType').value;
		vscode.postMessage({ type: 'addBlock', blockType: type });
	});

	document.getElementById('duplicate').addEventListener('click', () => {
		if (selectedId) {
			vscode.postMessage({ type: 'duplicateBlock', id: selectedId });
		}
	});

	document.getElementById('remove').addEventListener('click', () => {
		if (selectedId) {
			vscode.postMessage({ type: 'removeBlock', id: selectedId });
		}
	});

	document.getElementById('moveUp').addEventListener('click', () => {
		if (selectedId) {
			vscode.postMessage({ type: 'moveBlock', id: selectedId, direction: -1 });
		}
	});

	document.getElementById('moveDown').addEventListener('click', () => {
		if (selectedId) {
			vscode.postMessage({ type: 'moveBlock', id: selectedId, direction: 1 });
		}
	});

	window.addEventListener('message', (event) => {
		const msg = event.data;
		if (msg.type === 'project') {
			project = msg.project;
			if (!project.blocks || project.blocks.length === 0) {
				selectedId = null;
			} else if (!selectedId || !project.blocks.find(item => item.id === selectedId)) {
				selectedId = project.blocks[0].id;
			}
			renderHeader();
			renderBlocks();
			renderEditor();
			updateActions();
		}
		if (msg.type === 'status') {
			setStatus(msg.status);
		}
	});

	renderHeader();
	renderBlocks();
	renderEditor();
	updateActions();
	vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
