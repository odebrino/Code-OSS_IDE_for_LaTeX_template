/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unexternalized-strings */

import * as vscode from 'vscode';

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

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
