import { Octokit } from "@octokit/core";
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ProjectOption, StatusField, Task } from "../types";

export class GitHubService {
    
    private static _octokit: Octokit | undefined;
    private static _currentToken: string | undefined;

    private static getOctokit(token: string): Octokit {
        if (!this._octokit || this._currentToken !== token) {
            this._octokit = new Octokit({ auth: token });
            this._currentToken = token;
        }
        return this._octokit;
    }

    /**
     * Publishes a draft issue to the GitHub Project.
     * Optionally moves it to a default status column if configured.
     */
    public static async publishTask(task: Task, token: string, projectId: string): Promise<string | undefined> {
        const octokit = this.getOctokit(token);

        try {
            Logger.log(`Publishing task "${task.title}" to project ${projectId}...`);
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
                title: task.title,
                body: `From TODO in ${task.file}:${task.line}`
            });

            const newId = response.addProjectV2DraftIssue.projectItem.id;
            Logger.log(`Successfully published task. Item ID: ${newId}`);

            // Handle Default Status
            await this.applyDefaultStatus(octokit, projectId, newId);

            return newId;
        } catch (error) {
            Logger.error(`Failed to publish task`, error);
            vscode.window.showErrorMessage(`CodeQueue: Failed to sync task "${task.title}". See output.`);
            return undefined;
        }
    }

    private static async applyDefaultStatus(octokit: Octokit, projectId: string, itemId: string) {
        const statusSettings = vscode.workspace.getConfiguration().get<any>('codequeue.statusSettings');
        if (statusSettings && statusSettings.fieldId && statusSettings.optionId) {
            try {
                Logger.log(`Setting status to "${statusSettings.name || 'Default'}"...`);
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
                    fieldId: statusSettings.fieldId,
                    optionId: statusSettings.optionId
                });
                Logger.log(`Status updated.`);
            } catch (err) {
                 Logger.error(`Failed to set status`, err);
            }
        }
    }

    public static async archiveTask(itemId: string, token: string, projectId: string) {
        const octokit = this.getOctokit(token);
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

    public static async fetchProjects(token: string): Promise<ProjectOption[]> {
        const octokit = this.getOctokit(token);
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

    public static async fetchProjectStatuses(token: string, projectId: string): Promise<StatusField | null> {
        const octokit = this.getOctokit(token);
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

            if (statusField) {
                return {
                    fieldId: statusField.id,
                    options: statusField.options
                };
            }
            return null;

        } catch (error) {
            Logger.error('Failed to fetch statuses', error);
            return null;
        }
    }
}
