/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { migrateLegacyProject, parseProject, serializeProject } from 'co-doc-core';
import { createDefaultProject } from '../diagramador';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;

suite('Diagramador', () => {
	test('serialize/parse preserva o schema v1', () => {
		const project = createDefaultProject();
		project.data = { title: 'Ana', members: ['A', 'B'] };
		const raw = serializeProject(project);
		const parsed = parseProject(raw);
		assert.ok(parsed);
		assert.strictEqual(parsed?.data.title, 'Ana');
		assert.strictEqual(parsed?.data.members.length, 2);
		assert.strictEqual(parsed?.templateId, 'test_v0');
	});

	test('migrateLegacyProject converte doc legado', () => {
		const legacy = {
			templateId: 'test_v0',
			doc: {
				title: 'Ana',
				members: ['A', 'B']
			}
		};
		const migrated = migrateLegacyProject(legacy);
		assert.strictEqual(migrated.schemaVersion, 1);
		assert.strictEqual(migrated.templateId, 'test_v0');
		assert.strictEqual(migrated.data.title, 'Ana');
		assert.strictEqual(migrated.data.members.length, 2);
	});
});
