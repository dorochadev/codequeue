import * as vscode from 'vscode';

export class Logger {
    private static _outputChannel: vscode.OutputChannel;

    public static get channel(): vscode.OutputChannel {
        if (!this._outputChannel) {
            this._outputChannel = vscode.window.createOutputChannel('CodeQueue');
        }
        return this._outputChannel;
    }

    public static log(message: string) {
        const level = vscode.workspace.getConfiguration().get<string>('codequeue.loggingLevel', 'verbose');
        if (level === 'none' || level === 'error') { return; }
        
        this.channel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
        console.log(`[CodeQueue] ${message}`);
    }

    public static error(message: string, error?: any) {
        const level = vscode.workspace.getConfiguration().get<string>('codequeue.loggingLevel', 'verbose');
        if (level === 'none') { return; }

        this.channel.appendLine(`[ERROR] ${message} ${error ? JSON.stringify(error) : ''}`);
        console.error(`[CodeQueue] [ERROR] ${message}`, error);
    }

    public static show() {
        this.channel.show();
    }
}
