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
		project.header.name = 'Ana';
		project.blocks.push({ id: '1', type: 'text', text: 'Ola' });
		const raw = serializeProject(project);
		const parsed = parseProject(raw);
		assert.ok(parsed);
		assert.strictEqual(parsed?.header.name, 'Ana');
		assert.strictEqual(parsed?.blocks.length, 1);
		assert.strictEqual(parsed?.blocks[0].type, 'text');
	});
});
