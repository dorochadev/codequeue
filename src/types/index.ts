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
}

export interface StatusOption {
    id: string;
    name: string;
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
