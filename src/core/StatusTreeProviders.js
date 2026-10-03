import * as vscode from 'vscode';
import { TaskStatus, VIEWS } from '../constants';
import { getMessage } from './messages';

const TERMINAL_TASK_STATUSES = new Set([
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
]);

/** Displays persisted objectives and their current lifecycle status. */
export class ObjectiveStatusTreeProvider {
    constructor(repository) {
        this.repository = repository;
        this._changeEmitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._changeEmitter.event;
    }

    refresh() { this._changeEmitter.fire(undefined); }
    dispose() { this._changeEmitter.dispose(); }

    getTreeItem(objective) {
        const item = new vscode.TreeItem(objective.title, vscode.TreeItemCollapsibleState.None);
        item.id = `objective:${objective.id}`;
        item.description = objective.status;
        item.accessibilityInformation = { label: `Objective: ${objective.title}. Status: ${objective.status}.` };
        item.contextValue = 'headroom.objective';
        return item;
    }

    getChildren(element) {
        if (element)
            return [];
        const objectives = this.repository.list();
        if (objectives.length === 0) {
            return [this._emptyState()];
        }
        return objectives;
    }

    _emptyState() {
        const label = getMessage('objectives.empty');
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.contextValue = 'headroom.empty';
        item.accessibilityInformation = { label: getMessage('objectives.empty.accessible') };
        return item;
    }
}

/** Displays persisted non-terminal tasks and their current lifecycle status. */
export class ActiveTaskTreeProvider {
    constructor(repository) {
        this.repository = repository;
        this._changeEmitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._changeEmitter.event;
    }

    refresh() { this._changeEmitter.fire(undefined); }
    dispose() { this._changeEmitter.dispose(); }

    getTreeItem(task) {
        const item = new vscode.TreeItem(task.title, vscode.TreeItemCollapsibleState.None);
        item.id = `task:${task.id}`;
        item.description = task.status;
        item.accessibilityInformation = { label: `Task: ${task.title}. Status: ${task.status}.` };
        item.contextValue = 'headroom.task';
        return item;
    }

    getChildren(element) {
        if (element)
            return [];
        const tasks = this.repository.list().filter((task) => !TERMINAL_TASK_STATUSES.has(task.status));
        if (tasks.length === 0) {
            const item = new vscode.TreeItem(getMessage('tasks.empty'), vscode.TreeItemCollapsibleState.None);
            item.contextValue = 'headroom.empty';
            item.accessibilityInformation = { label: getMessage('tasks.empty.accessible') };
            return [item];
        }
        return tasks;
    }
}

/** Register views that present existing repository records. */
export function registerStatusTreeViews(context, repositories) {
    const objectives = new ObjectiveStatusTreeProvider(repositories.objectives);
    const tasks = new ActiveTaskTreeProvider(repositories.tasks);
    const disposables = [
        vscode.window.registerTreeDataProvider(
            VIEWS.OBJECTIVES,
            objectives,
        ),
        vscode.window.registerTreeDataProvider(
            VIEWS.TASKS,
            tasks,
        ),
        objectives,
        tasks,
    ];
    context.subscriptions.push(...disposables);
    return { disposables, refresh: () => { objectives.refresh(); tasks.refresh(); } };
}
