import * as vscode from 'vscode';
import { ScannerService } from './services/scannerService';
import { Logger } from './utils/logger';
import { registerConfigCommands } from './commands/configCommands';

export function activate(context: vscode.ExtensionContext) {
    Logger.log('Extension active');
    
    // Status Bar Setup
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'codequeue.setToken';
    context.subscriptions.push(statusBar);

    const updateStatus = async () => {
        const token = await context.secrets.get('codequeue.githubToken');
        const projectId = vscode.workspace.getConfiguration().get<string>('codequeue.projectId');

        if (!token) {
            statusBar.text = '$(alert) CodeQueue: No Token';
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            statusBar.tooltip = 'Click to set GitHub Token';
            statusBar.command = 'codequeue.setToken';
            statusBar.show();
        } else if (!projectId) {
            statusBar.text = '$(alert) CodeQueue: No Project ID';
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            statusBar.tooltip = 'Click to set Project ID';
            statusBar.command = 'codequeue.setProjectId';
            statusBar.show();
        } else {
            statusBar.text = '$(check) CodeQueue';
            statusBar.backgroundColor = undefined;
            statusBar.tooltip = 'CodeQueue is active and ready';
            statusBar.command = undefined; 
            statusBar.show();
        }
    };

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
        } finally {
            updateStatus();
        }
    });

    context.subscriptions.push(saveListener, Logger.channel);
}

export function deactivate() {}
