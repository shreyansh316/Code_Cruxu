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

/** Presents a bounded snapshot of operational checks without exposing diagnostics detail. */
export class HealthStatusTreeProvider {
    constructor(readHealth) {
        if (typeof readHealth !== 'function') throw new TypeError('Health view requires a health snapshot function.');
        this.readHealth = readHealth;
        this._changeEmitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._changeEmitter.event;
    }

    refresh() { this._changeEmitter.fire(undefined); }
    dispose() { this._changeEmitter.dispose(); }

    getTreeItem(check) {
        const item = new vscode.TreeItem(`${check.label}: ${check.status}`, vscode.TreeItemCollapsibleState.None);
        item.id = `health:${check.id}`;
        item.description = check.detail;
        item.accessibilityInformation = { label: `${check.label}. ${check.status}. ${check.detail}` };
        item.contextValue = 'headroom.healthCheck';
        return item;
    }

    async getChildren(element) {
        if (element) return [];
        let checks;
        try { checks = await this.readHealth(); }
        catch { checks = unavailableHealth(); }
        if (!Array.isArray(checks) || checks.length !== 4) checks = unavailableHealth();
        return checks.map((check, index) => normalizeHealthCheck(check, index));
    }
}

function normalizeHealthCheck(value, index) {
    const check = value && typeof value === 'object' ? value : {};
    const labels = ['Database', 'Queue', 'AI provider', 'Verification'];
    const statuses = new Set(['HEALTHY', 'DEGRADED', 'READY', 'UNAVAILABLE', 'NOT_RUN', 'FAILED']);
    return Object.freeze({ id: ['database', 'queue', 'provider', 'verification'][index], label: labels[index],
        status: statuses.has(check.status) ? check.status : 'UNAVAILABLE',
        detail: typeof check.detail === 'string' ? check.detail.slice(0, 120) : 'Status unavailable.' });
}

function unavailableHealth() {
    return ['Database', 'Queue', 'AI provider', 'Verification'].map((label) => ({ status: 'UNAVAILABLE', detail: `${label} status unavailable.` }));
}

/** Register views that present existing repository records. */
export function registerStatusTreeViews(context, repositories, readHealth = unavailableHealth) {
    const objectives = new ObjectiveStatusTreeProvider(repositories.objectives);
    const tasks = new ActiveTaskTreeProvider(repositories.tasks);
    const health = new HealthStatusTreeProvider(readHealth);
    const disposables = [];
    try {
        disposables.push(objectives);
        disposables.push(vscode.window.registerTreeDataProvider(VIEWS.OBJECTIVES, objectives));
        disposables.push(tasks);
        disposables.push(vscode.window.registerTreeDataProvider(VIEWS.TASKS, tasks));
        disposables.push(health);
        disposables.push(vscode.window.registerTreeDataProvider(VIEWS.HEALTH, health));
        return { disposables, refresh: () => { objectives.refresh(); tasks.refresh(); health.refresh(); } };
    } catch (error) {
        for (const disposable of disposables.reverse()) {
            try { disposable.dispose(); } catch { /* Preserve the registration failure. */ }
        }
        throw error;
    }
}
