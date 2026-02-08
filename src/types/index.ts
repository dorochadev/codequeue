export interface TaskEntry {
    hash: string;
    itemId: string;
    file: string;
}

export interface Task {
    title: string;
    tag: string;
    file: string;
    line: number;
    hash?: string;
    snippet?: string;
}

export interface StatusOption {
    id: string;
    name: string;
    parentId?: string; // e.g. Field ID for GitHub
}

export interface StatusField {
    fieldId: string;
    options: StatusOption[];
}

export interface ProjectOption {
    label: string;
    id: string;
    detail: string;
}
