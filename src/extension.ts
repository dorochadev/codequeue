import * as vscode from 'vscode';
import { ScannerService } from './services/scannerService';
import { Logger } from './utils/logger';
import { registerConfigCommands } from './commands/configCommands';
import { ProviderFactory } from './providers/ProviderFactory';
import { ProviderConfig } from './providers/ProviderConfig';

export function activate(context: vscode.ExtensionContext) {
    Logger.log('Extension active');
    ProviderFactory.initialize(context);
    
    // Migrate old settings to new structure
    ProviderConfig.migrateOldSettings().catch(err => {
        Logger.error('Failed to migrate settings', err);
    });
    
    // Status Bar Setup
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'codequeue.setToken';
    context.subscriptions.push(statusBar);

    async function updateStatus() {
        const provider = ProviderFactory.getProvider();
        const isReady = await provider.validateConfiguration();

        if (!isReady) {
            // Check if authentication exists (for providers that need it)
            const hasAuth = provider.requiresAuthentication ? await provider.authenticate() : true;
            
            if (!hasAuth) {
                // No authentication - prompt to set up credentials (RED)
                statusBar.text = `$(alert) CodeQueue: Setup ${provider.displayName}`;
                statusBar.tooltip = `Click to configure ${provider.displayName} authentication`;
                statusBar.command = 'codequeue.setToken';
                statusBar.color = new vscode.ThemeColor('errorForeground');
            } else {
                // Has auth but missing board/list/project - prompt to configure workspace (ORANGE)
                statusBar.text = `$(alert) CodeQueue: Setup ${provider.displayName}`;
                statusBar.tooltip = `Click to select ${provider.displayName} board/project for this workspace`;
                statusBar.command = 'codequeue.setProjectId';
                statusBar.color = new vscode.ThemeColor('editorWarning.foreground');
            }
        } else {
            statusBar.text = '$(check) CodeQueue';
            statusBar.tooltip = `CodeQueue is active (${provider.displayName})`;
            statusBar.command = undefined;
            statusBar.color = undefined; // Reset to default color
        }
        statusBar.show();
    }

    // Initial check
    updateStatus();

    // Register Commands
    registerConfigCommands(context, updateStatus);

    // Register Save Listener
    const saveListener = vscode.workspace.onDidSaveTextDocument(async doc => {
        const config = vscode.workspace.getConfiguration('codequeue');
        if (!config.get<boolean>('enableAutoScanOnSave', true)) {
            return;
        }

        Logger.log(`File saved: ${doc.fileName}`);
        statusBar.text = '$(sync~spin) CodeQueue: Syncing...';
        statusBar.show();
        try {
            await ScannerService.scanDocument(doc, context);
            Logger.log('Sync finished successfully.');
        } catch (e) {
            Logger.error('Sync failed', e);
        } finally {
            updateStatus();
        }
    });

    context.subscriptions.push(saveListener, Logger.channel);
}

export function deactivate() {}

