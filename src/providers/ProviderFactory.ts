import * as vscode from 'vscode';
import { TaskProvider } from './TaskProvider';
import { GitHubProvider } from './github/provider';
import { AppleRemindersProvider } from './apple_reminders/provider';
import { TrelloProvider } from './trello/provider';

export class ProviderFactory {
    private static providers: TaskProvider[] = [];

    public static initialize(context: vscode.ExtensionContext) {
        this.providers = [
            new GitHubProvider(context),
            new AppleRemindersProvider(),
            new TrelloProvider(context)
        ];
    }

    public static getProvider(): TaskProvider {
        const providerId = vscode.workspace.getConfiguration().get<string>('codequeue.provider', 'github');
        const provider = this.providers.find(p => p.id === providerId);
        
        if (!provider) {
            // Fallback to GitHub if invalid
            return this.providers.find(p => p.id === 'github')!;
        }
        return provider;
    }

    public static getProviderById(id: string): TaskProvider | undefined {
        return this.providers.find(p => p.id === id);
    }
    
    public static getAllProviders(): TaskProvider[] {
        return this.providers;
    }

    public static getAvailableProviders(): Array<{ id: string; displayName: string; requiresAuth: boolean }> {
        return this.providers.map(p => ({
            id: p.id,
            displayName: p.displayName,
            requiresAuth: p.requiresAuthentication
        }));
    }
}
