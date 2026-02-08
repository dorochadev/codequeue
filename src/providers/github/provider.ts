
import { Octokit } from "@octokit/core";
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import { ProjectOption, StatusField, Task, StatusOption } from "../../types";
import { TaskProvider } from '../TaskProvider';
import { ProviderConfig } from '../ProviderConfig';

export class GitHubProvider implements TaskProvider {
    public readonly id = 'github';
    public readonly displayName = 'GitHub Projects';
    public readonly requiresAuthentication = true;
    private _octokit: Octokit | undefined;
    private _currentToken: string | undefined;

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

    private async getOctokit(): Promise<Octokit | undefined> {
        const token = await this.context.secrets.get('codequeue.githubToken');
        if (!token) { return undefined; }

        if (!this._octokit || this._currentToken !== token) {
            this._octokit = new Octokit({ auth: token });
            this._currentToken = token;
        }
        return this._octokit;
    }

    public async authenticate(): Promise<boolean> {
        const octokit = await this.getOctokit();
        if (!octokit) { return false; }
        try {
            await octokit.request('GET /user');
            return true;
        } catch (e) {
            Logger.error('GitHub authentication failed', e);
            return false;
        }
    }

    public async validateConfiguration(): Promise<boolean> {
        const token = await this.context.secrets.get('codequeue.githubToken');
        const projectId = await ProviderConfig.getProviderSetting<string>('github', 'projectId');
        return !!(token && projectId);
    }

    private async getBlameAuthor(filePath: string, line: number): Promise<string> {
        return new Promise((resolve) => {
            const cwd = path.dirname(filePath);
            // -L start,end : Blame specific line
            // --porcelain : Easy parsing
            cp.exec(`git blame -L ${line},${line} --porcelain "${path.basename(filePath)}"`, { cwd }, (err, stdout) => {
                if (err) {
                    // Fallback if not a git repo or other error
                    resolve('Unknown');
                    return;
                }
                
                // Parse porcelain output
                // author Name
                const match = stdout.match(/^author (.*)$/m);
                if (match && match[1]) {
                    resolve(match[1]);
                } else {
                    resolve('Unknown');
                }
            });
        });
    }

    /**
     * Publishes a draft issue to the GitHub Project.
     * Optionally moves it to a default status column if configured.
     */
    /**
     * Publishes multiple tasks in parallel.
     */
    public async publishTasks(tasks: Task[]): Promise<Array<{ hash: string, itemId: string | undefined }>> {
        const results = await Promise.all(tasks.map(async (task) => {
            const itemId = await this.publishTask(task);
            return { hash: task.hash || '', itemId };
        }));
        return results;
    }

    public async publishTask(task: Task): Promise<string | undefined> {
        const octokit = await this.getOctokit();
        const projectId = await ProviderConfig.getProviderSetting<string>('github', 'projectId');

        if (!octokit || !projectId) {
            Logger.error('Cannot publish: Missing token or Project ID');
            return undefined;
        }

        try {
            // Validate input
            const sanitizedTitle = this.validateTaskTitle(task.title);
            Logger.log(`Publishing task to GitHub Project`);

            // Process Body Template
            const defaultTemplate = 'From TODO in ${file}:${line}\n\n```${lang}\n${code_snippet}\n```';
            let template = vscode.workspace.getConfiguration().get('codequeue.taskBodyTemplate', defaultTemplate);
            
            // Unescape newlines (handle \n literals from JSON config)
            template = template.replace(/\\n/g, '\n');

            const fileExtension = task.file.split('.').pop() || '';
            const author = await this.getBlameAuthor(task.file, task.line);
            const codeSnippet = task.snippet || '// No code context available';

            const processedBody = template
                .replace(/\$\{file\}/g, vscode.workspace.asRelativePath(task.file))
                .replace(/\$\{line\}/g, task.line.toString())
                .replace(/\$\{code_snippet\}/g, codeSnippet)
                .replace(/\$\{lang\}/g, fileExtension)
                .replace(/\$\{author\}/g, author);

            const response: any = await octokit.graphql(`
            mutation($project:ID!, $title:String!, $body:String!) {
                addProjectV2DraftIssue(input:{
                projectId:$project,
                title:$title,
                body:$body
                }) {
                projectItem { id }
                }
            }
            `, {
                project: projectId,
                title: sanitizedTitle,
                body: processedBody
            });

            const newId = response.addProjectV2DraftIssue.projectItem.id;
            Logger.log(`Successfully published task. Item ID: ${newId}`);

            // Handle Default Status & Priority
            await this.applyDefaultFields(octokit, projectId, newId, task);

            return newId;
        } catch (error) {
            Logger.error(`Failed to publish task`, error);
            vscode.window.showErrorMessage(`CodeQueue: Failed to sync task "${task.title}". See output.`);
            return undefined;
        }
    }

    private async applyDefaultFields(octokit: Octokit, projectId: string, itemId: string, task: Task) {
        // 1. Status
        const statusSettings = await ProviderConfig.getProviderSetting<any>('github', 'statusSettings');
        if (statusSettings && statusSettings.fieldId && statusSettings.optionId) {
            Logger.log(`Setting status to "${statusSettings.name || 'Default'}"...`);
            await this.updateItemField(octokit, projectId, itemId, statusSettings.fieldId, statusSettings.optionId);
        }

        // 2. Priority (if matched)
        if (task.tag && task.tag !== 'general') {
            const prioritySettings = await ProviderConfig.getProviderSetting<any>('github', 'prioritySettings');
            if (prioritySettings && prioritySettings.options) {
                const match = prioritySettings.options.find((opt: any) => opt.name.toLowerCase() === task.tag!.toLowerCase());
                if (match) {
                    Logger.log(`Setting priority to "${match.name}"...`);
                    await this.updateItemField(octokit, projectId, itemId, prioritySettings.fieldId, match.id);
                }
            }
        }
    }

