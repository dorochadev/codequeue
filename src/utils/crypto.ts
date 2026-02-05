import * as crypto from 'crypto';
import { Task } from '../types';

/**
 * Generates a unique hash for a task based on its file path, tag, and title.
 * Line number is EXCLUDED to allow tasks to move within the file without changing identity.
 * 
 * @param task The task object to hash
 * @returns MD5 hex string
 */
export function hashTask(task: Pick<Task, 'file' | 'tag' | 'title'>): string {
    return crypto.createHash('md5')
        .update(task.file + task.tag + task.title)
        .digest('hex');
}
