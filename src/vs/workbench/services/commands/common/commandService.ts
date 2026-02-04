/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, notCancellablePromise, raceCancellablePromises, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CommandsRegistry, ICommandEvent, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IExtensionService } from '../../extensions/common/extensions.js';

export class CommandService extends Disposable implements ICommandService {

	declare readonly _serviceBrand: undefined;

	private _extensionHostIsReady: boolean = false;
	private _starActivation: CancelablePromise<void> | null;

	private readonly _onWillExecuteCommand: Emitter<ICommandEvent> = this._register(new Emitter<ICommandEvent>());
	public readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	private readonly _onDidExecuteCommand: Emitter<ICommandEvent> = new Emitter<ICommandEvent>();
	public readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		this._extensionService.whenInstalledExtensionsRegistered().then(value => this._extensionHostIsReady = value);
		this._starActivation = null;
	}

	private _activateStar(): Promise<void> {
		if (!this._starActivation) {
			// wait for * activation, limited to at most 30s.
			this._starActivation = raceCancellablePromises([
				this._extensionService.activateByEvent(`*`),
				timeout(30000)
			]);
		}

		// This is wrapped with notCancellablePromise so it doesn't get cancelled
		// early because it is shared between consumers.
		return notCancellablePromise(this._starActivation);
	}

	async executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
		this._logService.trace('CommandService#executeCommand', id);

		if (isCozitosCommandBlocked(id, this._contextKeyService)) {
			this._logService.trace('CommandService#executeCommand blocked (cozitos)', id);
			return Promise.resolve(undefined as T);
		}

		const activationEvent = `onCommand:${id}`;
		const commandIsRegistered = !!CommandsRegistry.getCommand(id);

		if (commandIsRegistered) {

			// if the activation event has already resolved (i.e. subsequent call),
			// we will execute the registered command immediately
			if (this._extensionService.activationEventIsDone(activationEvent)) {
				return this._tryExecuteCommand(id, args);
			}

			// if the extension host didn't start yet, we will execute the registered
			// command immediately and send an activation event, but not wait for it
			if (!this._extensionHostIsReady) {
				this._extensionService.activateByEvent(activationEvent); // intentionally not awaited
				return this._tryExecuteCommand(id, args);
			}

			// we will wait for a simple activation event (e.g. in case an extension wants to overwrite it)
			await this._extensionService.activateByEvent(activationEvent);
			return this._tryExecuteCommand(id, args);
		}

		// finally, if the command is not registered we will send a simple activation event
		// as well as a * activation event raced against registration and against 30s
		await Promise.all([
			this._extensionService.activateByEvent(activationEvent),
			raceCancellablePromises<unknown>([
				// race * activation against command registration
				this._activateStar(),
				Event.toPromise(Event.filter(CommandsRegistry.onDidRegisterCommand, e => e === id))
			]),
		]);

		return this._tryExecuteCommand(id, args);
	}

	private _tryExecuteCommand(id: string, args: unknown[]): Promise<any> {
		const command = CommandsRegistry.getCommand(id);
		if (!command) {
			return Promise.reject(new Error(`command '${id}' not found`));
		}
		try {
			this._onWillExecuteCommand.fire({ commandId: id, args });
			const result = this._instantiationService.invokeFunction(command.handler, ...args);
			this._onDidExecuteCommand.fire({ commandId: id, args });
			return Promise.resolve(result);
		} catch (err) {
			return Promise.reject(err);
		}
	}

	public override dispose(): void {
		super.dispose();
		this._starActivation?.cancel();
	}
}

const COZITOS_BLOCKED_COMMANDS = new Set<string>([
	// Activity Bar / Views
	'workbench.view.explorer',
	'workbench.view.search',
	'workbench.view.scm',
	'workbench.view.debug',
	'workbench.view.extensions',
	'workbench.action.openView',
	'workbench.action.toggleActivityBarVisibility',
	'workbench.action.toggleSidebarVisibility',
	'workbench.action.closeSidebar',
	'workbench.action.showAllEditors',
	// Command Palette / Quick Open
	'workbench.action.showCommands',
	'workbench.action.quickOpen',
	'workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup',
	'workbench.action.quickOpenLeastRecentlyUsedEditorInGroup',
	'workbench.action.showAllSymbols',
	'workbench.action.gotoSymbol',
	// Appearance / Layout
	'workbench.action.toggleMenuBar',
	'workbench.action.toggleCenteredLayout',
	'workbench.action.toggleFullScreen',
	'workbench.action.toggleZenMode',
	'workbench.action.toggleStatusbarVisibility',
	'workbench.action.togglePanel',
	// Panel targets
	'workbench.action.terminal.toggleTerminal',
	'workbench.action.output.toggleOutput',
	'workbench.actions.view.problems',
	// Settings
	'workbench.action.openSettings',
	'workbench.action.openSettingsJson',
	'workbench.action.openGlobalSettings',
	'workbench.action.openWorkspaceSettings',
	// Extensions
	'workbench.extensions.action.installedExtensions',
	'workbench.extensions.action.installExtensions',
	'workbench.extensions.action.showExtensionsWithIds',
	'workbench.extensions.action.openExtensionsFolder',
	// Dev tools / reload / logs
	'workbench.action.toggleDevTools',
	'workbench.action.reloadWindow',
	'workbench.action.openLogFile',
	'workbench.action.openLogsFolder',
	// Accounts / Authentication
	'workbench.action.manageAccounts',
	'_signOutOfAccount',
	'_manageTrustedExtensionsForAccount',
	'_manageAccountPreferencesForExtension',
	'_manageTrustedMCPServersForAccount',
	'_manageAccountPreferencesForMcpServer',
	'workbench.action.removeDynamicAuthenticationProviders',
	'workbench.actions.accounts.signIn',
	'workbench.extensions.actions.gallery.signIn',
	'workbench.editSessions.actions.signIn'
]);

function isCozitosCommandBlocked(id: string, contextKeyService: IContextKeyService): boolean {
	if (!isCozitosEnabled(contextKeyService)) {
		return false;
	}
	return COZITOS_BLOCKED_COMMANDS.has(id);
}

function isCozitosEnabled(contextKeyService: IContextKeyService): boolean {
	const contextValue = contextKeyService.getContextKeyValue('co.cozitos');
	if (typeof contextValue === 'boolean') {
		return contextValue;
	}
	try {
		return typeof process !== 'undefined' && process.env?.COZITOS === '1';
	} catch {
		return false;
	}
}

registerSingleton(ICommandService, CommandService, InstantiationType.Delayed);
