import { Task, StatusOption, ProjectOption } from '../types';

export interface TaskProvider {
    /**
     * Unique identifier for the provider (e.g., 'github', 'trello')
     */
    readonly id: string;

    /**
     * Display name for the provider (e.g., 'GitHub Projects', 'Trello')
     */
    readonly displayName: string;

    /**
     * Whether this provider requires authentication
     */
    readonly requiresAuthentication: boolean;

    /**
     * Authenticate the user.
     * Returns true if successful.
     */
    authenticate(): Promise<boolean>;

    /**
     * Validate that the provider is properly configured.
     * Returns true if all required settings are present.
     */
    validateConfiguration(): Promise<boolean>;

    /**
     * Publish a new task to the provider.
     * Returns the external ID of the created item.
     */
    publishTask(task: Task): Promise<string | undefined>;

    /**
     * Publish multiple tasks in a batch.
     * Returns an array of objects containing the task hash and the created item ID.
     */
    publishTasks(tasks: Task[]): Promise<Array<{ hash: string, itemId: string | undefined }>>;

    /**
     * Archive/Delete a task in the provider.
     */
    archiveTask(itemId: string): Promise<void>;

    /**
     * Get available statuses/columns for mapping.
     */
    getStatuses(): Promise<StatusOption[]>;

    /**
     * Get available projects/boards.
     */
    getProjects(): Promise<ProjectOption[]>;
}
