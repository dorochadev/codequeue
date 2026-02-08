import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ProviderFactory } from '../providers/ProviderFactory';
import { ProviderConfig } from '../providers/ProviderConfig';

export function registerConfigCommands(context: vscode.ExtensionContext, updateStatusCallback: () => void) {
    // Command: Select Provider
    const selectProviderCmd = vscode.commands.registerCommand('codequeue.selectProvider', async () => {
        const providers = ProviderFactory.getAvailableProviders();
        
        const items = providers.map(p => ({
            label: p.displayName,
            description: p.requiresAuth ? 'Requires authentication' : 'No authentication required',
            detail: `Provider ID: ${p.id}`,
            providerId: p.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a task management provider',
            title: 'CodeQueue: Select Provider'
        });

        if (!selected) { return; }

        // Save the selected provider
        await vscode.workspace.getConfiguration('codequeue').update('provider', selected.providerId, vscode.ConfigurationTarget.Global);
        
        // Reinitialize provider factory with new selection
        ProviderFactory.initialize(context);
        
        vscode.window.showInformationMessage(`CodeQueue: Switched to ${selected.label}`);
        
        // Update status bar
        updateStatusCallback();

        // Prompt user to configure the provider
        const provider = ProviderFactory.getProvider();
        const isConfigured = await provider.validateConfiguration();
        
        if (!isConfigured) {
            const configureNow = await vscode.window.showInformationMessage(
                `Would you like to configure ${provider.displayName} now?`,
                'Yes', 'Later'
            );
            
            if (configureNow === 'Yes') {
                if (provider.requiresAuthentication) {
                    await vscode.commands.executeCommand('codequeue.setToken');
                } else {
                    await vscode.commands.executeCommand('codequeue.setProjectId');
                }
            }
        }
    });

    // Set Token/Credentials
    const setTokenCmd = vscode.commands.registerCommand('codequeue.setToken', async () => {
        const provider = ProviderFactory.getProvider();
        
        if (!provider.requiresAuthentication) {
            vscode.window.showInformationMessage(`CodeQueue: ${provider.displayName} does not require authentication.`);
            updateStatusCallback();
            return;
        }

        if (provider.id === 'github') {
            const token = await vscode.window.showInputBox({
                prompt: 'Enter GitHub Personal Access Token',
                password: true,
                placeHolder: 'ghp_...'
            });
            if (token) {
                await context.secrets.store('codequeue.githubToken', token);
                vscode.window.showInformationMessage('CodeQueue: GitHub token saved.');
            }
        } else if (provider.id === 'trello') {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Step 1/2: Enter your Trello API Key',
                placeHolder: 'Get from https://trello.com/app-key (shown as "Key")',
                ignoreFocusOut: true
            });
            if (!apiKey) { return; }

            await ProviderConfig.setProviderSetting('trello', 'apiKey', apiKey, vscode.ConfigurationTarget.Global);
            Logger.log(`Trello API Key saved to settings`);

            const token = await vscode.window.showInputBox({
                prompt: 'Step 2/2: Enter your Trello Token (called "Secret" on the website)',
                password: true,
                placeHolder: 'Click "Token" link on https://trello.com/app-key to generate',
                ignoreFocusOut: true
            });
            if (token) {
                Logger.log(`Attempting to save Trello token to secret storage...`);
                await context.secrets.store('codequeue.trelloToken', token);
                Logger.log(`Trello token saved successfully`);
                
                // Verify it was saved
                const savedToken = await context.secrets.get('codequeue.trelloToken');
                Logger.log(`Token verification: ${savedToken ? 'Token retrieved successfully' : 'ERROR: Token not found after save!'}`);
                
                vscode.window.showInformationMessage('CodeQueue: Trello credentials saved. Now select a board.');
                
                // Automatically prompt for board selection after a delay to allow secrets to persist
                setTimeout(() => {
                    vscode.commands.executeCommand('codequeue.setProjectId');
                }, 500);
            } else {
                Logger.log('Trello token input cancelled by user');
            }
        }
        
        updateStatusCallback();
    });

    // Set Project/Board/List
    const setProjectIdCmd = vscode.commands.registerCommand('codequeue.setProjectId', async () => {
        const provider = ProviderFactory.getProvider();
        
        // Small delay to ensure secrets are persisted
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const hasAuth = await provider.authenticate();

        if (!hasAuth && provider.requiresAuthentication) {
             vscode.window.showErrorMessage(`CodeQueue: Authentication required for ${provider.displayName}. Please set credentials first.`);
             return;
        }

        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = `Fetching ${provider.displayName} projects/lists...`;
        quickPick.busy = true;
        quickPick.show();

        try {
            const projects = await provider.getProjects();
            
            quickPick.busy = false;
            quickPick.placeholder = `Select a ${provider.displayName} project/board/list`;
            
            const manualItem = { label: '$(pencil) Manually Enter Name/ID', id: 'MANUAL', detail: 'Type directly' };
            quickPick.items = [manualItem, ...projects];

            quickPick.onDidAccept(async () => {
                const selection = quickPick.selectedItems[0] as any;
                if (selection) {
                    quickPick.hide();
                    let idToSave = selection.id;

                    if (selection.id === 'MANUAL') {
                        const id = await vscode.window.showInputBox({ 
                             prompt: `Enter ${provider.displayName} Project ID or Name`
                         });
                         if (id) { idToSave = id; }
                         else { return; }
                    }

                    // Save based on provider type
                    if (provider.id === 'github') {
                        await ProviderConfig.setProviderSetting('github', 'projectId', idToSave); // Workspace-scoped
                    } else if (provider.id === 'apple_reminders') {
                        await ProviderConfig.setProviderSetting('apple_reminders', 'listName', idToSave); // Workspace-scoped
                    } else if (provider.id === 'trello') {
                        await ProviderConfig.setProviderSetting('trello', 'boardId', idToSave); // Workspace-scoped
                    }

                    Logger.log(`Project/List set to ${idToSave}`);
                    vscode.window.showInformationMessage(`CodeQueue: Connected to "${idToSave}".`);
                    updateStatusCallback();
                    
                    // Prompt for status/list selection if applicable
                    if (provider.id === 'github' || provider.id === 'trello') {
                        const next = await vscode.window.showInformationMessage(
                            `Set default ${provider.id === 'github' ? 'status' : 'list'}?`, 
                            'Yes', 
                            'Later'
                        );
                        if (next === 'Yes') {
                            vscode.commands.executeCommand('codequeue.setStatus');
                        }
                    }
                }
            });
            
            quickPick.onDidHide(() => quickPick.dispose());

        } catch (error) {
            quickPick.hide();
            Logger.error(`Failed to fetch projects`, error);
            vscode.window.showErrorMessage(`CodeQueue: Failed to fetch projects.`);
        }
    });

    // Set Status/Column/List
    const setStatusCmd = vscode.commands.registerCommand('codequeue.setStatus', async () => {
        const provider = ProviderFactory.getProvider();
        
        if (provider.id === 'apple_reminders') {
             vscode.window.showInformationMessage('CodeQueue: Apple Reminders does not use status columns.');
             return;
        }

        if (!(await provider.authenticate())) {
            vscode.window.showErrorMessage('CodeQueue: Authentication required.');
            return;
        }

        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = `Fetching ${provider.id === 'github' ? 'statuses' : 'lists'}...`;
        quickPick.busy = true;
        quickPick.show();

        try {
            const options = await provider.getStatuses();
            
            if (!options || options.length === 0) {
                quickPick.hide();
                if (provider.id === 'trello') {
                    vscode.window.showErrorMessage('CodeQueue: No lists found. Please select a board first.');
                } else {
                    vscode.window.showErrorMessage(`CodeQueue: No ${provider.id === 'github' ? 'statuses' : 'lists'} found.`);
                }
                return;
            }

            quickPick.busy = false;
            quickPick.placeholder = `Select Default ${provider.id === 'github' ? 'Status' : 'List'} for New Tasks`;
            quickPick.items = options.map(opt => ({
                label: opt.name,
                id: opt.id,
                parentId: opt.parentId,
                description: 'Set as default'
            }));

            quickPick.onDidAccept(async () => {
                const selection = quickPick.selectedItems[0] as any;
                if (selection) {
                    if (provider.id === 'github') {
                        const settings = {
                            fieldId: selection.parentId,
                            optionId: selection.id,
                            name: selection.label
                        };
                        await ProviderConfig.setProviderSetting('github', 'statusSettings', settings);
                        vscode.window.showInformationMessage(`CodeQueue: New tasks will start in "${selection.label}"`);
                    } else if (provider.id === 'trello') {
                        await ProviderConfig.setProviderSetting('trello', 'defaultListId', selection.id);
                        vscode.window.showInformationMessage(`CodeQueue: New tasks will be added to "${selection.label}". Trello is now fully configured!`);
                    }

                    Logger.log(`Default ${provider.id === 'github' ? 'status' : 'list'} set to ${selection.label}`);
                    quickPick.hide();
                }
            });
            
            quickPick.onDidHide(() => quickPick.dispose());

        } catch (err) {
            quickPick.hide();
            vscode.window.showErrorMessage(`CodeQueue: Failed to fetch ${provider.id === 'github' ? 'statuses' : 'lists'}.`);
        }
    });

    context.subscriptions.push(
        selectProviderCmd,
        setTokenCmd,
        setProjectIdCmd,
        setStatusCmd
    );
}
