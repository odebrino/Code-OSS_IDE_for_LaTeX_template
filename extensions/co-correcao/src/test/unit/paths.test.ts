/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import { resolveCorrecaoStoragePaths } from '../../paths';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('CO Correcao Paths', () => {
	test('usa workspace para diagramador e corrections', () => {
		const workspaceDir = path.join(path.sep, 'workspaces', 'co-correcao');
		const paths = resolveCorrecaoStoragePaths({
			globalStoragePath: path.join(path.sep, 'home', 'co', '.config', 'Code', 'User', 'globalStorage', 'odebrino.co-correcao'),
			workspaceDir
		});
		assert.deepStrictEqual(paths, {
			diagramadorBaseDir: path.join(workspaceDir, '.co', 'diagramador'),
			correctionsBaseDir: path.join(workspaceDir, '.co', 'corrections')
		});
	});

	test('respeita override do diagramador sem afetar corrections', () => {
		const paths = resolveCorrecaoStoragePaths({
			globalStoragePath: path.join(path.sep, 'home', 'co', '.config', 'Code', 'User', 'globalStorage', 'odebrino.co-correcao'),
			saveDirOverride: path.join(path.sep, 'tmp', 'co-save-dir')
		});
		assert.strictEqual(paths.diagramadorBaseDir, path.join(path.sep, 'tmp', 'co-save-dir'));
		assert.match(paths.correctionsBaseDir, /odebrino\.co-correcao/);
		assert.match(paths.correctionsBaseDir, /corrections$/);
	});
});
