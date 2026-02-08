import * as vscode from 'vscode';
import { TaskProvider } from '../TaskProvider';
import { Task, ProjectOption, StatusOption } from '../../types';
import { Logger } from '../../utils/logger';
import { ProviderConfig } from '../ProviderConfig';

interface TrelloBoard {
    id: string;
    name: string;
}

interface TrelloList {
    id: string;
    name: string;
    idBoard: string;
}

interface TrelloCard {
    id: string;
    name: string;
}

export class TrelloProvider implements TaskProvider {
    public readonly id = 'trello';
    public readonly displayName = 'Trello';
    public readonly requiresAuthentication = true;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Validates and sanitizes task title to prevent issues and ensure reasonable length.
     */
    private validateTaskTitle(title: string): string {
        const MAX_TITLE_LENGTH = 256;
        const sanitized = title.trim();
        if (sanitized.length === 0) {
            throw new Error('Task title cannot be empty');
        }
        if (sanitized.length > MAX_TITLE_LENGTH) {
            Logger.log(`Task title truncated from ${sanitized.length} to ${MAX_TITLE_LENGTH} characters`);
            return sanitized.substring(0, MAX_TITLE_LENGTH);
        }
        return sanitized;
    }

    private async getCredentials(): Promise<{ apiKey: string; token: string } | undefined> {
        const apiKey = await ProviderConfig.getProviderSetting<string>('trello', 'apiKey');
        const token = await this.context.secrets.get('codequeue.trelloToken');
        
        if (!apiKey || !token) {
            return undefined;
        }
        
        return { apiKey, token };
    }

    public async authenticate(): Promise<boolean> {
        const creds = await this.getCredentials();
        if (!creds) { return false; }

        try {
            const response = await fetch(
                `https://api.trello.com/1/members/me?key=${creds.apiKey}&token=${creds.token}`
            );
            return response.ok;
        } catch (e) {
            Logger.error('Trello authentication failed', e);
            return false;
        }
    }

    public async validateConfiguration(): Promise<boolean> {
        const creds = await this.getCredentials();
        const boardId = await ProviderConfig.getProviderSetting<string>('trello', 'boardId');
        const defaultListId = await ProviderConfig.getProviderSetting<string>('trello', 'defaultListId');
        return !!(creds && boardId && defaultListId);
    }

    public async getProjects(): Promise<ProjectOption[]> {
        const creds = await this.getCredentials();
        if (!creds) { return []; }

        try {
            const response = await fetch(
                `https://api.trello.com/1/members/me/boards?key=${creds.apiKey}&token=${creds.token}`
            );
            const boards = await response.json() as TrelloBoard[];
            
            return boards.map(board => ({
                id: board.id,
                label: `$(project) ${board.name}`,
                detail: 'Trello Board'
            }));
        } catch (e) {
            Logger.error('Failed to fetch Trello boards', e);
            return [];
        }
    }

    public async getStatuses(): Promise<StatusOption[]> {
        const creds = await this.getCredentials();
        const boardId = await ProviderConfig.getProviderSetting<string>('trello', 'boardId');
        
        if (!creds || !boardId) { return []; }

        try {
            const response = await fetch(
                `https://api.trello.com/1/boards/${boardId}/lists?key=${creds.apiKey}&token=${creds.token}`
            );
            const lists = await response.json() as TrelloList[];
            
            return lists.map(list => ({
                id: list.id,
                name: list.name,
                parentId: boardId
            }));
        } catch (e) {
            Logger.error('Failed to fetch Trello lists', e);
            return [];
        }
    }

    public async publishTasks(tasks: Task[]): Promise<Array<{ hash: string, itemId: string | undefined }>> {
        const results = await Promise.all(tasks.map(async (task) => {
            const itemId = await this.publishTask(task);
            return { hash: task.hash || '', itemId };
        }));
        return results;
    }

    public async publishTask(task: Task): Promise<string | undefined> {
        const creds = await this.getCredentials();
        const defaultListId = await ProviderConfig.getProviderSetting<string>('trello', 'defaultListId');

        if (!creds || !defaultListId) {
            Logger.error('Cannot publish: Missing Trello credentials or default list');
            return undefined;
        }

        try {
            Logger.log(`Publishing task "${task.title}" to Trello list ${defaultListId}...`);

            // Validate input
            const sanitizedTitle = this.validateTaskTitle(task.title);
            
            Logger.log(`Publishing task to Trello board`);
            const desc = `File: ${vscode.workspace.asRelativePath(task.file)}\nLine: ${task.line}\n\n${task.snippet || 'No snippet'}`;

            const response = await fetch(
                `https://api.trello.com/1/cards?key=${creds.apiKey}&token=${creds.token}&idList=${defaultListId}&name=${encodeURIComponent(sanitizedTitle)}&desc=${encodeURIComponent(desc)}&pos=top`,
                { method: 'POST' }
            );

            if (!response.ok) {
                throw new Error(`Trello API error: ${response.statusText}`);
            }

            const card = await response.json() as TrelloCard;
            Logger.log(`Successfully published task. Card ID: ${card.id}`);
            return card.id;
        } catch (error) {
            Logger.error(`Failed to publish task to Trello`, error);
            vscode.window.showErrorMessage(`CodeQueue: Failed to sync task "${task.title}". See output.`);
            return undefined;
        }
    }

    public async archiveTask(itemId: string): Promise<void> {
        const creds = await this.getCredentials();
        if (!creds) { return; }

        try {
            Logger.log(`Archiving Trello card ${itemId}...`);
            
            const params = new URLSearchParams({
                key: creds.apiKey,
                token: creds.token,
                closed: 'true'
            });

            const response = await fetch(
                `https://api.trello.com/1/cards/${itemId}?${params.toString()}`,
                { method: 'PUT' }
            );

            if (response.ok) {
                Logger.log(`Successfully archived card ${itemId}`);
            } else {
                throw new Error(`Trello API error: ${response.statusText}`);
            }
        } catch (error) {
            Logger.error(`Failed to archive Trello card`, error);
        }
    }
}
