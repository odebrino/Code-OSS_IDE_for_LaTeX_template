/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createDefaultProject, escapeLatex, parseProject, serializeProject } from '../diagramador';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;

suite('Diagramador', () => {
	test('escapeLatex escapa caracteres especiais', () => {
		const input = '#$%&_{}~^\\';
		const expected = '\\#\\$\\%\\&\\_\\{\\}\\textasciitilde{}\\textasciicircum{}\\textbackslash{}';
		assert.strictEqual(escapeLatex(input), expected);
	});

	test('serialize/parse preserva o modelo', () => {
		const project = createDefaultProject();
		project.doc.title = 'Ana';
		project.doc.members = ['A', 'B'];
		const raw = serializeProject(project);
		const parsed = parseProject(raw);
		assert.ok(parsed);
		assert.strictEqual(parsed?.doc.title, 'Ana');
		assert.strictEqual(parsed?.doc.members.length, 2);
		assert.strictEqual(parsed?.templateId, 'test_v0');
	});
});
