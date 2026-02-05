import * as vscode from 'vscode';
import { TaskEntry, Task } from '../types';
import { hashTask } from '../utils/crypto';
import { GitHubService } from './githubService';
import { Logger } from '../utils/logger';

export class ScannerService {
    
    /**
     * Scans the document line-by-line for TODO comments.
     * Use line-by-line to avoid loading large files into memory at once.
     */
    public static async scanDocument(doc: vscode.TextDocument, context: vscode.ExtensionContext) {

        Logger.log(`Scanning ${doc.fileName}...`);
        
        const currentTasks: Task[] = [];
        const regex = /TODO(\((.*?)\))?:\s*(.+)/;

        // Scan for all TODOs using line iteration to save memory
        for (let i = 0; i < doc.lineCount; i++) {
            const line = doc.lineAt(i).text;
            const match = line.match(regex);
            
            if (!match) { continue; }

            let snippet = '';
            
            // Check Configuration
            const config = vscode.workspace.getConfiguration('codequeue');
            const enableSnippet = config.get<boolean>('enableSnippetExtraction', true);
            const maxLines = config.get<number>('snippetLineCount', 5);

            if (enableSnippet) {
                const matchIndex = match.index || 0;
                const preTodoContent = line.substring(0, matchIndex).trim();

                // Check if pre-content is actual code or just comment markers
                // We strip away common comment chars: / * # < ! - ; space
                const isCode = preTodoContent.replace(/[\s\/\#\*\<\!\-\;]/g, '').length > 0;

                if (isCode) {
                    // If there is code on the SAME line before the TODO, use that as the snippet
                    snippet = line;
                } else {
                    // Look ahead for next non-empty lines
                    let capturedLines = 0;
                    let foundStart = false;

                    for (let j = i + 1; j < doc.lineCount; j++) {
                        const lineText = doc.lineAt(j).text;
                        
                        if (!foundStart) {
                            if (lineText.trim().length === 0) continue; // Skip leading empty lines
                            foundStart = true;
                        }

                        if (foundStart) {
                            snippet += lineText + '\n';
                            capturedLines++;
                        }

                        if (capturedLines >= maxLines) {
                            snippet += '...';
                            break;
                        }

                        // Stop scanning if we can't find the start of code within 10 lines
                        if (!foundStart && j > i + 10) break;
                    }
                    // Trim the final newline if no ... was added, just to be clean
                    if (!snippet.endsWith('...')) {
                        snippet = snippet.trimEnd();
                    }
                }
            }

            const task: Task = {
                title: match[3].trim(),
                tag: match[2] || 'general',
                file: doc.fileName,
                line: i + 1,
                snippet: snippet
            };

            // Use independent hash (no line number involved)
            task.hash = hashTask(task);
            currentTasks.push(task);
        }

        Logger.log(`Found ${currentTasks.length} TODOs.`);

        await this.reconcileState(doc, currentTasks, context);
    }

    private static async reconcileState(doc: vscode.TextDocument, currentTasks: Task[], context: vscode.ExtensionContext) {
        // Retrieve State
        let storedTasks = context.globalState.get<any[]>('codequeue.tasks') || [];
        // Migration: Ensure typed properties
        const validStoredTasks: TaskEntry[] = storedTasks.filter(t => typeof t === 'object' && t.itemId);

        // Filter tasks related to THIS file for comparison
        const storedFileTasks = validStoredTasks.filter(t => t.file === doc.fileName);
        let stateChanged = false;

        // Verify Init Credentials
        const token = await context.secrets.get('codequeue.githubToken');
        const projectId = vscode.workspace.getConfiguration().get<string>('codequeue.projectId');

        if (!token || !projectId) {
            // Logger.log("Skipping sync - credentials missing");
            // If we don't return here, we might just track them locally?
            // in future we might add support for other kanban services like linear, trello, clickup, notion
            return; 
        }

        // Process New Tasks (Add)
        for (const task of currentTasks) {
            // Check if this hash is already tracked for this file
            if (!storedFileTasks.find(s => s.hash === task.hash)) {
                Logger.log(`New task detected: "${task.title}"`);
                
                const itemId = await GitHubService.publishTask(task, token, projectId);
                
                if (itemId) {
                    if (task.hash) {
                         validStoredTasks.push({ hash: task.hash, itemId, file: doc.fileName });
                         stateChanged = true;
                    }
                }
            }
        }

        // Process Deleted Tasks (Archive)
        // Check every task we knew about in this file. Is it still there?
        for (const stored of storedFileTasks) {
            if (!currentTasks.find(c => c.hash === stored.hash)) {
                Logger.log(`Task removed from file, archiving: ${stored.hash}`);
                
                await GitHubService.archiveTask(stored.itemId, token, projectId);
                
                // Remove from local state
                const idx = validStoredTasks.findIndex(x => x.itemId === stored.itemId);
                if (idx > -1) {
                    validStoredTasks.splice(idx, 1);
                    stateChanged = true;
                }
            }
        }

        // Update Global State
        if (stateChanged) {
            await context.globalState.update('codequeue.tasks', validStoredTasks);
            Logger.log("Extension state updated.");
        }
    }
}
