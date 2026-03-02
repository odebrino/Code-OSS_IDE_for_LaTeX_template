/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

type TemplateManifest = {
	id: string;
	name: string;
	version: string;
	description: string;
	entry: string;
	schema: Array<{ key: string; type: string; label: string }>;
};

type TemplateGeneratorTestApi = {
	__test: {
		listTemplatesNow: () => Promise<TemplateManifest[]>;
		selectTemplate: (id: string) => void;
		getStateSnapshot: () => { templates: TemplateManifest[]; selectedTemplateId?: string };
		buildPreviewNow: () => Promise<{ ok: boolean; friendly: string; notFound: boolean }>;
	};
};

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('CO Template Generator Integration', () => {
	test('ativa extensao sem throw', async () => {
		const extension = vscode.extensions.getExtension<TemplateGeneratorTestApi>('odebrino.co-template-generator');
		assert.ok(extension);
		const api = await extension!.activate();
		assert.ok(api?.__test);
	});

	test('listTemplatesNow retorna ao menos um template', async () => {
		const extension = vscode.extensions.getExtension<TemplateGeneratorTestApi>('odebrino.co-template-generator');
		assert.ok(extension);
		const api = await extension!.activate();
		const templates = await api.__test.listTemplatesNow();
		assert.ok(templates.length >= 1);
	});

	test('selectTemplate atualiza snapshot', async () => {
		const extension = vscode.extensions.getExtension<TemplateGeneratorTestApi>('odebrino.co-template-generator');
		assert.ok(extension);
		const api = await extension!.activate();
		const templates = await api.__test.listTemplatesNow();
		const pick = templates[0];
		api.__test.selectTemplate(pick.id);
		const snapshot = api.__test.getStateSnapshot();
		assert.strictEqual(snapshot.selectedTemplateId, pick.id);
	});

	test('buildPreviewNow trata erro de TECTONIC_PATH ausente sem throw', async () => {
		const extension = vscode.extensions.getExtension<TemplateGeneratorTestApi>('odebrino.co-template-generator');
		assert.ok(extension);
		const api = await extension!.activate();
		const result = await api.__test.buildPreviewNow();
		assert.strictEqual(result.ok, false);
		assert.strictEqual(result.notFound, true);
	});
});
