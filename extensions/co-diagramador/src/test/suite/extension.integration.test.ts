/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

type DiagramadorTestApi = {
	__test: {
		getStateSnapshot: () => {
			viewMode?: 'list' | 'task';
			currentTaskId?: string;
			currentTaskLabel?: string;
			currentTaskType?: string;
			currentTemplateId?: string;
			currentTemplateName?: string;
			runtimeInfo?: { baseDir?: string; outDir?: string; relocated?: boolean; reason?: string };
			status: { state: string };
			buildError?: string;
			buildLogPath?: string;
			schema?: Array<{ key: string; type: string; label: string }>;
			preview?: { state?: string; message?: string };
		};
		dispatchMessage: (message: Record<string, any>) => Promise<Array<{ type: string; requestId?: string; accepted?: boolean }>>;
		open: () => Promise<void>;
		queueConfirmResult: (accepted: boolean) => void;
		queueInputResult: (value: string | undefined) => void;
		queueQuickPickIndex: (index: number) => void;
		setBuildOutcome: (scope: 'document' | 'template', outcome: { ok: boolean; friendly?: string; notFound?: boolean }) => void;
		getPreviewCalls: () => Array<{ scope: 'document' | 'template'; method: 'open' | 'refresh' | 'showStatus'; path: string; message?: string }>;
		listTaskFiles: () => Promise<string[]>;
		readTask: (taskId: string) => Promise<{ templateId: string; data: Record<string, any> } | null>;
		readTemplateManifest: (templateId: string) => Promise<Record<string, any> | undefined>;
	};
};

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

async function getApi() {
	const extension = vscode.extensions.getExtension<DiagramadorTestApi>('odebrino.co-diagramador');
	assert.ok(extension);
	const api = await extension!.activate();
	assert.ok(api?.__test);
	return api.__test;
}

suite('CO Diagramador Extension Integration', () => {
	test('ativa extensao e comando open sem throw', async () => {
		await getApi();
		await vscode.commands.executeCommand('co.diagramador.open');
	});

	test('createTask persiste metadados, entra em modo task e usa runtime visivel', async () => {
		const api = await getApi();
		api.setBuildOutcome('document', { ok: true });

		await api.dispatchMessage({
			type: 'createTask',
			label: 'Lista 01',
			taskType: 'teorica',
			templateId: 'tarefa'
		});

		const state = api.getStateSnapshot();
		assert.strictEqual(state.viewMode, 'task');
		assert.ok(state.currentTaskId);
		assert.strictEqual(state.currentTaskLabel, 'Lista 01');
		assert.strictEqual(state.currentTaskType, 'teorica');
		assert.strictEqual(state.currentTemplateId, 'tarefa');
		assert.strictEqual(state.currentTemplateName, 'Tarefa');
		assert.ok(state.buildLogPath);
		assert.ok(state.runtimeInfo?.outDir);
		assert.match(state.runtimeInfo?.outDir ?? '', /co-runtime/i);

		const files = await api.listTaskFiles();
		assert.ok(files.some(file => file.includes(state.currentTaskId!)));

		const task = await api.readTask(state.currentTaskId!);
		assert.ok(task);
		assert.strictEqual(task?.templateId, 'tarefa');
		assert.strictEqual(task?.data.TaskLabel, 'Lista 01');
		assert.strictEqual(task?.data.TaskType, 'teorica');
	});

	test('createTask permite escolher oficio e carrega schema correspondente', async () => {
		const api = await getApi();
		api.setBuildOutcome('document', { ok: true });

		await api.dispatchMessage({
			type: 'createTask',
			label: 'Oficio 01',
			taskType: 'pratica',
			templateId: 'oficio'
		});

		const state = api.getStateSnapshot();
		assert.strictEqual(state.currentTaskType, 'pratica');
		assert.strictEqual(state.currentTemplateId, 'oficio');
		assert.ok(state.schema?.some(field => field.key === 'destinatario'));
		assert.ok(state.schema?.some(field => field.key === 'assunto'));
		assert.ok(state.schema?.some(field => field.key === 'texto'));
	});

	test('openTask reabre uma tarefa existente a partir da lista', async () => {
		const api = await getApi();
		api.setBuildOutcome('document', { ok: true });
		await api.dispatchMessage({
			type: 'createTask',
			label: 'Lista para abrir',
			taskType: 'teorica',
			templateId: 'tarefa'
		});
		const createdTaskId = api.getStateSnapshot().currentTaskId!;

		await api.dispatchMessage({ type: 'backToList' });
		let state = api.getStateSnapshot();
		assert.strictEqual(state.viewMode, 'list');
		assert.strictEqual(state.currentTaskId ?? '', '');

		await api.dispatchMessage({ type: 'openTask', taskId: createdTaskId });
		state = api.getStateSnapshot();
		assert.strictEqual(state.viewMode, 'task');
		assert.strictEqual(state.currentTaskId, createdTaskId);

		const previewCalls = api.getPreviewCalls().filter(call => call.scope === 'document');
		assert.ok(previewCalls.some(call => call.method === 'showStatus' && /Gerando PDF|Aguardando geracao/i.test(call.message ?? '')));
	});

	test('backToList limpa o editor e restaura placeholder da preview', async () => {
		const api = await getApi();
		api.setBuildOutcome('document', { ok: true });
		await api.dispatchMessage({
			type: 'createTask',
			label: 'Lista 02',
			taskType: 'teorica',
			templateId: 'tarefa'
		});

		await api.dispatchMessage({ type: 'backToList' });
		const state = api.getStateSnapshot();
		assert.strictEqual(state.viewMode, 'list');
		assert.strictEqual(state.currentTaskId ?? '', '');
		assert.strictEqual(state.preview?.state, 'idle');
		assert.match(state.preview?.message ?? '', /Selecione ou crie/i);
	});

	test('templates gerenciados ficam disponiveis de forma deterministica', async () => {
		const api = await getApi();
		const tarefaManifest = await api.readTemplateManifest('tarefa');
		const oficioManifest = await api.readTemplateManifest('oficio');
		assert.strictEqual(tarefaManifest?.name, 'Tarefa');
		assert.strictEqual(oficioManifest?.name, 'Oficio');
	});

	test('createTask devolve erro de validacao quando payload e invalido', async () => {
		const api = await getApi();
		const messages = await api.dispatchMessage({
			type: 'createTask',
			label: '',
			taskType: 'teorica',
			templateId: 'tarefa'
		});
		assert.ok(messages.some(message => message.type === 'createTaskValidation'));
	});
});
