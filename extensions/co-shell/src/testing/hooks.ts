/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAdminEmailForList, loadAdminsFrom, resolveAdminsPathCandidates, resolveExistingAdminsPath } from '../lib/admins';

type CoShellHooksOptions = {
	extensionPath: string;
	configuredPath?: string;
	cwd?: string;
	existsSync?: (target: string) => boolean;
};

export type CoShellTestingHooks = {
	resolveAdminsPathCandidates: () => string[];
	loadAdminsFrom: (filePath?: string) => Promise<string[]>;
	isAdminEmail: (email: string, admins?: string[]) => Promise<boolean>;
};

export function createCoShellTestingHooks(options: CoShellHooksOptions): CoShellTestingHooks {
	const existsSync = options.existsSync ?? (() => false);

	return {
		resolveAdminsPathCandidates: () => resolveAdminsPathCandidates({
			extensionPath: options.extensionPath,
			configuredPath: options.configuredPath,
			cwd: options.cwd
		}),
		loadAdminsFrom: async (filePath?: string) => {
			if (filePath) {
				return loadAdminsFrom(filePath);
			}
			const resolved = resolveExistingAdminsPath({
				extensionPath: options.extensionPath,
				configuredPath: options.configuredPath,
				cwd: options.cwd
			}, existsSync);
			if (!resolved) {
				return [];
			}
			return loadAdminsFrom(resolved);
		},
		isAdminEmail: async (email: string, admins?: string[]) => {
			const list = admins ?? await (async () => {
				const resolved = resolveExistingAdminsPath({
					extensionPath: options.extensionPath,
					configuredPath: options.configuredPath,
					cwd: options.cwd
				}, existsSync);
				if (!resolved) {
					return [];
				}
				return loadAdminsFrom(resolved);
			})();
			return isAdminEmailForList(email, list);
		}
	};
}