    private async updateItemField(octokit: Octokit, projectId: string, itemId: string, fieldId: string, optionId: string) {
        try {
            await octokit.graphql(`
            mutation($project:ID!, $itemId:ID!, $fieldId:ID!, $optionId:String!) {
                updateProjectV2ItemFieldValue(input:{
                    projectId: $project
                    itemId: $itemId
                    fieldId: $fieldId
                    value: { singleSelectOptionId: $optionId }
                }) {
                    projectV2Item { id }
                }
            }
            `, {
                project: projectId,
                itemId: itemId,
                fieldId: fieldId,
                optionId: optionId
            });
            Logger.log(`Field ${fieldId} updated.`);
        } catch (err) {
             Logger.error(`Failed to update field ${fieldId}`, err);
        }
    }

    public async archiveTask(itemId: string): Promise<void> {
        const octokit = await this.getOctokit();
        const projectId = await ProviderConfig.getProviderSetting<string>('github', 'projectId');
        
        if (!octokit || !projectId) { return; }

        try {
            Logger.log(`Archiving task item ${itemId}...`);
            await octokit.graphql(`
            mutation($project:ID!, $itemId:ID!) {
                archiveProjectV2Item(input:{
                    projectId: $project,
                    itemId: $itemId
                }) {
                    projectV2Item { id }
                }
            }
            `, {
                project: projectId,
                itemId: itemId
            });
            Logger.log(`Successfully archived task ${itemId}`);
        } catch (error) {
            Logger.error(`Failed to archive task`, error);
        }
    }

    public async getStatuses(): Promise<StatusOption[]> {
        const octokit = await this.getOctokit();
        const projectId = await ProviderConfig.getProviderSetting<string>('github', 'projectId');
        if (!octokit || !projectId) { return []; }

        try {
            const statusField = await this.fetchProjectStatuses(octokit, projectId);
            return statusField ? statusField.options.map((o: StatusOption) => ({ ...o, parentId: statusField.fieldId })) : [];
        } catch (e) {
            return [];
        }
    }

    public async getProjects(): Promise<ProjectOption[]> {
        return this.fetchProjects();
    }

    // Helper for config commands (public but specific to GitHub)
    public async fetchProjects(): Promise<ProjectOption[]> {
        const octokit = await this.getOctokit();
        if (!octokit) { return []; }

        const results: ProjectOption[] = [];
        try {
            // Fetch User and Org Projects (V2)
            const response: any = await octokit.graphql(`
                query {
                    viewer {
                        login
                        projectsV2(first: 20) {
                            nodes { id, title }
                        }
                        organizations(first: 20) {
                            nodes {
                                login
                                projectsV2(first: 20) {
                                    nodes { id, title }
                                }
                            }
                        }
                    }
                }
            `);

            // Process User Projects
            response.viewer.projectsV2?.nodes?.forEach((p: any) => {
                results.push({
                    label: `$(person) ${p.title}`,
                    id: p.id,
                    detail: `User: ${response.viewer.login}`
                });
            });

            // Process Org Projects
            response.viewer.organizations?.nodes?.forEach((org: any) => {
                org.projectsV2?.nodes?.forEach((p: any) => {
                    results.push({
                        label: `$(organization) ${p.title}`,
                        id: p.id,
                        detail: `Org: ${org.login}`
                    });
                });
            });

        } catch (error) {
            Logger.error('Failed to fetch projects', error);
            throw error;
        }

        return results;
    }

    public async fetchProjectStatuses(octokit: Octokit, projectId: string): Promise<StatusField | null> {
        try {
            const response: any = await octokit.graphql(`
                query($id: ID!) {
                    node(id: $id) {
                        ... on ProjectV2 {
                            fields(first: 20) {
                                nodes {
                                    ... on ProjectV2SingleSelectField {
                                        id, name
                                        options { id, name }
                                    }
                                }
                            }
                        }
                    }
                }
            `, { id: projectId });

            const fields = response.node.fields.nodes;
            const statusField = fields.find((f: any) => f.name === 'Status');
            return statusField ? { fieldId: statusField.id, options: statusField.options } : null;
        } catch (error) {
            Logger.error('Failed to fetch statuses', error);
            return null;
        }
    }
    
    // Public helper for priority syncing (specific to GitHub)
    public async fetchProjectPriorities(projectId: string): Promise<StatusField | null> {
        const octokit = await this.getOctokit();
        if (!octokit) { return null; }
        
        try {
             const response: any = await octokit.graphql(`
                query($id: ID!) {
                    node(id: $id) {
                        ... on ProjectV2 {
                            fields(first: 20) {
                                nodes {
                                    ... on ProjectV2SingleSelectField {
                                        id, name
                                        options { id, name }
                                    }
                                }
                            }
                        }
                    }
                }
            `, { id: projectId });

            const fields = response.node.fields.nodes;
            const priorityField = fields.find((f: any) => f.name === 'Priority');
            return priorityField ? { fieldId: priorityField.id, options: priorityField.options } : null;
        } catch (error) {
            Logger.error('Failed to fetch priorities', error);
            return null;
        }
    }
}

