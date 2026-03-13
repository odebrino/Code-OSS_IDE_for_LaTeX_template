/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { migrateLegacyProject, parseProject, serializeProject } from '../index';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;

suite('CO Doc Core', () => {
	test('parseProject rejeita payload vazio, invalido ou incompleto', () => {
		assert.strictEqual(parseProject(''), null);
		assert.strictEqual(parseProject('{not-json'), null);
		assert.strictEqual(parseProject(JSON.stringify({ schemaVersion: 1, data: {} })), null);
	});

	test('parseProject normaliza templateId e meta opcionais', () => {
		const parsed = parseProject(JSON.stringify({
			schemaVersion: 1,
			templateId: ' tarefa ',
			data: {
				title: 'Ana'
			},
			meta: {
				createdAt: ' 2026-03-12T00:00:00.000Z ',
				updatedAt: ' '
			}
		}));

		assert.deepStrictEqual(parsed, {
			schemaVersion: 1,
			templateId: 'tarefa',
			data: {
				title: 'Ana'
			},
			meta: {
				createdAt: '2026-03-12T00:00:00.000Z'
			}
		});
	});

	test('serializeProject preserva round-trip estavel', () => {
		const project = {
			schemaVersion: 1 as const,
			templateId: 'tarefa',
			data: {
				title: 'Ana',
				members: ['A', 'B']
			}
		};

		const raw = serializeProject(project);

		assert.match(raw, /\n  "templateId": "tarefa"/);
		assert.deepStrictEqual(parseProject(raw), project);
	});

	test('migrateLegacyProject converte legado e usa fallback seguro', () => {
		assert.deepStrictEqual(migrateLegacyProject({
			templateId: ' custom ',
			doc: {
				title: 'Ana'
			}
		}), {
			schemaVersion: 1,
			templateId: 'custom',
			data: {
				title: 'Ana'
			}
		});

		assert.deepStrictEqual(migrateLegacyProject({
			templateId: ' ',
			doc: 'invalido'
		}), {
			schemaVersion: 1,
			templateId: 'test_v0',
			data: {}
		});
	});

	test('migrateLegacyProject reaproveita schema v1 ja valido com normalizacao', () => {
		assert.deepStrictEqual(migrateLegacyProject({
			schemaVersion: 1,
			templateId: ' tarefa ',
			data: {
				question: 'Q1'
			},
			meta: {
				createdAt: ' created ',
				updatedAt: ' '
			}
		}), {
			schemaVersion: 1,
			templateId: 'tarefa',
			data: {
				question: 'Q1'
			},
			meta: {
				createdAt: 'created'
			}
		});
	});
});
