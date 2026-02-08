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
            statusBar.text = `$(alert) CodeQueue: Setup ${provider.displayName}`;
            statusBar.tooltip = `Click to configure ${provider.displayName}`;
            statusBar.command = provider.requiresAuthentication ? 'codequeue.setToken' : 'codequeue.setProjectId';
            statusBar.color = new vscode.ThemeColor('errorForeground');
        } else {
            statusBar.text = '$(check) CodeQueue';
            statusBar.tooltip = `CodeQueue is active (${provider.displayName})`;
            statusBar.command = undefined; 
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

