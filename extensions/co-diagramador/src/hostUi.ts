/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface DiagramadorHostUi {
	showWarningMessage(message: string, options: vscode.MessageOptions | undefined, ...items: string[]): Thenable<string | undefined>;
	showInputBox(options: vscode.InputBoxOptions): Thenable<string | undefined>;
	showQuickPick<T extends vscode.QuickPickItem>(items: readonly T[], options: vscode.QuickPickOptions): Thenable<T | undefined>;
	showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
	showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
	showOpenDialog(options: vscode.OpenDialogOptions): Thenable<readonly vscode.Uri[] | undefined>;
	showSaveDialog(options: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined>;
}

export const vscodeHostUi: DiagramadorHostUi = {
	showWarningMessage(message, options, ...items) {
		return options
			? vscode.window.showWarningMessage(message, options, ...items)
			: vscode.window.showWarningMessage(message, ...items);
	},
	showInputBox(options) {
		return vscode.window.showInputBox(options);
	},
	showQuickPick(items, options) {
		return vscode.window.showQuickPick(items, options);
	},
	showInformationMessage(message, ...items) {
		return vscode.window.showInformationMessage(message, ...items);
	},
	showErrorMessage(message, ...items) {
		return vscode.window.showErrorMessage(message, ...items);
	},
	showOpenDialog(options) {
		return vscode.window.showOpenDialog(options);
	},
	showSaveDialog(options) {
		return vscode.window.showSaveDialog(options);
	}
};
