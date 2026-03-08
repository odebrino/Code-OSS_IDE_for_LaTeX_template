/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';

const Mocha = require('mocha');

export async function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		timeout: 60000
	});

	const suiteRoot = path.resolve(__dirname, 'suite');
	const files = await collectTests(suiteRoot);
	for (const file of files) {
		mocha.addFile(file);
	}

	await new Promise<void>((resolve, reject) => {
		mocha.run((failures: number) => {
			if (failures > 0) {
				reject(new Error(`${failures} tests failed.`));
				return;
			}
			resolve();
		});
	});
}

async function collectTests(root: string): Promise<string[]> {
	const files: string[] = [];
	await walk(root, files);
	return files.filter(file => file.endsWith('.test.js')).sort();
}

async function walk(dir: string, files: string[]): Promise<void> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await walk(fullPath, files);
			continue;
		}
		files.push(fullPath);
	}
}
