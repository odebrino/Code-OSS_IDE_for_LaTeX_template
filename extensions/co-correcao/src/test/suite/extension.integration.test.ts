/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

type CorrecaoTestApi = {
	__test: {
		getStateSnapshot: () => {
			tasks: Array<{ id: string; label: string }>;
			selectedTaskId?: string;
			fields: Array<{ key: string; type: string }>;
			buildError?: string;
			runtimeInfo?: { outDir?: string; baseDir?: string };
		};
		open: () => Promise<void>;
		refreshTasks: () => Promise<void>;
		selectTask: (taskId: string) => Promise<void>;
		getStorageSnapshot: () => { diagramadorBaseDir: string; correctionsBaseDir: string };
	};
};

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

async function getApi() {
	const extension = vscode.extensions.getExtension<CorrecaoTestApi>('odebrino.co-correcao');
	assert.ok(extension);
	const api = await extension!.activate();
	assert.ok(api?.__test);
	return api.__test;
}

suite('CO Correcao Extension Integration', () => {
	test('ativa extensao e resolve paths compartilhados', async () => {
		const api = await getApi();
		const storage = api.getStorageSnapshot();
		assert.match(storage.diagramadorBaseDir, /\.co[\/\\]diagramador$/);
		assert.match(storage.correctionsBaseDir, /\.co[\/\\]corrections$/);
	});

	test('[smoke] carrega tarefa da fixture e prepara preview/runtime', async () => {
		const api = await getApi();
		await api.refreshTasks();
		const before = api.getStateSnapshot();
		assert.ok(before.tasks.some(task => /Fixture/i.test(task.label)));

		const target = before.tasks.find(task => /Fixture/i.test(task.label));
		assert.ok(target);
		await api.selectTask(target!.id);
		await api.open();

		const state = api.getStateSnapshot();
		assert.strictEqual(state.selectedTaskId, target!.id);
		assert.ok(state.fields.some(field => field.key === 'texto'));
		assert.ok(state.runtimeInfo?.outDir);
	});
});
