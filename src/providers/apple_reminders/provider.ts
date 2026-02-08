import * as vscode from 'vscode';
import * as cp from 'child_process';
import { TaskProvider } from '../TaskProvider';
import { Task, ProjectOption, StatusOption } from '../../types';
import { Logger } from '../../utils/logger';
import { ProviderConfig } from '../ProviderConfig';

export class AppleRemindersProvider implements TaskProvider {
    public readonly id = 'apple_reminders';
    public readonly displayName = 'Apple Reminders';
    public readonly requiresAuthentication = false;

    /**
     * Escapes special characters in strings for safe use in AppleScript.
     * Prevents AppleScript injection attacks.
     */
    private escapeAppleScript(str: string): string {
        return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    /**
     * Validates and sanitizes task title to prevent injection and ensure reasonable length.
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

    public async authenticate(): Promise<boolean> {
        // No auth needed for local AppleScript, but we can check if Reminders is accessible
        return true;
    }

    public async validateConfiguration(): Promise<boolean> {
        const listName = await ProviderConfig.getProviderSetting<string>('apple_reminders', 'listName');
        return !!listName;
    }

    public async getProjects(): Promise<ProjectOption[]> {
        const script = `tell application "Reminders" to get name of every list`;
        try {
            const result = await this.runAppleScript(script);
            const lists = result.split(',').map(s => s.trim());
            return lists.map(l => ({
                id: l,
                label: `$(list-unordered) ${l}`,
                detail: 'Reminders List',
                description: 'Apple Reminders'
            }));
        } catch (e) {
            Logger.error('Failed to fetch Reminders lists', e);
            return [];
        }
    }

    public async getStatuses(): Promise<StatusOption[]> {
        // Reminders doesn't have statuses/columns like Kanban
        return [{ id: 'default', name: 'Default', parentId: '' }];
    }

    public async publishTasks(tasks: Task[]): Promise<Array<{ hash: string, itemId: string | undefined }>> {
        if (tasks.length === 0) { return []; }
        
        // Use Promise.all to run tasks in parallel (concurrently) rather than a single serial script
        const results = await Promise.all(tasks.map(async (task) => {
            const itemId = await this.publishTask(task);
            return { hash: task.hash || '', itemId };
        }));
        
        return results;
    }

    public async publishTask(task: Task): Promise<string | undefined> {
        const listName = await ProviderConfig.getProviderSetting<string>('apple_reminders', 'listName');
        if (!listName) {
            Logger.error('Cannot publish: No Reminders list configured');
            return undefined;
        }

        try {
            // Validate and sanitize inputs
            const sanitizedTitle = this.validateTaskTitle(task.title);
            const escapedTitle = this.escapeAppleScript(sanitizedTitle);
            const escapedListName = this.escapeAppleScript(listName);

            Logger.log(`Publishing task to Reminders list`);
            const script = `
tell application "Reminders"
    tell list "${escapedListName}"
        make new reminder with properties {name:"${escapedTitle}"}
    end tell
end tell
            `;
            const result = await this.runAppleScript(script);
            Logger.log(`Successfully published task to Reminders`);
            return result || 'reminder-created';
        } catch (error) {
            Logger.error(`Failed to publish task to Reminders`, error);
            vscode.window.showErrorMessage(`CodeQueue: Failed to sync task to Reminders. See output.`);
            return undefined;
        }
    }

    public async archiveTask(itemId: string): Promise<void> {
        const listName = await ProviderConfig.getProviderSetting<string>('apple_reminders', 'listName');
        if (!listName) { return; }
        
        try {
            const escapedListName = this.escapeAppleScript(listName);
            const escapedItemId = this.escapeAppleScript(itemId);

            Logger.log(`Archiving reminder from list`);
            const script = `
tell application "Reminders"
    tell list "${escapedListName}"
        set theReminder to first reminder whose name is "${escapedItemId}"
        set completed of theReminder to true
    end tell
end tell
            `;
            await this.runAppleScript(script);
            Logger.log(`Successfully archived reminder`);
        } catch (error) {
            Logger.error(`Failed to archive reminder`, error);
        }
    }

    private runAppleScript(script: string): Promise<string> {
        Logger.log(`Executing AppleScript: ${script.trim().replace(/\s+/g, ' ').substring(0, 100)}...`);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('AppleScript timed out (Check macOS privacy permissions for VS Code)'));
            }, 10000); // 10s timeout

            cp.exec(`osascript -e '${script}'`, (err, stdout, stderr) => {
                clearTimeout(timeout);
                if (err) { 
                    Logger.error('AppleScript execution failed', stderr);
                    return reject(stderr); 
                }
                Logger.log(`AppleScript success. Output: ${stdout.trim()}`);
                resolve(stdout);
            });
        });
    }
}
