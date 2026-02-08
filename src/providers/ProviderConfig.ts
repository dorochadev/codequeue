import * as vscode from 'vscode';

export interface ProviderSettings {
    providerId: string;
    [key: string]: any;
}

export interface GitHubSettings extends ProviderSettings {
    providerId: 'github';
    projectId?: string;
    statusSettings?: {
        fieldId: string;
        optionId: string;
        name: string;
    };
    prioritySettings?: {
        fieldId: string;
        options: Array<{ id: string; name: string }>;
    };
}

export interface AppleRemindersSettings extends ProviderSettings {
    providerId: 'apple_reminders';
    listName?: string;
}

export interface TrelloSettings extends ProviderSettings {
    providerId: 'trello';
    apiKey?: string;
    boardId?: string;
    defaultListId?: string;
}

export type AnyProviderSettings = GitHubSettings | AppleRemindersSettings | TrelloSettings;

export class ProviderConfig {
    private static readonly CONFIG_PREFIX = 'codequeue.providers';

    static getProviderSettings<T extends ProviderSettings>(providerId: string): T {
        const config = vscode.workspace.getConfiguration();
        const providerConfig = config.get<any>(`${this.CONFIG_PREFIX}.${providerId}`, {});
        return { providerId, ...providerConfig } as T;
    }

    static async setProviderSetting(
        providerId: string, 
        key: string, 
        value: any,
        scope: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
    ): Promise<void> {
        const configKey = `${this.CONFIG_PREFIX}.${providerId}.${key}`;
        await vscode.workspace.getConfiguration().update(configKey, value, scope);
    }

    static async getProviderSetting<T>(providerId: string, key: string, defaultValue?: T): Promise<T | undefined> {
        const configKey = `${this.CONFIG_PREFIX}.${providerId}.${key}`;
        const value = vscode.workspace.getConfiguration().get<T>(configKey);
        return value !== undefined ? value : defaultValue;
    }

    static async migrateOldSettings(): Promise<void> {
        const config = vscode.workspace.getConfiguration();
        
        // Migrate GitHub settings
        const oldProjectId = config.get<string>('codequeue.projectId');
        if (oldProjectId && !config.get(`${this.CONFIG_PREFIX}.github.projectId`)) {
            await this.setProviderSetting('github', 'projectId', oldProjectId, vscode.ConfigurationTarget.Global);
            await config.update('codequeue.projectId', undefined, vscode.ConfigurationTarget.Global);
        }

        const oldStatusSettings = config.get<any>('codequeue.statusSettings');
        if (oldStatusSettings && Object.keys(oldStatusSettings).length > 0 && !config.get(`${this.CONFIG_PREFIX}.github.statusSettings`)) {
            await this.setProviderSetting('github', 'statusSettings', oldStatusSettings, vscode.ConfigurationTarget.Global);
            await config.update('codequeue.statusSettings', undefined, vscode.ConfigurationTarget.Global);
        }

        // Migrate Apple Reminders settings
        const oldRemindersList = config.get<string>('codequeue.appleRemindersList');
        if (oldRemindersList && !config.get(`${this.CONFIG_PREFIX}.apple_reminders.listName`)) {
            await this.setProviderSetting('apple_reminders', 'listName', oldRemindersList, vscode.ConfigurationTarget.Global);
            await config.update('codequeue.appleRemindersList', undefined, vscode.ConfigurationTarget.Global);
        }
    }
}
