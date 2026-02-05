import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { GitHubService } from '../services/githubService';

export function registerConfigCommands(context: vscode.ExtensionContext, updateStatusCallback: () => void) {

    // Set Token
    const setTokenCmd = vscode.commands.registerCommand('codequeue.setToken', async () => {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter GitHub Personal Access Token',
            password: true,
            placeHolder: 'ghp_...'
        });

        if (token) {
            await context.secrets.store('codequeue.githubToken', token);
            Logger.log('Token stored successfully');
            vscode.window.showInformationMessage('CodeQueue token saved.');
            updateStatusCallback();
        }
    });

    // Set Project ID
    const setProjectIdCmd = vscode.commands.registerCommand('codequeue.setProjectId', async () => {
        const token = await context.secrets.get('codequeue.githubToken');
        if (!token) {
             vscode.window.showErrorMessage('CodeQueue: PLEASE SET GITHUB TOKEN FIRST.');
             vscode.commands.executeCommand('codequeue.setToken');
             return;
        }

        const saveProjectId = async (id: string) => {
            await vscode.workspace.getConfiguration().update('codequeue.projectId', id, vscode.ConfigurationTarget.Global);
            Logger.log(`Project ID set to ${id}`);
            
            const selection = await vscode.window.showInformationMessage(
                `CodeQueue: Connected to Project ID ${id}. Set default task status?`, 
                'Yes', 'Later'
            );
            
            updateStatusCallback();
            
            if (selection === 'Yes') {
                vscode.commands.executeCommand('codequeue.setStatus');
            }
        };

        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Fetching projects from GitHub...';
        quickPick.busy = true;
        quickPick.show();

        try {
            const projects = await GitHubService.fetchProjects(token);
            
            quickPick.busy = false;
            quickPick.placeholder = 'Select a GitHub Project';
            
            const manualItem = { label: '$(pencil) Manually Enter ID', id: 'MANUAL', detail: 'Paste a known Project ID directly' };
            quickPick.items = [manualItem, ...projects];

            quickPick.onDidAccept(async () => {
                const selection = quickPick.selectedItems[0] as any;
                if (selection) {
                    quickPick.hide();
                    if (selection.id === 'MANUAL') {
                        const currentId = vscode.workspace.getConfiguration().get<string>('codequeue.projectId');
                         const id = await vscode.window.showInputBox({ 
                             prompt: 'Enter GitHub Project V2 ID', 
                             value: currentId,
                             placeHolder: 'PVT_kwDOC...'
                         });
                         if (id) { await saveProjectId(id); }
                    } else {
                        await saveProjectId(selection.id);
                    }
                }
            });
            
            quickPick.onDidHide(() => quickPick.dispose());

        } catch (error) {
            quickPick.hide();
            Logger.log(`Failed to fetch projects: ${error}`);
            
            const currentId = vscode.workspace.getConfiguration().get<string>('codequeue.projectId');
            const id = await vscode.window.showInputBox({
                prompt: 'Failed to fetch projects. Enter GitHub Project V2 ID Manually',
                placeHolder: 'PVT_kwDOC...',
                value: currentId
            });
            if (id) {
                await saveProjectId(id);
            }
        }
    });

    // Set Status
    const setStatusCmd = vscode.commands.registerCommand('codequeue.setStatus', async () => {
        const token = await context.secrets.get('codequeue.githubToken');
        const projectId = vscode.workspace.getConfiguration().get<string>('codequeue.projectId');

        if (!token || !projectId) {
            vscode.window.showErrorMessage('CodeQueue: Token and Project ID required to set Status.');
            return;
        }

        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Fetching project statuses...';
        quickPick.busy = true;
        quickPick.show();

        try {
            const result = await GitHubService.fetchProjectStatuses(token, projectId);
            
            if (!result) {
                quickPick.hide();
                vscode.window.showErrorMessage('CodeQueue: Could not find a "Status" field in this project.');
                return;
            }

            quickPick.busy = false;
            quickPick.placeholder = 'Select Default Status for New Tasks';
            quickPick.items = result.options.map(opt => ({
                label: opt.name,
                id: opt.id,
                description: 'Set as default'
            }));

            quickPick.onDidAccept(async () => {
                const selection = quickPick.selectedItems[0] as any;
                if (selection) {
                    const settings = {
                        fieldId: result.fieldId,
                        optionId: selection.id,
                        name: selection.label
                    };
                    await vscode.workspace.getConfiguration().update('codequeue.statusSettings', settings, vscode.ConfigurationTarget.Global);
                    Logger.log(`Default status set to ${selection.label}`);
                    vscode.window.showInformationMessage(`CodeQueue: New tasks will start in "${selection.label}"`);
                    quickPick.hide();
                }
            });
            
            quickPick.onDidHide(() => quickPick.dispose());

        } catch (err) {
            quickPick.hide();
            vscode.window.showErrorMessage('CodeQueue: Failed to fetch statuses.');
        }
    });

    context.subscriptions.push(setTokenCmd, setProjectIdCmd, setStatusCmd);
}
