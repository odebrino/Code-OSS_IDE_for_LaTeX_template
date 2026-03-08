/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unexternalized-strings */

import * as assert from 'assert';
import {
	buildPersistedClientState,
	getDiagramadorClientScript,
	normalizePersistedClientState
} from '../../webviewClient';
import type { DiagramadorState } from '../../protocol';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;

function createState(viewMode: 'list' | 'task' = 'list'): DiagramadorState {
	return {
		templates: [{ id: 'tarefa', name: 'Tarefa' }],
		selectedTemplateId: 'tarefa',
		viewMode,
		schema: [
			{ key: 'texto', type: 'latex', label: 'Texto' },
			{ key: 'alunos', type: 'string[]', label: 'Alunos' }
		],
		data: {
			TaskLabel: 'Lista 01',
			TaskType: 'teorica',
			texto: 'Corpo',
			alunos: ['A', 'B']
		},
		status: { state: 'idle' },
		tasks: [
			{ id: 'tarefa_1', label: 'Lista 01', updatedAt: 1, taskType: 'teorica', templateId: 'tarefa' }
		],
		currentTaskId: viewMode === 'task' ? 'tarefa_1' : '',
		currentTaskLabel: viewMode === 'task' ? 'Lista 01' : '',
		currentTaskType: 'teorica',
		currentTemplateId: viewMode === 'task' ? 'tarefa' : '',
		currentTemplateName: viewMode === 'task' ? 'Tarefa' : '',
		runtimeInfo: {
			baseDir: '/tmp/co-runtime/co-dev/diagramador',
			outDir: '/tmp/co-runtime/co-dev/diagramador/out',
			relocated: false
		},
		preview: { state: 'idle', message: 'Selecione ou crie uma tarefa.' },
		buildDetails: { technicalDetails: [] }
	};
}

suite('Diagramador Webview Client', () => {
	test('normalizePersistedClientState normaliza estrutura invalida', () => {
		const normalized = normalizePersistedClientState({ lastViewMode: 'task' });
		assert.strictEqual(normalized.lastViewMode, 'task');
		assert.strictEqual(normalizePersistedClientState({}).lastViewMode, 'list');
	});

	test('buildPersistedClientState salva apenas o modo da view', () => {
		const persisted = buildPersistedClientState('task');
		assert.deepStrictEqual(persisted, { lastViewMode: 'task' });
	});

	test('script usa fluxo task-first com modal proprio e nao depende da UI antiga', () => {
		const script = getDiagramadorClientScript(JSON.stringify(createState('task')));
		assert.ok(script.includes("type: 'createTask'"));
		assert.ok(script.includes("payload.type === 'createTaskValidation'"));
		assert.ok(script.includes("createTaskModal"));
		assert.ok(script.includes("Criar e abrir"));
		assert.ok(script.includes("type: 'openTask'"));
		assert.ok(script.includes("type: 'backToList'"));
		assert.ok(script.includes("type: 'updateField'"));
		assert.ok(!script.includes("tabDocument"));
		assert.ok(!script.includes("tabTemplates"));
		assert.ok(!script.includes("templateSelect"));
		assert.ok(!script.includes("templateEditor"));
		assert.ok(!script.includes("window.confirm("));
	});

	test('estado task carrega metadados explicitos da tarefa aberta', () => {
		const script = getDiagramadorClientScript(JSON.stringify(createState('task')));
		assert.ok(script.includes('currentTaskLabel'));
		assert.ok(script.includes('currentTaskType'));
		assert.ok(script.includes('currentTemplateName'));
		assert.ok(script.includes('runtimeInfo'));
	});
});
