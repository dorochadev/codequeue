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
        this.channel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    public static error(message: string, error?: any) {
        this.channel.appendLine(`[ERROR] ${message} ${error ? JSON.stringify(error) : ''}`);
    }

    public static show() {
        this.channel.show();
    }
}
