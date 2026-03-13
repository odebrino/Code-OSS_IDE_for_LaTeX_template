/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fsSync from 'fs';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { openHomePanel, registerAdminView } from './webview';
import {
	isAdminEmailForList,
	loadAdminsFrom,
	resolveExistingAdminsPath
} from './lib/admins';
import { createCoShellTestingHooks } from './testing/hooks';

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

export async function activate(context: vscode.ExtensionContext) {
	const messageHandler = createMessageHandler(context);
	registerAdminView(context, messageHandler);

	context.subscriptions.push(
		vscode.commands.registerCommand('coShell.openStudentHome', async () => {
			await setRole(context, 'student');
			await enterStudentMode(context);
		}),
		vscode.commands.registerCommand('coShell.openAdminHome', async () => {
			await setRole(context, 'admin');
			await enterAdminMode(context);
		}),
		vscode.commands.registerCommand('coShell.enterAdminMode', async () => {
			const email = await vscode.window.showInputBox({
				prompt: 'Admin email',
				placeHolder: 'admin email'
			});
			if (!email) {
				return;
			}
			const admins = await loadAdmins(context);
			if (!admins.length) {
				vscode.window.showErrorMessage('Nenhuma lista de admins valida foi encontrada. Verifique coShell.adminsFile ou co-secret/config/admins.json.');
				return;
			}
			const ok = isAdminEmailForList(email, admins);
			if (!ok) {
				vscode.window.showErrorMessage('Email nao esta na whitelist de admins.');
				return;
			}
			await setRole(context, 'admin');
			await enterAdminMode(context);
		})
	);

	if (process.env.CO_TESTING === '1') {
		const config = vscode.workspace.getConfiguration('coShell');
		const configuredPath = config.get<string>('adminsFile');
		const hooks = createCoShellTestingHooks({
			extensionPath: context.extensionPath,
			configuredPath,
			cwd: process.cwd(),
			existsSync: target => fsSync.existsSync(target)
		});
		return {
			__test: {
				resolveAdminsPathCandidates: () => hooks.resolveAdminsPathCandidates(),
				loadAdminsFrom: (filePath?: string) => hooks.loadAdminsFrom(filePath),
				isAdminEmail: (email: string, admins?: string[]) => hooks.isAdminEmail(email, admins)
			}
		};
	}

	return undefined;
}

async function setRole(context: vscode.ExtensionContext, role: Role) {
	currentRole = role;
	await context.globalState.update(ROLE_KEY, role);
	await vscode.commands.executeCommand('setContext', 'co.role', role);
}

async function enterStudentMode(context: vscode.ExtensionContext) {
	await hideUiForStudent(context);
	try {
		await vscode.commands.executeCommand('co.diagramador.open');
		return;
	} catch {
		// best effort
	}
	openHomePanel(context, 'student', createMessageHandler(context));
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

async function loadAdmins(context: vscode.ExtensionContext): Promise<string[]> {
	const config = vscode.workspace.getConfiguration('coShell');
	const configuredPath = config.get<string>('adminsFile');
	const adminFile = resolveAdminsFilePath(context.extensionPath, configuredPath);
	if (!adminFile) {
		return [];
	}
	return loadAdminsFrom(adminFile);
}

function resolveAdminsFilePath(extensionPath: string, configuredPath: string | undefined): string | undefined {
	return resolveExistingAdminsPath(
		{
			extensionPath,
			configuredPath,
			cwd: process.cwd()
		},
		target => fsSync.existsSync(target)
	);
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

export function deactivate() { }
