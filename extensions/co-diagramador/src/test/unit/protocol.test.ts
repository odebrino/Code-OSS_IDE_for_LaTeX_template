/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isDiagramadorWebviewMessage } from '../../protocol';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;

suite('Diagramador Protocol', () => {
	test('aceita mensagens validas do webview', () => {
		assert.strictEqual(isDiagramadorWebviewMessage({ type: 'setTab', tab: 'document' }), true);
		assert.strictEqual(isDiagramadorWebviewMessage({ type: 'createTask', label: 'Lista 01', taskType: 'teorica', templateId: 'tarefa' }), true);
		assert.strictEqual(isDiagramadorWebviewMessage({ type: 'updateField', key: 'texto', value: ['a', 'b'] }), true);
		assert.strictEqual(isDiagramadorWebviewMessage({ type: 'openBuildLog', scope: 'template' }), true);
	});

	test('rejeita mensagens invalidas do webview', () => {
		assert.strictEqual(isDiagramadorWebviewMessage({ type: 'setTab', tab: 'debug' }), false);
		assert.strictEqual(isDiagramadorWebviewMessage({ type: 'createTask', taskType: 'admin' }), false);
		assert.strictEqual(isDiagramadorWebviewMessage({ type: 'updateField', key: 'texto', value: [1, 2] }), false);
		assert.strictEqual(isDiagramadorWebviewMessage({ type: 'templateDeleteAsset', taskId: 'x' }), false);
		assert.strictEqual(isDiagramadorWebviewMessage({ type: 'retryBuild', scope: 'all' }), false);
	});
});
