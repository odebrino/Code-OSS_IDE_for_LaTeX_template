/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	normalizeCorrectionBaseFile,
	normalizeCorrectionIndexFile,
	normalizeCorrectionRevisionFile
} from '../../persistence';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;

suite('CO Correcao Persistence', () => {
	test('normalizeCorrectionBaseFile rejeita payload incompleto', () => {
		assert.strictEqual(normalizeCorrectionBaseFile({ baseHash: 'abc' }), undefined);
	});

	test('normalizeCorrectionBaseFile aceita templateId vazio para compatibilidade', () => {
		const normalized = normalizeCorrectionBaseFile({
			baseHash: 'hash-1',
			createdAt: '2026-03-12T00:00:00.000Z',
			taskId: 'task-1',
			templateId: '   ',
			fieldKey: 'Body',
			fieldType: 'string',
			text: ''
		});
		assert.deepStrictEqual(normalized, {
			baseHash: 'hash-1',
			createdAt: '2026-03-12T00:00:00.000Z',
			taskId: 'task-1',
			templateId: '',
			fieldKey: 'Body',
			fieldType: 'string',
			text: ''
		});
	});

	test('normalizeCorrectionIndexFile remove entradas invalidas e duplicadas', () => {
		const normalized = normalizeCorrectionIndexFile({
			baseHash: 'hash-1',
			revisions: [
				{ id: 'rev-1', createdAt: '2026-03-12T00:00:00.000Z', parent: 'base' },
				{ id: 'rev-1', createdAt: '2026-03-12T00:01:00.000Z', parent: 'base' },
				{ id: '', createdAt: '2026-03-12T00:02:00.000Z', parent: 'base' },
				{ id: 'rev-2', createdAt: '2026-03-12T00:03:00.000Z', parent: 'rev-1' }
			]
		});
		assert.deepStrictEqual(normalized, {
			baseHash: 'hash-1',
			revisions: [
				{ id: 'rev-1', createdAt: '2026-03-12T00:00:00.000Z', parent: 'base' },
				{ id: 'rev-2', createdAt: '2026-03-12T00:03:00.000Z', parent: 'rev-1' }
			]
		});
	});

	test('normalizeCorrectionRevisionFile filtra ops invalidas e valida id esperado', () => {
		const normalized = normalizeCorrectionRevisionFile({
			id: 'rev-2',
			parent: 'base',
			baseHash: 'hash-1',
			createdAt: '2026-03-12T00:00:00.000Z',
			ops: [
				{ op: 'insert', at: 3, text: 'ok' },
				{ op: 'replace', start: 1, end: 2, text: 'troca', status: 'accepted' },
				{ op: 'insert', at: -1, text: 'quebrado' },
				{ op: 'comment', text: 'sem-range' }
			]
		}, 'rev-2');
		assert.deepStrictEqual(normalized, {
			id: 'rev-2',
			parent: 'base',
			baseHash: 'hash-1',
			createdAt: '2026-03-12T00:00:00.000Z',
			ops: [
				{ op: 'insert', at: 3, text: 'ok', status: undefined },
				{ op: 'replace', start: 1, end: 2, text: 'troca', status: 'accepted' }
			]
		});
		assert.strictEqual(normalizeCorrectionRevisionFile({ id: 'rev-x', parent: 'base', baseHash: 'h', createdAt: 't', ops: [] }, 'rev-2'), undefined);
	});
});
