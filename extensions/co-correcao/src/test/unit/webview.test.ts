/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isCorrecaoWebviewMessage } from '../../protocol';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;

suite('CO Correcao Webview', () => {
	test('aceita mensagens validas do webview', () => {
		assert.strictEqual(isCorrecaoWebviewMessage({ type: 'ready' }), true);
		assert.strictEqual(isCorrecaoWebviewMessage({ type: 'selectTask', taskId: 'tarefa_1' }), true);
		assert.strictEqual(isCorrecaoWebviewMessage({ type: 'addSuggestion', opType: 'replace', start: 1, end: 3, text: 'novo texto' }), true);
		assert.strictEqual(isCorrecaoWebviewMessage({ type: 'acceptSuggestion', revisionId: 'rev_1', index: 0 }), true);
	});

	test('rejeita mensagens invalidas do webview', () => {
		assert.strictEqual(isCorrecaoWebviewMessage({ type: 'selectField', key: 1 }), false);
		assert.strictEqual(isCorrecaoWebviewMessage({ type: 'addSuggestion', opType: 'replace', text: 'x' }), false);
		assert.strictEqual(isCorrecaoWebviewMessage({ type: 'addSuggestion', opType: 'insert', at: -1, text: 'x' }), false);
		assert.strictEqual(isCorrecaoWebviewMessage({ type: 'rejectSuggestion', revisionId: 'rev_1', index: -1 }), false);
		assert.strictEqual(isCorrecaoWebviewMessage({ type: 'unknown' }), false);
	});
});
