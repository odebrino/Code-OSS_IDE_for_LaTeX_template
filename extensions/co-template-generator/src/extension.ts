/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TemplateGeneratorHooks } from './testing/hooks';

export async function activate(context: vscode.ExtensionContext) {
	const explicitWorkspace = (process.env.CO_TEST_WORKSPACE ?? '').trim();
	const workspaceRoot = explicitWorkspace || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const hooks = new TemplateGeneratorHooks(workspaceRoot);
	await hooks.initialize();
	context.subscriptions.push(
		vscode.commands.registerCommand('co.templateGenerator.open', async () => {
			const state = hooks.getStateSnapshot();
			await vscode.window.showInformationMessage(`Templates disponiveis: ${state.templates.length}`);
		})
	);

	if (process.env.CO_TESTING === '1') {
		return {
			__test: {
				listTemplatesNow: () => hooks.listTemplatesNow(),
				selectTemplate: (id: string) => hooks.selectTemplate(id),
				getStateSnapshot: () => hooks.getStateSnapshot(),
				buildPreviewNow: () => hooks.buildPreviewNow()
			}
		};
	}

	return undefined;
}

export function deactivate(): void {
	// no-op
}
