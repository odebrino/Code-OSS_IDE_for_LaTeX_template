/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

type DataSetTestApi = {
	__test: {
		getStateSnapshot: () => {
			roots: string[];
			items: Array<{ name: string; type: string; pathLabel: string }>;
		};
		getRootsSnapshot: () => Array<{
			id: string;
			label: string;
			diagramadorDir?: string;
			runtimeDirs: string[];
			templateDirs: string[];
		}>;
		refresh: () => Promise<void>;
	};
};

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

async function getApi() {
	const extension = vscode.extensions.getExtension<DataSetTestApi>('odebrino.co-data-set');
	assert.ok(extension);
	const api = await extension!.activate();
	assert.ok(api?.__test);
	return api.__test;
}

suite('CO Data Set Extension Integration', () => {
	test('ativa extensao e encontra roots com runtime resolvido', async () => {
		const api = await getApi();
		await api.refresh();

		const roots = api.getRootsSnapshot();
		assert.ok(roots.length >= 1);
		assert.ok(roots.some(root => root.runtimeDirs.length === 2));
	});

	test('lista tarefa da fixture do diagramador', async () => {
		const api = await getApi();
		await api.refresh();

		const state = api.getStateSnapshot();
		assert.ok(state.roots.length >= 1);
		assert.ok(state.items.some(item => item.type === 'task' && /Fixture/i.test(item.name)));
	});
});
